import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { STUDENT_IDS, TUTOR_IDS, SUBJECT_IDS, USER_IDS, SESSION_IDS } from '@mumtaz/contracts/fixtures';
import { lessonSessions, studentGradeAudit, studentGradeHistory } from '../src/db/schema.js';
import { createTestDatabase } from './helpers/test-db.js';
import { seedSyntheticData } from './helpers/seed.js';
import { changeGrade, getGradeHistory } from '../src/services/master-data/grade-history.js';
import { getStudent, updateStudent } from '../src/services/master-data/students.js';
import { adminCreateAttendance, adminUpdateAttendance, setAttendanceValidity, getAdminAttendanceDetail, listAttendanceOptions } from '../src/services/attendance/attendance-service.js';
import { getBilling } from '../src/services/billing/billing-service.js';
import { analyzeSession } from '../src/services/anomaly/anomaly-service.js';
import { createLogger } from '../src/lib/logger.js';
import type { ServiceContext } from '../src/services/context.js';
import { FakeAnomalyDetector } from './fakes/fake-anomaly-detector.js';

let handle: Awaited<ReturnType<typeof createTestDatabase>>;
let ctx:ServiceContext;
const studentId=STUDENT_IDS.murid1;
const input={grade:'4 SD' as const,effective_from:'2026-11-01',reason:'Kenaikan kelas'};
const payload=(date:string)=>({tutor_id:TUTOR_IDS.tutorA,student_id:studentId,subject_ids:[SUBJECT_IDS.matematika],lesson_date:date,start_time:'10:00',end_time:'11:00',learning_material:'Latihan'});
const approve=(id:string)=>setAttendanceValidity(ctx,USER_IDS.admin,id,{validity:'valid'});
beforeAll(async()=>{
 handle=await createTestDatabase();
 await seedSyntheticData(handle.db,{adminPassword:'SecretTest123!',tutorPassword:'SecretTest123!',parentAccessCodePepper:'test-pepper'});
 ctx={db:handle.db,now:()=>new Date('2026-11-15T03:00:00Z'),parentAccessCodePepper:'test-pepper',attendance:{maxDurationMinutes:720}};
});
afterAll(()=>handle.close());

describe('dated class history',()=>{
 it('previews money impact, applies atomically and rejects stale/replayed confirmation',async()=>{
  const before=await handle.db.select().from(lessonSessions);
  const preview=await changeGrade(ctx,studentId,input);
  expect(preview.affected_sessions.map(s=>s.id)).toContain(SESSION_IDS.s06);
  expect(preview.billing_delta).toBe('30000.00');
  expect(await handle.db.select().from(lessonSessions)).toEqual(before);
  await changeGrade(ctx,studentId,input,{token:preview.preview_token,userId:USER_IDS.admin});
  expect((await getStudent(ctx,studentId)).grade).toBe('4 SD');
  const old=await getAdminAttendanceDetail(ctx,SESSION_IDS.s01);
  expect(old.grade).toBe('3 SD');
  expect(Number(old.gross_amount)).toBe(90000);
  const recent=await getAdminAttendanceDetail(ctx,SESSION_IDS.s06);
  expect(recent.grade).toBe('4 SD');
  expect(Number(recent.gross_amount)).toBe(120000);
  expect(Number(recent.admin_fee)).toBe(20000);
  await expect(changeGrade(ctx,studentId,input,{token:preview.preview_token,userId:USER_IDS.admin})).rejects.toThrow();
  expect(await handle.db.select().from(studentGradeAudit)).toHaveLength(1);
 });
 it('late entry, approval and duration edits use class on lesson date; notes preserve amounts',async()=>{
  const old=await adminCreateAttendance(ctx,payload('2026-10-25'));
  await approve(old.id);
  const approved=await getAdminAttendanceDetail(ctx,old.id);
  expect(approved.grade).toBe('3 SD');expect(Number(approved.gross_amount)).toBe(60000);
  await adminUpdateAttendance(ctx,old.id,{...payload('2026-10-25'),learning_material:'Catatan baru'});
  expect((await getAdminAttendanceDetail(ctx,old.id)).gross_amount).toBe(approved.gross_amount);
  await adminUpdateAttendance(ctx,old.id,{...payload('2026-10-25'),end_time:'11:30'});
  expect(Number((await getAdminAttendanceDetail(ctx,old.id)).gross_amount)).toBe(90000);
  await adminUpdateAttendance(ctx,old.id,payload('2026-11-02'));
  expect(Number((await getAdminAttendanceDetail(ctx,old.id)).gross_amount)).toBe(80000);
 });
 it('scheduled grade changes take effect by WIB date without a scheduler; options follow selected date',async()=>{
  const scheduled={grade:'5 SD' as const,effective_from:'2026-12-01',reason:'Jadwal kenaikan'};
  const preview=await changeGrade(ctx,studentId,scheduled);
  expect(preview.affected_sessions).toHaveLength(0);
  await changeGrade(ctx,studentId,scheduled,{token:preview.preview_token,userId:USER_IDS.admin});
  expect((await getStudent(ctx,studentId))).toMatchObject({grade:'4 SD',scheduled_grade:{grade:'5 SD',effective_from:'2026-12-01'}});
  expect((await getStudent({...ctx,now:()=>new Date('2026-11-30T17:00:00Z')},studentId)).grade).toBe('5 SD');
  expect((await listAttendanceOptions(ctx,'2026-10-01')).students.find(s=>s.id===studentId)?.grade).toBe('3 SD');
 });
 it('correction of effective date restores old interval and updates pending basis, including AI approval',async()=>{
  const pending=await adminCreateAttendance(ctx,payload('2026-11-04'));
  const entry=(await getGradeHistory(ctx,studentId)).entries.find(h=>h.effective_from==='2026-11-01');
  if (!entry) throw new Error('Missing history');
  const correction={...input,history_id:entry.id,effective_from:'2026-11-05',reason:'Tanggal sebelumnya salah'};
  const preview=await changeGrade(ctx,studentId,correction);
  await changeGrade(ctx,studentId,correction,{token:preview.preview_token,userId:USER_IDS.admin});
  const saved=await getAdminAttendanceDetail(ctx,pending.id);
  expect(saved.grade).toBe('3 SD');expect(saved.gross_amount).toBeNull();
  await analyzeSession({db:handle.db,detector:new FakeAnomalyDetector(),config:{durationOutlierMinutes:180,durationMinMinutes:30,lateStartAfter:'21:00',earlyStartBefore:'07:00'},timeoutMs:2000,logger:createLogger({silent:true})},pending.id);
  expect(Number((await getAdminAttendanceDetail(ctx,pending.id)).gross_amount)).toBe(60000);
 });
 it('preview is rejected when an affected session changes, and direct master grade edits cannot bypass history',async()=>{
  const correction={grade:'6 SD' as const,effective_from:'2026-11-10',reason:'Koreksi'};
  const preview=await changeGrade(ctx,studentId,correction);
  await adminCreateAttendance(ctx,payload('2026-11-11'));
  await expect(changeGrade(ctx,studentId,correction,{token:preview.preview_token,userId:USER_IDS.admin})).rejects.toThrow('Data berubah');
  await expect(updateStudent(ctx,studentId,{grade:'6 SD'})).rejects.toThrow();
  expect((await handle.db.select().from(studentGradeHistory).where(eq(studentGradeHistory.student_id,studentId))).some(h=>h.grade==='6 SD')).toBe(false);
 });
 it('mixed-class billing exposes each line class and sums stored amounts',async()=>{
  const fresh=await adminCreateAttendance(ctx,payload('2026-11-12'));await approve(fresh.id);
  const bill=await getBilling(ctx,{period:'2026-11',student_id:studentId});
  expect(new Set((bill.students[0]?.lines ?? []).map(l=>l.grade))).toEqual(new Set(['3 SD','4 SD']));
  expect(Number(bill.total_amount)).toBe((bill.students[0]?.lines ?? []).reduce((sum,line)=>sum+Number(line.amount),0));
 });
 it('saving the same effective date updates its entry and keeps an audit trail',async()=>{
  const before=await getGradeHistory(ctx,studentId);
  const entry=before.entries.find(h=>h.effective_from==='2026-12-01');
  if (!entry) throw new Error('Missing scheduled entry');
  const replacement={grade:'6 SD' as const,effective_from:'2026-12-01',reason:'Memperbaiki salah pilih kelas'};
  const preview=await changeGrade(ctx,studentId,replacement);
  await changeGrade(ctx,studentId,replacement,{token:preview.preview_token,userId:USER_IDS.admin});
  const after=await getGradeHistory(ctx,studentId);
  expect(after.entries).toHaveLength(before.entries.length);
  expect(after.entries.find(h=>h.id===entry.id)?.grade).toBe('6 SD');
  expect(after.audit).toHaveLength(before.audit.length+1);
  await expect(changeGrade(ctx,studentId,replacement,{token:preview.preview_token,userId:USER_IDS.admin})).rejects.toThrow('Data berubah');
 });

});
