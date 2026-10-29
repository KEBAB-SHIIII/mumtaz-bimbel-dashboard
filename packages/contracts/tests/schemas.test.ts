import { describe, expect, it } from 'vitest';
import {
  PAGE_SIZE_MAX,
  SHEET_EXPORT_HEADERS,
  anomalyReviewRequestSchema,
  changePasswordRequestSchema,
  createParentRequestSchema,
  createTutorRateRequestSchema,
  formatSheetDate,
  formatSheetDuration,
  isDateInPeriod,
  isFutureLessonDate,
  isManagedSheetTitle,
  isoDateSchema,
  loginRequestSchema,
  normalizeParentAccessCode,
  paginationQuerySchema,
  parentProgressItemSchema,
  periodDateRange,
  periodOfDate,
  periodSchema,
  sessionDecisionRequestSchema,
  sheetExportRequestSchema,
  sheetTitleForPeriod,
  submitAttendanceRequestSchema,
  todayInBusinessTimeZone,
  updateTutorAssignmentRequestSchema,
} from '../src/index.js';
import { UNKNOWN_ID, schemaInvalidSubmitCases, validSubmitRequest } from '../src/fixtures/index.js';

describe('periode (lesson_date)', () => {
  it('memvalidasi format YYYY-MM', () => {
    expect(periodSchema.safeParse('2026-10').success).toBe(true);
    for (const bad of ['2026-13', '2026-1', '10-2026', '2026-10-01', '']) {
      expect(periodSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('membentuk rentang [awal bulan, awal bulan berikutnya)', () => {
    expect(periodDateRange('2026-10')).toEqual({ start: '2026-10-01', endExclusive: '2026-11-01' });
    expect(periodDateRange('2026-12')).toEqual({ start: '2026-12-01', endExclusive: '2027-01-01' });
  });

  it('31 Oktober termasuk Oktober, 1 November tidak', () => {
    expect(isDateInPeriod('2026-10-31', '2026-10')).toBe(true);
    expect(isDateInPeriod('2026-11-01', '2026-10')).toBe(false);
    expect(isDateInPeriod('2026-09-30', '2026-10')).toBe(false);
    expect(periodOfDate('2026-10-31')).toBe('2026-10');
  });

  it('menolak tanggal kalender yang tidak ada', () => {
    expect(isoDateSchema.safeParse('2026-02-28').success).toBe(true);
    expect(isoDateSchema.safeParse('2028-02-29').success).toBe(true);
    expect(isoDateSchema.safeParse('2026-02-29').success).toBe(false);
    expect(isoDateSchema.safeParse('2026-04-31').success).toBe(false);
  });

  it('menghitung "hari ini" menurut Asia/Jakarta (UTC+7)', () => {
    // 29 Okt 16:59 UTC = 29 Okt 23:59 WIB; 17:00 UTC = 30 Okt 00:00 WIB.
    expect(todayInBusinessTimeZone(new Date('2026-10-29T16:59:59Z'))).toBe('2026-10-29');
    expect(todayInBusinessTimeZone(new Date('2026-10-29T17:00:00Z'))).toBe('2026-10-30');
  });

  it('working default O-14: tanggal masa depan menurut WIB terdeteksi', () => {
    const now = new Date('2026-10-29T17:30:00Z'); // 30 Okt 00:30 WIB
    expect(isFutureLessonDate('2026-10-30', now)).toBe(false);
    expect(isFutureLessonDate('2026-10-31', now)).toBe(true);
    expect(isFutureLessonDate('2026-01-15', now)).toBe(false);
  });
});

describe('auth', () => {
  it('normalisasi kode akses parent sebelum HMAC', () => {
    expect(normalizeParentAccessCode('  abcd-efgh ijkl-mn ')).toBe('ABCDEFGHIJKLMN');
    expect(normalizeParentAccessCode('MUMTAZ-DEMO-PARENT-ACCESS-ONLY')).toBe(
      normalizeParentAccessCode('mumtaz demo parent access only'),
    );
  });

  it('login menolak field tambahan', () => {
    expect(loginRequestSchema.safeParse({ username: 'tutor-a.demo', password: 'x' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ username: 'a', password: 'x', role: 'admin' }).success).toBe(false);
  });

  it('ganti password: password baru minimal 8 dan berbeda dari lama', () => {
    expect(changePasswordRequestSchema.safeParse({ current_password: 'lama-123', new_password: 'baru-12345' }).success).toBe(true);
    expect(changePasswordRequestSchema.safeParse({ current_password: 'lama-123', new_password: 'pendek' }).success).toBe(false);
    const same = changePasswordRequestSchema.safeParse({ current_password: 'sama-12345', new_password: 'sama-12345' });
    expect(same.success).toBe(false);
    expect(same.error?.issues[0]?.path).toEqual(['new_password']);
  });
});

describe('submit absensi', () => {
  it('menerima payload valid', () => {
    expect(submitAttendanceRequestSchema.parse(validSubmitRequest)).toEqual(validSubmitRequest);
  });

  it('notes/fokus kosong dinormalisasi menjadi null (O-13 opsional)', () => {
    const parsed = submitAttendanceRequestSchema.parse({ ...validSubmitRequest, learning_notes: '  ', next_focus: undefined });
    expect(parsed.learning_notes).toBeNull();
    expect(parsed.next_focus).toBeUndefined();
  });

  it.each(schemaInvalidSubmitCases)('menolak $name pada field $field', ({ body, field }) => {
    const result = submitAttendanceRequestSchema.safeParse(body);
    expect(result.success).toBe(false);
    const paths = result.error?.issues.flatMap((issue) =>
      issue.code === 'unrecognized_keys' ? issue.keys : issue.path.map(String),
    );
    expect(paths).toContain(field);
  });
});

describe('keputusan review', () => {
  it('approved boleh tanpa catatan; revisi & tolak wajib alasan', () => {
    expect(sessionDecisionRequestSchema.safeParse({ decision: 'approved' }).success).toBe(true);
    expect(sessionDecisionRequestSchema.safeParse({ decision: 'revision_requested' }).success).toBe(false);
    expect(sessionDecisionRequestSchema.safeParse({ decision: 'rejected', admin_note: ' ' }).success).toBe(false);
    expect(sessionDecisionRequestSchema.safeParse({ decision: 'rejected', admin_note: 'Tidak ada jadwal.' }).success).toBe(true);
  });

  it('tidak menerima status pending atau nilai lain', () => {
    expect(sessionDecisionRequestSchema.safeParse({ decision: 'pending' }).success).toBe(false);
  });

  it('Admin tidak boleh mengirim superseded/pending_review pada review anomali', () => {
    expect(anomalyReviewRequestSchema.safeParse({ review_status: 'false_positive', review_note: 'Valid.' }).success).toBe(true);
    expect(anomalyReviewRequestSchema.safeParse({ review_status: 'superseded', review_note: 'x' }).success).toBe(false);
    expect(anomalyReviewRequestSchema.safeParse({ review_status: 'pending_review', review_note: 'x' }).success).toBe(false);
  });
});

describe('master data', () => {
  it('tuple assignment immutable: PATCH hanya end_date/is_active', () => {
    expect(updateTutorAssignmentRequestSchema.safeParse({ is_active: false }).success).toBe(true);
    expect(updateTutorAssignmentRequestSchema.safeParse({ tutor_id: UNKNOWN_ID }).success).toBe(false);
  });

  it('tarif harus string desimal positif', () => {
    const base = { assignment_id: UNKNOWN_ID, rate_type: 'per_session', is_demo_assumption: true, effective_from: '2026-09-01' };
    expect(createTutorRateRequestSchema.safeParse({ ...base, rate_amount: '50000' }).success).toBe(true);
    expect(createTutorRateRequestSchema.safeParse({ ...base, rate_amount: '0' }).success).toBe(false);
    expect(createTutorRateRequestSchema.safeParse({ ...base, rate_amount: 50000 }).success).toBe(false);
    expect(createTutorRateRequestSchema.safeParse({ ...base, rate_amount: '50000', rate_type: 'per_hour' }).success).toBe(false);
  });

  it('parent membutuhkan relasi siswa unik', () => {
    const link = { student_id: UNKNOWN_ID, relationship: 'ibu' };
    expect(createParentRequestSchema.safeParse({ full_name: 'Wali', student_links: [link] }).success).toBe(true);
    expect(createParentRequestSchema.safeParse({ full_name: 'Wali', student_links: [] }).success).toBe(false);
    expect(createParentRequestSchema.safeParse({ full_name: 'Wali', student_links: [link, link] }).success).toBe(false);
  });

  it('pagination default 20 dan maksimum 100', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, page_size: 20 });
    expect(paginationQuerySchema.parse({ page: '2', page_size: '50' })).toEqual({ page: 2, page_size: 50 });
    expect(paginationQuerySchema.safeParse({ page_size: String(PAGE_SIZE_MAX + 1) }).success).toBe(false);
  });
});

describe('Progress Anak', () => {
  it('menolak field internal (admin_note, status anomali, honor)', () => {
    const item = {
      id: UNKNOWN_ID,
      lesson_date: '2026-10-01',
      tutor_name: 'Tutor Demo A',
      subject_name: 'Matematika',
      duration_minutes: 90,
      learning_material: 'Penjumlahan',
      learning_notes: null,
      next_focus: null,
    };
    expect(parentProgressItemSchema.safeParse(item).success).toBe(true);
    expect(parentProgressItemSchema.safeParse({ ...item, admin_note: 'internal' }).success).toBe(false);
    expect(parentProgressItemSchema.safeParse({ ...item, rate_amount_snapshot: '50000' }).success).toBe(false);
  });
});

describe('ekspor Google Sheets', () => {
  it('header tepat delapan kolom dengan urutan tetap', () => {
    expect(SHEET_EXPORT_HEADERS).toEqual([
      'no', 'nama tutor', 'nama murid', 'kelas', 'asal sekolah', 'mata pelajaran', 'tanggal les', 'durasi les',
    ]);
  });

  it('format tanggal/durasi working default O-11 tanpa pergeseran timezone', () => {
    expect(formatSheetDate('2026-10-31')).toBe('31/10/2026');
    expect(formatSheetDate('2026-01-01')).toBe('01/01/2026');
    expect(formatSheetDuration(90)).toBe('90 menit');
  });

  it('nama tab deterministik dan hanya pola yang dikelola', () => {
    expect(sheetTitleForPeriod('2026-10')).toBe('Absensi 2026-10');
    expect(isManagedSheetTitle('Absensi 2026-10')).toBe(true);
    expect(isManagedSheetTitle('Sheet1')).toBe(false);
    expect(isManagedSheetTitle('Absensi 2026-10 (copy)')).toBe(false);
  });

  it('confirm_empty_replace default false', () => {
    expect(sheetExportRequestSchema.parse({ period: '2026-10' })).toEqual({ period: '2026-10', confirm_empty_replace: false });
  });
});
