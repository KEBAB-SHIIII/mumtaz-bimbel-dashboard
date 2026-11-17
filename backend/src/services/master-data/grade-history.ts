import { createHash } from 'node:crypto';
import { asc, eq, sql, type SQL } from 'drizzle-orm';
import { Decimal } from 'decimal.js';
import { todayInBusinessTimeZone, type GradeChangeRequest, type GradeChangePreview } from '@mumtaz/contracts';
import type { DbOrTx } from '../../db/client.js';
import { lessonSessions, studentGradeAudit, studentGradeHistory, students, users } from '../../db/schema.js';
import { conflict, notFound, validationFailed } from '../../lib/http-error.js';
import { HOURLY_RATE_BY_TIER, gradeTier, durationMultiplier } from '../billing/tariff.js';
import type { ServiceContext } from '../context.js';

export const BASELINE_DATE = '0001-01-01';
export function gradeAtDate(date: string | SQL): SQL<string> {
  return sql<string>`coalesce((select gh.grade from student_grade_history gh where gh.student_id = ${sql.raw('"students"."id"')} and gh.effective_from <= ${date}::date order by gh.effective_from desc limit 1), ${students.grade})`;
}
export const currentGrade = (now: Date) => gradeAtDate(todayInBusinessTimeZone(now));
export const hourlyFor = (grade: string) => { const tier = gradeTier(grade); return tier ? String(HOURLY_RATE_BY_TIER[tier]) : null; };

/** Lock the student before inserting/editing a session, so a class correction cannot miss it. */
export async function lessonBasis(db: DbOrTx, studentId: string, date: string) {
  const [row] = await db.select({ grade: gradeAtDate(date) }).from(students).where(eq(students.id, studentId)).for('update').limit(1);
  if (!row) throw notFound('Siswa');
  return { grade_snapshot: row.grade, grade_source: 'history', hourly_rate_snapshot: hourlyFor(row.grade) };
}

export async function getGradeHistory(ctx: ServiceContext, studentId: string) {
  const [student] = await ctx.db.select().from(students).where(eq(students.id, studentId));
  if (!student) throw notFound('Siswa');
  const entries = await ctx.db.select({
    id: studentGradeHistory.id, grade: studentGradeHistory.grade, effective_from: studentGradeHistory.effective_from,
    reason: studentGradeHistory.reason, changed_by_name: users.full_name, updated_at: studentGradeHistory.updated_at,
  }).from(studentGradeHistory).leftJoin(users, eq(users.id, studentGradeHistory.changed_by))
    .where(eq(studentGradeHistory.student_id, studentId)).orderBy(asc(studentGradeHistory.effective_from));
  const audit = await ctx.db.select({ id: studentGradeAudit.id, reason: studentGradeAudit.reason,
    changed_by_name: users.full_name, created_at: studentGradeAudit.created_at,
  }).from(studentGradeAudit).innerJoin(users, eq(users.id, studentGradeAudit.changed_by))
    .where(eq(studentGradeAudit.student_id, studentId)).orderBy(asc(studentGradeAudit.created_at));
  return { entries: entries.map(r => ({ ...r, updated_at: r.updated_at.toISOString() })), audit: audit.map(r => ({ ...r, created_at: r.created_at.toISOString() })) };
}

export async function changeGrade(ctx: ServiceContext, studentId: string, input: GradeChangeRequest, apply?: { token: string; userId: string }): Promise<GradeChangePreview> {
  return ctx.db.transaction(async tx => {
    const [student] = await tx.select().from(students).where(eq(students.id, studentId)).for('update').limit(1);
    if (!student) throw notFound('Siswa');
    const history = await tx.select().from(studentGradeHistory).where(eq(studentGradeHistory.student_id, studentId)).orderBy(asc(studentGradeHistory.effective_from));
    const previous = input.history_id ? history.find(h => h.id === input.history_id) : history.find(h => h.effective_from === input.effective_from);
    if (input.history_id && !previous) throw notFound('Riwayat kelas');
    if (previous?.effective_from === BASELINE_DATE) throw conflict('Kelas awal dipertahankan. Tambahkan koreksi bertanggal untuk sesi yang terdampak.');
    if (history.some(h => h.id !== previous?.id && h.effective_from === input.effective_from)) {
      throw validationFailed([{ field: 'effective_from', message: 'Sudah ada perubahan pada tanggal ini. Koreksi riwayat yang ada.' }]);
    }
    const before = history.length ? history : [{ grade: student.grade, effective_from: BASELINE_DATE }];
    const after = [...history.filter(h => h.id !== previous?.id), ...(history.length ? [] : before), input]
      .sort((a,b) => a.effective_from.localeCompare(b.effective_from));
    const at = (timeline: {grade: string; effective_from: string}[], date: string) => [...timeline].reverse().find(h => h.effective_from <= date)?.grade ?? student.grade;
    const rows = await tx.select().from(lessonSessions).where(eq(lessonSessions.student_id, studentId)).orderBy(asc(lessonSessions.id)).for('update');
    const impacted = rows.filter(r => at(before, r.lesson_date) !== at(after, r.lesson_date));
    const changes = impacted.map(r => {
      const grade = at(after, r.lesson_date);
      const hourly = hourlyFor(grade);
      const amount = r.status === 'approved' && hourly !== null ? new Decimal(hourly).mul(durationMultiplier(r.duration_minutes)).toFixed(2) : null;
      const oldNet = r.rate_amount_snapshot !== null && r.admin_fee_snapshot !== null ? new Decimal(r.rate_amount_snapshot).minus(r.admin_fee_snapshot).toFixed(2) : null;
      const newNet = amount !== null && r.admin_fee_snapshot !== null ? new Decimal(amount).minus(r.admin_fee_snapshot).toFixed(2) : null;
      return { id:r.id, lesson_date:r.lesson_date, status:r.status, previous_grade:r.grade_snapshot ?? at(before,r.lesson_date), new_grade:grade,
        old_amount:r.rate_amount_snapshot, new_amount:amount, old_net:oldNet, new_net:newNet };
    });
    const delta = (oldKey: 'old_amount'|'old_net', newKey: 'new_amount'|'new_net') => changes.reduce((sum,c) => sum.plus(c[newKey] ?? 0).minus(c[oldKey] ?? 0), new Decimal(0)).toFixed(2);
    // Includes rows/versions, actor-independent payload and student ID: no stale or cross-student confirmations.
    const token = createHash('sha256').update(JSON.stringify({student, history, rows, input})).digest('hex');
    const preview = { preview_token: token, previous_grade: at(before,input.effective_from), new_grade:input.grade,
      previous_hourly_rate:hourlyFor(at(before,input.effective_from)), new_hourly_rate:hourlyFor(input.grade),
      affected_sessions:changes, billing_delta:delta('old_amount','new_amount'), tutor_net_delta:delta('old_net','new_net') };
    if (!apply) return preview;
    if (apply.token !== token) throw conflict('Data berubah sejak preview. Tinjau dampak terbaru sebelum menyimpan.');
    if (!history.length) await tx.insert(studentGradeHistory).values({student_id:studentId,grade:student.grade,effective_from:BASELINE_DATE,reason:'Kelas awal dari data master'});
    const values = { grade:input.grade, effective_from:input.effective_from, reason:input.reason, changed_by:apply.userId, updated_at:ctx.now() };
    if (previous) await tx.update(studentGradeHistory).set(values).where(eq(studentGradeHistory.id,previous.id));
    else await tx.insert(studentGradeHistory).values({...values, student_id:studentId});
    for (const change of changes) {
      await tx.update(lessonSessions).set({ grade_snapshot:change.new_grade, grade_source:'history', hourly_rate_snapshot:hourlyFor(change.new_grade),
        rate_amount_snapshot:change.new_amount, updated_at:ctx.now(),
      }).where(eq(lessonSessions.id,change.id));
    }
    await tx.insert(studentGradeAudit).values({student_id:studentId,changed_by:apply.userId,reason:input.reason,
      details:{previous:previous ?? null,change:input,affected_sessions:changes,billing_delta:preview.billing_delta,tutor_net_delta:preview.tutor_net_delta},created_at:ctx.now()});
    return preview;
  });
}
