import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SHEET_EXPORT_HEADERS,
  anomalyAnalysisResultSchema,
  anomalyAnalysisStatusSchema,
  anomalyReviewStatusSchema,
  formatSheetDate,
  formatSheetDuration,
  isDateInPeriod,
  isoDateSchema,
  sessionStatusSchema,
  sheetExportRowSchema,
  timestampSchema,
  uuidSchema,
  type SheetExportRow,
} from '../src/index.js';
import {
  EXPECTED_EXPORT_ROWS_2026_10,
  EXPECTED_EXPORT_SESSION_ORDER_2026_10,
  EXPECTED_FAKE_DETECTOR_FINDINGS_2026_10,
  EXPECTED_PAYROLL_2026_10,
  EXPECTED_SESSION_IDS_BY_PERIOD,
  TEST_ONLY_CREDENTIALS,
  fixtureAnomalyFlags,
  fixtureParentStudents,
  fixtureSessions,
  fixtureStudents,
  fixtureSubjects,
  fixtureTutors,
  fixtureUsers,
  resolveFixtureSession,
} from '../src/fixtures/index.js';

const examplesDir = new URL('../../../examples/', import.meta.url);
const readExample = (name: string) => readFileSync(new URL(name, examplesDir), 'utf8');

describe('examples/seed-data.json selaras dengan fixtures', () => {
  const seed = JSON.parse(readExample('seed-data.json')) as Record<string, unknown> & {
    users: Record<string, unknown>[];
    development_auth_fixtures: { parent_access_codes: Record<string, string> };
  };

  it('ditandai sintetis', () => {
    expect(String(seed.warning)).toMatch(/SYNTHETIC/);
  });

  it('master data identik (users tanpa catatan credential_setup)', () => {
    expect(seed.users.map(({ credential_setup: _note, ...user }) => user)).toEqual(fixtureUsers);
    expect(seed.tutors).toEqual(fixtureTutors);
    expect(seed.students).toEqual(fixtureStudents);
    expect(seed.parent_students).toEqual(fixtureParentStudents);
    expect(seed.subjects).toEqual(fixtureSubjects);
    expect(seed.development_auth_fixtures.parent_access_codes).toEqual(TEST_ONLY_CREDENTIALS.parentAccessCodes);
  });

  it('tidak menyimpan password atau hash', () => {
    expect(readExample('seed-data.json')).not.toMatch(/password_hash|"password"\s*:/);
  });
});

describe('integritas fixtures', () => {
  const ids = [
    ...fixtureUsers, ...fixtureTutors, ...fixtureStudents, ...fixtureSubjects,
    ...fixtureSessions, ...fixtureAnomalyFlags,
  ].map((row) => row.id);

  it('semua ID adalah UUID unik (no ekspor bukan primary key)', () => {
    for (const id of ids) expect(uuidSchema.safeParse(id).success).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('kredensial sesuai role: admin/tutor punya username, parent tidak', () => {
    for (const user of fixtureUsers) {
      if (user.role === 'parent') {
        expect(user.username).toBeNull();
        expect(TEST_ONLY_CREDENTIALS.parentAccessCodes).toHaveProperty(user.id);
      } else {
        expect(user.username).toBeTruthy();
      }
    }
  });

  it('relasi parent-anak hanya ke user role parent dan siswa yang ada', () => {
    for (const link of fixtureParentStudents) {
      expect(fixtureUsers.find((u) => u.id === link.parent_user_id)?.role).toBe('parent');
      expect(fixtureStudents.some((s) => s.id === link.student_id)).toBe(true);
    }
  });

  it('baris sesi memenuhi enum/format ERD dan aturan snapshot', () => {
    for (const session of fixtureSessions) {
      resolveFixtureSession(session);
      expect(isoDateSchema.safeParse(session.lesson_date).success).toBe(true);
      expect(sessionStatusSchema.safeParse(session.status).success).toBe(true);
      expect(anomalyAnalysisStatusSchema.safeParse(session.anomaly_analysis_status).success).toBe(true);
      expect(timestampSchema.safeParse(session.submitted_at).success).toBe(true);
      // Snapshot tarif hanya ada pada sesi approved.
      expect(session.rate_amount_snapshot !== null).toBe(session.status === 'approved');
      // Revisi/penolakan wajib punya alasan.
      if (session.status === 'revision_requested' || session.status === 'rejected') {
        expect(session.admin_note).toBeTruthy();
      }
      if (session.status === 'pending') {
        expect(session.reviewed_by_user_id).toBeNull();
      }
    }
    expect(new Set(fixtureSessions.map((s) => s.status))).toEqual(
      new Set(['pending', 'approved', 'revision_requested', 'rejected']),
    );
  });

  it('finding anomali memakai review_status valid dan tidak mengubah status sesi', () => {
    for (const flag of fixtureAnomalyFlags) {
      expect(anomalyReviewStatusSchema.safeParse(flag.review_status).success).toBe(true);
      expect(fixtureSessions.some((s) => s.id === flag.lesson_session_id)).toBe(true);
    }
    // s09 punya finding duplikasi tetapi tetap `pending` — keputusan di tangan Admin.
    const s09 = fixtureSessions.find((s) => s.id === fixtureAnomalyFlags[0]?.lesson_session_id);
    expect(s09?.status).toBe('pending');
  });
});

describe('expected outcomes', () => {
  it('filter periode berbasis lesson_date, bukan submitted_at', () => {
    for (const [period, expected] of Object.entries(EXPECTED_SESSION_IDS_BY_PERIOD)) {
      const actual = fixtureSessions.filter((s) => isDateInPeriod(s.lesson_date, period)).map((s) => s.id);
      expect(actual.sort()).toEqual([...expected].sort());
    }
    // s05: lesson_date 31 Okt, disubmit November → tetap Oktober.
    const s05 = fixtureSessions.find((s) => s.lesson_date === '2026-10-31');
    expect(s05?.submitted_at.startsWith('2026-11')).toBe(true);
    expect(EXPECTED_SESSION_IDS_BY_PERIOD['2026-10']).toContain(s05?.id);
  });

  it('ekspor Oktober: semua status, delapan kolom, urutan stabil, no 1..N', () => {
    const resolved = fixtureSessions
      .filter((s) => isDateInPeriod(s.lesson_date, '2026-10'))
      .map(resolveFixtureSession)
      .sort((a, b) =>
        a.session.lesson_date.localeCompare(b.session.lesson_date) ||
        a.tutorUser.full_name.localeCompare(b.tutorUser.full_name) ||
        a.student.full_name.localeCompare(b.student.full_name) ||
        a.subject.name.localeCompare(b.subject.name) ||
        a.session.id.localeCompare(b.session.id),
      );

    const rows: SheetExportRow[] = resolved.map((r, index) => [
      index + 1,
      r.tutorUser.full_name,
      r.student.full_name,
      r.student.grade,
      r.student.school_name,
      r.subject.name,
      formatSheetDate(r.session.lesson_date),
      formatSheetDuration(r.session.duration_minutes),
    ]);

    expect(resolved.map((r) => r.session.id)).toEqual(EXPECTED_EXPORT_SESSION_ORDER_2026_10);
    expect(rows).toEqual(EXPECTED_EXPORT_ROWS_2026_10);
    for (const row of EXPECTED_EXPORT_ROWS_2026_10) {
      expect(row).toHaveLength(SHEET_EXPORT_HEADERS.length);
      expect(sheetExportRowSchema.safeParse(row).success).toBe(true);
    }
    expect(new Set(resolved.map((r) => r.session.status)).size).toBe(4);
  });

  it('payroll Oktober: hanya approved × tarif snapshot', () => {
    let total = 0;
    for (const expected of EXPECTED_PAYROLL_2026_10.tutors) {
      const own = fixtureSessions
        .filter((s) => isDateInPeriod(s.lesson_date, '2026-10'))
        .map(resolveFixtureSession)
        .filter((r) => r.tutor.id === expected.tutor_id);
      const approved = own.filter((r) => r.session.status === 'approved');
      const count = (status: string) => own.filter((r) => r.session.status === status).length;
      // Integer rupiah: aman tanpa floating error untuk fixture ini.
      const amount = approved.reduce((sum, r) => sum + Number(r.session.rate_amount_snapshot), 0);
      total += amount;

      expect(approved.map((r) => r.session.id).sort()).toEqual([...expected.approved_session_ids].sort());
      expect(count('pending')).toBe(expected.pending_sessions);
      expect(count('revision_requested')).toBe(expected.revision_requested_sessions);
      expect(count('rejected')).toBe(expected.rejected_sessions);
      expect(String(amount)).toBe(expected.estimated_amount);
    }
    expect(String(total)).toBe(EXPECTED_PAYROLL_2026_10.total_estimated_amount);
  });

  it('examples/anomaly-response.json valid dan cocok dengan expected fake detector', () => {
    const example = anomalyAnalysisResultSchema.parse(JSON.parse(readExample('anomaly-response.json')));
    expect(example.notice).toMatch(/SINTETIS/);
    expect(
      example.findings.map(({ lesson_session_id, related_lesson_session_id, finding_type, severity }) => ({
        lesson_session_id, related_lesson_session_id, finding_type, severity,
      })),
    ).toEqual(EXPECTED_FAKE_DETECTOR_FINDINGS_2026_10);
  });
});

describe('examples/attendance-sample.csv (referensi header saja)', () => {
  it('header persis delapan kolom ekspor', () => {
    const header = readExample('attendance-sample.csv').replace(/^\uFEFF/, '').split(/\r?\n/)[0];
    expect(header?.split(',')).toEqual([...SHEET_EXPORT_HEADERS]);
  });
});
