/**
 * FAKE API BACKEND (in-memory) — data SINTETIS dari `@mumtaz/contracts/fixtures`.
 * KHUSUS TEST UI (tidak ikut build aplikasi). Bentuk respons mengikuti
 * docs/04 (diverifikasi test terhadap schema kontrak). Bukan data Neon.
 */
import {
  approvalStatusOf,
  durationBetween,
  isDateInPeriod,
  normalizeParentAccessCode,
  sessionStatusFor,
  sheetTitleForPeriod,
  trailingPeriods,
  spreadsheetUrl,
  type AdminAttendanceDetail,
  type AdminAttendanceListItem,
  type AnomalyFinding,
  type AuthUser,
  type ErrorCode,
  type Parent,
  type PayrollPreviewResponse,
  type TutorPayrollResponse,
  type ApprovalStatus,
  type BillingResponse,
  type SessionStatus,
  type SessionValidity,
  type SheetExportRun,
  type Student,
  type Subject,
  type Tutor,
  type TutorSession,
} from '@mumtaz/contracts';
import {
  TEST_ONLY_CREDENTIALS,
  fixtureAnomalyFlags,
  fixtureParentStudents,
  fixtureSessions,
  fixtureStudents,
  fixtureSubjects,
  fixtureTutors,
  fixtureUsers,
  type FixtureLessonSession,
} from '@mumtaz/contracts/fixtures';

export interface FakeRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  body: Record<string, unknown>;
  csrfHeader: string | undefined;
}

export interface FakeResponse {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
}

const FIXED_TIMESTAMP = '2026-09-01T00:00:00.000Z';
const DEMO_SPREADSHEET_ID = 'demo-spreadsheet-id';

class FakeError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

const ok = (data: unknown, status = 200): FakeResponse => ({ status, data });

function demoId(prefix: string, n: number) {
  return `00000000-0000-4000-${prefix}-${String(n).padStart(12, '0')}`;
}

/** State in-memory; `createFakeBackend()` membuat salinan bersih (mis. per test). */
export function createFakeBackend(options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  let counter = 1000;
  const nextId = (prefix: string) => demoId(prefix, (counter += 1));

  const users = fixtureUsers.map((u) => ({ ...u }));
  const passwords = new Map<string, string>(
    users
      .filter((u) => u.role !== 'parent')
      .map((u) => [u.id, u.role === 'admin' ? TEST_ONLY_CREDENTIALS.adminPassword : TEST_ONLY_CREDENTIALS.tutorPassword]),
  );
  const parentCodes = new Map<string, string>(
    Object.entries(TEST_ONLY_CREDENTIALS.parentAccessCodes).map(([id, code]) => [normalizeParentAccessCode(code), id]),
  );
  const tutors: Tutor[] = fixtureTutors.map((t) => {
    const user = users.find((u) => u.id === t.user_id);
    return {
      ...t,
      full_name: user?.full_name ?? '',
      username: user?.username ?? '',
      login_active: user?.is_active ?? true,
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    };
  });
  const students: Student[] = fixtureStudents.map((s) => ({ ...s, created_at: FIXED_TIMESTAMP, updated_at: FIXED_TIMESTAMP }));
  const subjects: Subject[] = fixtureSubjects.map((s) => ({ ...s, created_at: FIXED_TIMESTAMP, updated_at: FIXED_TIMESTAMP }));
  let links = fixtureParentStudents.map((l) => ({ ...l }));
  const sessions: FixtureLessonSession[] = fixtureSessions.map((s) => ({ ...s }));
  const flags = fixtureAnomalyFlags.map((f) => ({ ...f }));
  /** Spreadsheet demo in-memory: judul tab → jumlah baris data (tanpa header). */
  const sheetTabs = new Map<string, number>();
  const exportRuns: SheetExportRun[] = [];
  let failNextExport = false;

  let csrfToken = 'demo-csrf-anonymous';
  let currentUserId: string | null = null;

  // --- helpers ---------------------------------------------------------------

  const tutorName = (tutorId: string) => tutors.find((t) => t.id === tutorId)?.full_name ?? '';
  const core = (s: FixtureLessonSession) => {
    const student = students.find((st) => st.id === s.student_id);
    return {
      id: s.id,
      tutor_id: s.tutor_id,
      tutor_name: tutorName(s.tutor_id),
      student_id: s.student_id,
      student_name: student?.full_name ?? '',
      grade: student?.grade ?? '',
      school_name: student?.school_name ?? '',
      ...subjectsOf(s),
      lesson_date: s.lesson_date,
      start_time: s.start_time,
      end_time: s.end_time,
      duration_minutes: s.duration_minutes,
    };
  };

  /** Mapel sesi urut nama: ID sejajar dengan nama, nama digabung koma (seperti backend). */
  const subjectsOf = (s: FixtureLessonSession) => {
    const list = s.subject_ids
      .map((id) => subjects.find((su) => su.id === id))
      .filter((su): su is Subject => su !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
    return { subject_ids: list.map((su) => su.id), subject_name: list.map((su) => su.name).join(', ') };
  };

  const validityOf = (s: FixtureLessonSession) => ({
    validity: s.validity,
    approval_status: approvalStatusOf(s.validity, s.status),
    validity_reason: s.validity_reason,
  });

  const toFinding = (f: (typeof flags)[number]): AnomalyFinding => ({ ...f });

  const toListItem = (s: FixtureLessonSession): AdminAttendanceListItem => ({
    ...core(s),
    status: s.status,
    ...validityOf(s),
    anomaly_analysis_status: s.anomaly_analysis_status,
    findings: flags
      .filter((f) => f.lesson_session_id === s.id)
      .map((f) => ({ id: f.id, finding_type: f.finding_type, review_status: f.review_status })),
    submitted_at: s.submitted_at,
  });

  const toDetail = (s: FixtureLessonSession): AdminAttendanceDetail => ({
    ...core(s),
    client_submission_id: s.client_submission_id,
    learning_material: s.learning_material,
    learning_notes: s.learning_notes,
    next_focus: s.next_focus,
    status: s.status,
    ...validityOf(s),
    anomaly_analysis_status: s.anomaly_analysis_status,
    findings: flags.filter((f) => f.lesson_session_id === s.id).map(toFinding),
    submitted_at: s.submitted_at,
    updated_at: s.updated_at,
    last_review: { reviewed_by_user_id: s.reviewed_by_user_id, reviewed_at: s.reviewed_at, admin_note: s.admin_note },
  });

  const toTutorSession = (s: FixtureLessonSession): TutorSession => ({
    ...core(s),
    learning_material: s.learning_material,
    learning_notes: s.learning_notes,
    next_focus: s.next_focus,
    status: s.status,
    ...validityOf(s),
    admin_note: s.admin_note,
    submitted_at: s.submitted_at,
    reviewed_at: s.reviewed_at,
  });

  const toParent = (u: (typeof users)[number]): Parent => ({
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    is_active: u.is_active,
    students: links
      .filter((l) => l.parent_user_id === u.id)
      .map((l) => ({ student_id: l.student_id, full_name: students.find((s) => s.id === l.student_id)?.full_name ?? '', relationship: l.relationship })),
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP,
  });

  const paginate = <T,>(items: T[], params: Record<string, string>) => {
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.page_size ?? 20)));
    return { items: items.slice((page - 1) * pageSize, page * pageSize), page, page_size: pageSize, total: items.length };
  };

  const matches = (value: string, search?: string) => !search || value.toLowerCase().includes(search.toLowerCase());

  const requireUser = (): AuthUser => {
    const user = users.find((u) => u.id === currentUserId);
    if (!user || !user.is_active) throw new FakeError(401, 'UNAUTHENTICATED', 'Sesi tidak valid atau sudah berakhir');
    const tutor = tutors.find((t) => t.user_id === user.id);
    return {
      id: user.id,
      full_name: user.full_name,
      role: user.role,
      ...(user.username ? { username: user.username } : {}),
      ...(user.role === 'tutor' ? { phone: tutor?.phone ?? null } : {}),
    };
  };

  const requireRole = (role: AuthUser['role']) => {
    const user = requireUser();
    if (user.role !== role) throw new FakeError(403, 'FORBIDDEN', 'Anda tidak memiliki akses ke resource ini');
    return user;
  };

  const tutorIdOf = (user: AuthUser) => tutors.find((t) => t.user_id === user.id)?.id ?? '';

  const inPeriod = (period: string) => sessions.filter((s) => isDateInPeriod(s.lesson_date, period));

  const statusCounts = (rows: FixtureLessonSession[]) => {
    const counts: Record<SessionStatus, number> = { pending: 0, approved: 0, revision_requested: 0, rejected: 0 };
    for (const row of rows) counts[row.status] += 1;
    return counts;
  };

  /** Fake payroll: approved × snapshot; bersih = kotor − potongan Admin (nilai fixture bilangan bulat rupiah). */
  const payroll = (period: string, tutorId?: string): PayrollPreviewResponse => {
    const rows = inPeriod(period).filter((s) => !tutorId || s.tutor_id === tutorId);
    const byTutor = new Map<string, FixtureLessonSession[]>();
    for (const row of rows) byTutor.set(row.tutor_id, [...(byTutor.get(row.tutor_id) ?? []), row]);
    const totals = { gross: 0, fee: 0 };
    const tutorsOut = [...byTutor.entries()].map(([id, own]) => {
      const counted = (s: FixtureLessonSession) => s.status === 'approved' && s.rate_amount_snapshot !== null;
      const priced = own.filter(counted);
      const gross = priced.reduce((sum, s) => sum + Number(s.rate_amount_snapshot), 0);
      const fee = priced.reduce((sum, s) => sum + Number(s.admin_fee_snapshot ?? 0), 0);
      totals.gross += gross;
      totals.fee += fee;
      return {
        tutor_id: id,
        tutor_name: tutorName(id),
        counted_sessions: priced.length,
        not_counted_sessions: own.length - priced.length,
        gross_amount: String(gross),
        admin_fee_amount: String(fee),
        net_amount: String(gross - fee),
        approved_sessions_without_rate: own.filter((s) => s.status === 'approved').length - priced.length,
        sessions: [...own]
          .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date) || a.id.localeCompare(b.id))
          .map((s) => {
            const c = core(s);
            const isCounted = counted(s);
            const lineFee = Number(s.admin_fee_snapshot ?? 0);
            return {
              session_id: s.id,
              lesson_date: s.lesson_date,
              student_name: c.student_name,
              subject_name: c.subject_name,
              duration_minutes: s.duration_minutes,
              status: s.status,
              ...validityOf(s),
              counted: isCounted,
              gross_amount: isCounted ? String(Number(s.rate_amount_snapshot)) : null,
              admin_fee: isCounted ? String(lineFee) : null,
              net_amount: isCounted ? String(Number(s.rate_amount_snapshot) - lineFee) : null,
            };
          })
          .map(({ validity_reason: _reason, ...line }) => line),
      };
    });
    return {
      period,
      tutors: tutorsOut,
      totals: { gross_amount: String(totals.gross), admin_fee_amount: String(totals.fee), net_amount: String(totals.gross - totals.fee) },
      warnings: [],
    };
  };

  /** Honor Saya: hanya nominal bersih (meniru `GET /tutor/me/payroll`). */
  const tutorPayroll = (period: string, tutorId: string): TutorPayrollResponse => {
    const tutor = payroll(period, tutorId).tutors[0];
    return {
      period,
      counted_sessions: tutor?.counted_sessions ?? 0,
      not_counted_sessions: tutor?.not_counted_sessions ?? 0,
      net_amount: tutor?.net_amount ?? '0',
      sessions: (tutor?.sessions ?? []).map(({ gross_amount: _gross, admin_fee: _fee, ...line }) => line),
      warnings: [],
    };
  };

  /** Penagihan: sesi approved bertarif snapshot per murid (meniru `GET /admin/billing`). */
  const billing = (period: string, studentId?: string): BillingResponse => {
    const rows = inPeriod(period)
      .filter((s) => s.status === 'approved' && s.rate_amount_snapshot !== null && (!studentId || s.student_id === studentId))
      .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date) || a.id.localeCompare(b.id));
    const byStudent = new Map<string, FixtureLessonSession[]>();
    for (const row of rows) byStudent.set(row.student_id, [...(byStudent.get(row.student_id) ?? []), row]);
    const studentsOut = [...byStudent.entries()]
      .map(([id, list]) => {
        const c = core(list[0] as FixtureLessonSession);
        const total = list.reduce((sum, s) => sum + Number(s.rate_amount_snapshot), 0);
        return {
          student_id: id,
          student_name: c.student_name,
          grade: c.grade,
          school_name: c.school_name,
          parent_names: links.filter((l) => l.student_id === id).map((l) => users.find((u) => u.id === l.parent_user_id)?.full_name ?? '').filter(Boolean),
          sessions: list.length,
          total_amount: String(total),
          lines: list.map((s) => {
            const line = core(s);
            return {
              session_id: s.id,
              lesson_date: s.lesson_date,
              start_time: s.start_time,
              end_time: s.end_time,
              tutor_name: line.tutor_name,
              subject_name: line.subject_name,
              duration_minutes: s.duration_minutes,
              amount: String(Number(s.rate_amount_snapshot)),
            };
          }),
        };
      })
      .sort((a, b) => a.student_name.localeCompare(b.student_name));
    const totalAmount = studentsOut.reduce((sum, s) => sum + Number(s.total_amount), 0);
    return {
      period,
      students: studentsOut,
      total_sessions: studentsOut.reduce((sum, s) => sum + s.sessions, 0),
      total_amount: String(totalAmount),
      warnings: [],
    };
  };

  const requireCsrf = (req: FakeRequest) => {
    if (req.method !== 'get' && req.csrfHeader !== csrfToken) {
      throw new FakeError(403, 'CSRF_INVALID', 'Permintaan tidak dapat diverifikasi. Muat ulang halaman lalu coba lagi.');
    }
  };

  /** Murid & semua mapel pilihan harus ada dan aktif (tanpa penugasan); durasi dari jam. Mengembalikan durasi. */
  const validateChoice = (body: Record<string, unknown>): number => {
    const details: { field: string; message: string }[] = [];
    if (!students.some((st) => st.id === body.student_id && st.is_active)) details.push({ field: 'student_id', message: 'Murid tidak ditemukan atau tidak aktif' });
    const subjectIds = Array.isArray(body.subject_ids) ? body.subject_ids : [];
    if (subjectIds.length === 0 || !subjectIds.every((id) => subjects.some((su) => su.id === id && su.is_active))) {
      details.push({ field: 'subject_ids', message: 'Mata pelajaran tidak ditemukan atau tidak aktif' });
    }
    const duration = durationBetween(String(body.start_time ?? ''), String(body.end_time ?? ''));
    if (duration === null) details.push({ field: 'end_time', message: 'Jam selesai harus setelah jam mulai' });
    if (details.length > 0 || duration === null) throw new FakeError(422, 'VALIDATION_FAILED', 'Validasi gagal', details);
    return duration;
  };

  /** Field editable dari body (setelah `validateChoice`). */
  const editableOf = (body: Record<string, unknown>, duration: number) => ({
    student_id: String(body.student_id),
    subject_ids: (body.subject_ids as unknown[]).map(String),
    lesson_date: String(body.lesson_date),
    start_time: String(body.start_time),
    end_time: String(body.end_time),
    duration_minutes: duration,
    learning_material: String(body.learning_material),
    learning_notes: typeof body.learning_notes === 'string' && body.learning_notes ? body.learning_notes : null,
    next_focus: typeof body.next_focus === 'string' && body.next_focus ? body.next_focus : null,
  });

  /** Sesi baru selalu menunggu validasi AI (fake tidak menjalankan AI). */
  const newSession = (tutorId: string, clientSubmissionId: string, body: Record<string, unknown>, duration: number): FixtureLessonSession => {
    const timestamp = now().toISOString();
    return {
      id: nextId('8000'),
      client_submission_id: clientSubmissionId,
      tutor_id: tutorId,
      ...editableOf(body, duration),
      status: 'pending',
      validity: null,
      validity_reason: null,
      anomaly_analysis_status: 'pending',
      rate_amount_snapshot: null,
      admin_fee_snapshot: null,
      reviewed_by_user_id: null,
      submitted_at: timestamp,
      reviewed_at: null,
      updated_at: timestamp,
      admin_note: null,
    };
  };

  /** Tarif fake (meniru mesin tarif backend): SD 1-3 Rp50.000/jam, SD 4-6 Rp70.000/jam. */
  const fakeGross = (s: FixtureLessonSession) => {
    const grade = students.find((st) => st.id === s.student_id)?.grade ?? '';
    const hourly = /^[1-3] SD$/.test(grade) ? 50_000 : /^[4-6] SD$/.test(grade) ? 70_000 : 0;
    return hourly + Math.max(0, Math.floor((s.duration_minutes - 60) / 30)) * hourly * 0.5;
  };

  // --- routes ------------------------------------------------------------------

  type Handler = (req: FakeRequest, match: string[]) => FakeResponse;
  const routes: [string, RegExp, Handler][] = [
    ['get', /^\/health$/, () => ok({ status: 'ok' })],
    ['get', /^\/auth\/csrf$/, () => ok({ csrf_token: csrfToken })],
    ['get', /^\/auth\/me$/, () => ok({ user: requireUser() })],
    [
      'post',
      /^\/auth\/login$/,
      (req) => {
        const user = users.find((u) => u.username === String(req.body.username ?? '').toLowerCase() && u.role !== 'parent');
        if (!user || passwords.get(user.id) !== req.body.password || !user.is_active) {
          throw new FakeError(401, 'UNAUTHENTICATED', 'Kredensial tidak valid');
        }
        currentUserId = user.id;
        csrfToken = `demo-csrf-${user.id}`;
        return ok({ user: requireUser(), csrf_token: csrfToken });
      },
    ],
    [
      'post',
      /^\/auth\/parent-access$/,
      (req) => {
        const id = parentCodes.get(normalizeParentAccessCode(String(req.body.access_code ?? '')));
        const user = users.find((u) => u.id === id);
        if (!user || !user.is_active) throw new FakeError(401, 'UNAUTHENTICATED', 'Kredensial tidak valid');
        currentUserId = user.id;
        csrfToken = `demo-csrf-${user.id}`;
        return ok({ user: requireUser(), csrf_token: csrfToken });
      },
    ],
    [
      'post',
      /^\/auth\/logout$/,
      () => {
        requireUser();
        currentUserId = null;
        csrfToken = 'demo-csrf-anonymous';
        return ok(null, 204);
      },
    ],

    // Admin
    [
      'get',
      /^\/admin\/dashboard\/summary$/,
      (req) => {
        requireRole('admin');
        const rows = inPeriod(req.params.period ?? '');
        const gross = rows.filter((r) => r.status === 'approved').reduce((sum, r) => sum + Number(r.rate_amount_snapshot ?? 0), 0);
        return ok({
          period: req.params.period,
          active_tutors: tutors.filter((t) => t.is_active && t.login_active).length,
          students_with_sessions: new Set(rows.map((r) => r.student_id)).size,
          total_sessions: rows.length,
          gross_revenue: String(gross),
          revenue_by_month: trailingPeriods(req.params.period ?? '', 6).map((month) => {
            const counted = inPeriod(month).filter((r) => r.status === 'approved' && r.rate_amount_snapshot !== null);
            const monthGross = counted.reduce((sum, r) => sum + Number(r.rate_amount_snapshot), 0);
            const fee = counted.reduce((sum, r) => sum + Number(r.admin_fee_snapshot ?? 0), 0);
            return { period: month, gross_revenue: String(monthGross), tutor_salary: String(monthGross - fee), net_revenue: String(fee) };
          }),
        });
      },
    ],
    [
      'get',
      /^\/admin\/attendance$/,
      (req) => {
        requireRole('admin');
        const { status, validity, anomaly_status, tutor_id, student_id, subject_id, search } = req.params;
        const validityMatches = (v: SessionValidity | null) => !validity || (validity === 'unvalidated' ? v === null : v === validity);
        const rows = inPeriod(req.params.period ?? '')
          .map(toListItem)
          .filter((i) => (!status || i.status === status) && validityMatches(i.validity) && (!anomaly_status || i.anomaly_analysis_status === anomaly_status) && (!tutor_id || i.tutor_id === tutor_id) && (!student_id || i.student_id === student_id) && (!subject_id || i.subject_ids.includes(subject_id)))
          .filter((i) => !search || [i.tutor_name, i.student_name, i.subject_name].some((v) => matches(v, search)))
          .sort((a, b) => b.lesson_date.localeCompare(a.lesson_date) || b.submitted_at.localeCompare(a.submitted_at));
        return ok(paginate(rows, req.params));
      },
    ],
    [
      'get',
      /^\/admin\/attendance\/([^/]+)$/,
      (_req, [id]) => {
        requireRole('admin');
        const s = sessions.find((row) => row.id === id);
        if (!s) throw new FakeError(404, 'NOT_FOUND', 'Sesi tidak ditemukan');
        return ok(toDetail(s));
      },
    ],
    [
      'get',
      /^\/admin\/attendance-options$/,
      () => {
        requireRole('admin');
        return ok({
          students: students.filter((st) => st.is_active).map(({ id, full_name, grade, school_name }) => ({ id, full_name, grade, school_name })).sort((x, y) => x.full_name.localeCompare(y.full_name)),
          subjects: subjects.filter((su) => su.is_active).map(({ id, name }) => ({ id, name })).sort((x, y) => x.name.localeCompare(y.name)),
          tutors: tutors.filter((t) => t.is_active && t.login_active).map(({ id, full_name }) => ({ id, full_name })).sort((x, y) => x.full_name.localeCompare(y.full_name)),
        });
      },
    ],
    [
      'post',
      /^\/admin\/attendance$/,
      (req) => {
        requireRole('admin');
        if (!tutors.some((t) => t.id === req.body.tutor_id)) throw new FakeError(422, 'VALIDATION_FAILED', 'Validasi gagal', [{ field: 'tutor_id', message: 'Tutor tidak ditemukan' }]);
        const duration = validateChoice(req.body);
        const session = newSession(String(req.body.tutor_id), nextId('9a00'), req.body, duration);
        sessions.push(session);
        return ok(toDetail(session), 201);
      },
    ],
    [
      'put',
      /^\/admin\/attendance\/([^/]+)$/,
      (req, [id]) => {
        requireRole('admin');
        const s = sessions.find((row) => row.id === id);
        if (!s) throw new FakeError(404, 'NOT_FOUND', 'Sesi tidak ditemukan');
        const duration = validateChoice(req.body);
        Object.assign(s, { tutor_id: String(req.body.tutor_id), ...editableOf(req.body, duration), updated_at: now().toISOString() });
        if (s.status === 'approved') s.rate_amount_snapshot = String(fakeGross(s));
        return ok(toDetail(s));
      },
    ],
    [
      'delete',
      /^\/admin\/attendance\/([^/]+)$/,
      (_req, [id]) => {
        requireRole('admin');
        const index = sessions.findIndex((row) => row.id === id);
        if (index < 0) throw new FakeError(404, 'NOT_FOUND', 'Sesi tidak ditemukan');
        sessions.splice(index, 1);
        for (let i = flags.length - 1; i >= 0; i -= 1) if (flags[i]?.lesson_session_id === id) flags.splice(i, 1);
        return ok(null, 204);
      },
    ],
    [
      'patch',
      /^\/admin\/attendance\/([^/]+)\/validity$/,
      (req, [id]) => {
        const admin = requireRole('admin');
        const s = sessions.find((row) => row.id === id);
        if (!s) throw new FakeError(404, 'NOT_FOUND', 'Sesi tidak ditemukan');
        const validity = req.body.validity as SessionValidity;
        const approval = (req.body.approval ?? 'pending') as ApprovalStatus;
        const status = sessionStatusFor(validity, approval);
        Object.assign(s, {
          validity,
          status,
          ...(typeof req.body.admin_note === 'string' ? { admin_note: req.body.admin_note } : {}),
          reviewed_by_user_id: admin.id,
          reviewed_at: now().toISOString(),
          updated_at: now().toISOString(),
          rate_amount_snapshot: status === 'approved' ? String(fakeGross(s)) : null,
          admin_fee_snapshot: status === 'approved' ? '10000' : null,
        });
        return ok(toDetail(s));
      },
    ],
    [
      'get',
      /^\/admin\/billing$/,
      (req) => {
        requireRole('admin');
        return ok(billing(req.params.period ?? '', req.params.student_id));
      },
    ],
    [
      'get',
      /^\/admin\/billing\/([^/]+)\/invoice\.pdf$/,
      (req, [id]) => {
        requireRole('admin');
        const student = billing(req.params.period ?? '', id).students[0];
        if (!student) throw new FakeError(404, 'NOT_FOUND', 'Tagihan murid pada periode ini tidak ditemukan');
        const fileName = `tagihan-${req.params.period}-${student.student_name.toLowerCase()}.pdf`;
        return { status: 200, data: new Blob(['%PDF-fake'], { type: 'application/pdf' }), headers: { 'content-disposition': `attachment; filename="${fileName}"` } };
      },
    ],
    [
      'post',
      /^\/admin\/reports\/google-sheets\/attendance$/,
      (req) => {
        requireRole('admin');
        const period = String(req.body.period ?? '');
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new FakeError(422, 'VALIDATION_FAILED', 'Validasi gagal');
        // Semua status review ikut (O-08); tab periode diganti isinya.
        const records = inPeriod(period).length;
        const title = sheetTitleForPeriod(period);
        const existing = sheetTabs.get(title) ?? 0;
        if (records === 0 && existing > 0 && req.body.confirm_empty_replace !== true) {
          throw new FakeError(
            409,
            'EMPTY_EXPORT_CONFIRMATION_REQUIRED',
            `Tidak ada sesi pada periode ini, sedangkan tab ${title} berisi ${existing} baris. Konfirmasi untuk mengganti isinya dengan laporan kosong.`,
          );
        }
        const timestamp = now().toISOString();
        if (failNextExport) {
          failNextExport = false;
          const message = 'Akses ke spreadsheet ditolak. Pastikan service account memiliki akses Editor.';
          exportRuns.unshift({
            id: nextId('9e00'),
            period,
            spreadsheet_id: DEMO_SPREADSHEET_ID,
            spreadsheet_url: spreadsheetUrl(DEMO_SPREADSHEET_ID),
            sheet_title: title,
            records_exported: 0,
            status: 'failed',
            safe_error_message: message,
            started_at: timestamp,
            completed_at: timestamp,
          });
          throw new FakeError(503, 'INTEGRATION_UNAVAILABLE', message);
        }
        sheetTabs.set(title, records);
        const run: SheetExportRun = {
          id: nextId('9e00'),
          period,
          spreadsheet_id: DEMO_SPREADSHEET_ID,
          spreadsheet_url: spreadsheetUrl(DEMO_SPREADSHEET_ID),
          sheet_title: title,
          records_exported: records,
          status: 'succeeded',
          safe_error_message: null,
          started_at: timestamp,
          completed_at: timestamp,
        };
        exportRuns.unshift(run);
        const { safe_error_message: _error, started_at: _started, ...exported } = run;
        return ok({ export: exported });
      },
    ],
    [
      'get',
      /^\/admin\/reports\/google-sheets\/attendance\/history$/,
      (req) => {
        requireRole('admin');
        return ok(paginate(exportRuns.filter((run) => !req.params.period || run.period === req.params.period), req.params));
      },
    ],
    ['get', /^\/admin\/payroll\/preview$/, (req) => (requireRole('admin'), ok(payroll(req.params.period ?? '')))],

    // Admin — Master Data (list + create/update ringkas)
    ['get', /^\/admin\/tutors$/, (req) => (requireRole('admin'), ok(paginate(tutors.filter((t) => matches(t.full_name, req.params.search) || matches(t.username, req.params.search)), req.params)))],
    ['get', /^\/admin\/students$/, (req) => (requireRole('admin'), ok(paginate(students.filter((s) => matches(s.full_name, req.params.search)), req.params)))],
    ['get', /^\/admin\/subjects$/, (req) => (requireRole('admin'), ok(paginate(subjects.filter((s) => matches(s.name, req.params.search)), req.params)))],
    ['get', /^\/admin\/parents$/, (req) => (requireRole('admin'), ok(paginate(users.filter((u) => u.role === 'parent' && matches(u.full_name, req.params.search)).map(toParent), req.params)))],
    [
      'post',
      /^\/admin\/tutors$/,
      (req) => {
        requireRole('admin');
        const username = String(req.body.username ?? '');
        if (users.some((u) => u.username === username)) {
          throw new FakeError(409, 'CONFLICT', 'Konflik data', [{ field: 'username', message: 'Username sudah dipakai' }]);
        }
        const userId = nextId('8001');
        const user = { id: userId, full_name: String(req.body.full_name), username, email: null, role: 'tutor' as const, is_active: true };
        users.push(user);
        const timestamp = now().toISOString();
        const tutor: Tutor = { id: nextId('8002'), user_id: userId, full_name: user.full_name, username, phone: typeof req.body.phone === 'string' ? req.body.phone : null, is_active: true, login_active: true, created_at: timestamp, updated_at: timestamp };
        tutors.push(tutor);
        const temporaryPassword = `Fake-${String(counter).padStart(4, '0')}-Pass`;
        passwords.set(userId, temporaryPassword);
        return ok({ tutor, temporary_password: temporaryPassword }, 201);
      },
    ],
    [
      'post',
      /^\/admin\/tutors\/([^/]+)\/reset-password$/,
      (_req, [id]) => {
        requireRole('admin');
        const tutor = tutors.find((t) => t.id === id);
        if (!tutor) throw new FakeError(404, 'NOT_FOUND', 'Tutor tidak ditemukan');
        const temporaryPassword = `Fake-${String((counter += 1)).padStart(4, '0')}-Pass`;
        passwords.set(tutor.user_id, temporaryPassword);
        return ok({ tutor, temporary_password: temporaryPassword });
      },
    ],
    [
      'post',
      /^\/admin\/students$/,
      (req) => {
        requireRole('admin');
        const student: Student = { id: nextId('8003'), full_name: String(req.body.full_name), grade: String(req.body.grade), school_name: String(req.body.school_name), is_active: true, created_at: now().toISOString(), updated_at: now().toISOString() };
        students.push(student);
        return ok(student, 201);
      },
    ],
    [
      'patch',
      /^\/admin\/students\/([^/]+)$/,
      (req, [id]) => {
        requireRole('admin');
        const student = students.find((s) => s.id === id);
        if (!student) throw new FakeError(404, 'NOT_FOUND', 'Siswa tidak ditemukan');
        Object.assign(student, req.body, { updated_at: now().toISOString() });
        return ok(student);
      },
    ],
    [
      'post',
      /^\/admin\/subjects$/,
      (req) => {
        requireRole('admin');
        const name = String(req.body.name);
        if (subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
          throw new FakeError(409, 'CONFLICT', 'Nama mata pelajaran sudah ada', [{ field: 'name', message: 'Nama mata pelajaran sudah ada' }]);
        }
        const subject: Subject = { id: nextId('8004'), name, is_active: true, created_at: now().toISOString(), updated_at: now().toISOString() };
        subjects.push(subject);
        return ok(subject, 201);
      },
    ],
    [
      'post',
      /^\/admin\/parents$/,
      (req) => {
        requireRole('admin');
        const id = nextId('8001');
        const code = `DEMO-${String(counter).padStart(4, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        users.push({ id, full_name: String(req.body.full_name), username: null, email: typeof req.body.email === 'string' ? req.body.email : null, role: 'parent', is_active: true });
        parentCodes.set(normalizeParentAccessCode(code), id);
        const studentLinks = Array.isArray(req.body.student_links) ? (req.body.student_links as { student_id: string; relationship?: string | null }[]) : [];
        links = [...links, ...studentLinks.map((l) => ({ parent_user_id: id, student_id: l.student_id, relationship: l.relationship ?? null }))];
        const user = users.find((u) => u.id === id);
        if (!user) throw new FakeError(500, 'INTERNAL_ERROR', 'Gagal');
        return ok({ parent: toParent(user), access_code: code }, 201);
      },
    ],

    // Tutor
    [
      'get',
      /^\/tutor\/dashboard\/summary$/,
      (req) => {
        const user = requireRole('tutor');
        const tutorId = tutorIdOf(user);
        const rows = inPeriod(req.params.period ?? '').filter((s) => s.tutor_id === tutorId);
        const p = tutorPayroll(req.params.period ?? '', tutorId);
        return ok({ period: req.params.period, status_counts: statusCounts(rows), honor: { estimated_amount: p.net_amount } });
      },
    ],
    [
      'get',
      /^\/tutor\/attendance-options$/,
      () => {
        requireRole('tutor');
        return ok({
          students: students.filter((st) => st.is_active).map(({ id, full_name, grade, school_name }) => ({ id, full_name, grade, school_name })).sort((x, y) => x.full_name.localeCompare(y.full_name)),
          subjects: subjects.filter((su) => su.is_active).map(({ id, name }) => ({ id, name })).sort((x, y) => x.name.localeCompare(y.name)),
        });
      },
    ],
    [
      'post',
      /^\/tutor\/attendance$/,
      (req) => {
        const tutorId = tutorIdOf(requireRole('tutor'));
        const body = req.body;
        const existing = sessions.find((s) => s.client_submission_id === body.client_submission_id);
        const response = (s: FixtureLessonSession) => ({ session: { id: s.id, client_submission_id: s.client_submission_id, status: s.status, anomaly_analysis_status: s.anomaly_analysis_status, submitted_at: s.submitted_at } });
        if (existing) return ok(response(existing), 201);
        const duration = validateChoice(body);
        const session = newSession(tutorId, String(body.client_submission_id), body, duration);
        sessions.push(session);
        return ok(response(session), 201);
      },
    ],
    [
      'get',
      /^\/tutor\/me\/attendance$/,
      (req) => {
        const tutorId = tutorIdOf(requireRole('tutor'));
        const rows = inPeriod(req.params.period ?? '')
          .filter((s) => s.tutor_id === tutorId && (!req.params.status || s.status === req.params.status) && (!req.params.student_id || s.student_id === req.params.student_id))
          .sort((a, b) => b.lesson_date.localeCompare(a.lesson_date))
          .map(toTutorSession);
        return ok(paginate(rows, req.params));
      },
    ],
    [
      'patch',
      /^\/tutor\/me\/attendance\/([^/]+)$/,
      (req, [id]) => {
        const tutorId = tutorIdOf(requireRole('tutor'));
        const session = sessions.find((s) => s.id === id);
        if (!session || session.tutor_id !== tutorId) throw new FakeError(404, 'NOT_FOUND', 'Sesi tidak ditemukan');
        if (session.status !== 'revision_requested') {
          throw new FakeError(409, 'SESSION_STATE_CONFLICT', 'Sesi hanya dapat direvisi saat berstatus Perlu revisi');
        }
        const duration = validateChoice(req.body);
        const timestamp = now().toISOString();
        Object.assign(session, {
          ...editableOf(req.body, duration),
          status: 'pending',
          validity: null,
          validity_reason: null,
          rate_amount_snapshot: null,
          admin_fee_snapshot: null,
          anomaly_analysis_status: 'pending',
          submitted_at: timestamp,
          updated_at: timestamp,
          reviewed_by_user_id: null,
          reviewed_at: null,
          admin_note: null,
        });
        for (const flag of flags.filter((f) => f.lesson_session_id === session.id && f.review_status !== 'superseded')) {
          Object.assign(flag, { review_status: 'superseded', review_note: 'superseded_by_revision' });
        }
        return ok({ session: toTutorSession(session) });
      },
    ],
    ['get', /^\/tutor\/me\/payroll$/, (req) => ok(tutorPayroll(req.params.period ?? '', tutorIdOf(requireRole('tutor'))))],
    [
      'patch',
      /^\/tutor\/me\/password$/,
      (req) => {
        const user = requireRole('tutor');
        if (passwords.get(user.id) !== req.body.current_password) throw new FakeError(401, 'UNAUTHENTICATED', 'Kredensial tidak valid');
        passwords.set(user.id, String(req.body.new_password));
        csrfToken = `demo-csrf-${user.id}-rotated`;
        return ok({ csrf_token: csrfToken });
      },
    ],

    // Parent
    [
      'get',
      /^\/parent\/me\/students$/,
      () => {
        const user = requireRole('parent');
        const items = links
          .filter((l) => l.parent_user_id === user.id)
          .map((l) => {
            const s = students.find((st) => st.id === l.student_id);
            return { id: l.student_id, full_name: s?.full_name ?? '', grade: s?.grade ?? '', school_name: s?.school_name ?? '', relationship: l.relationship };
          });
        return ok({ items });
      },
    ],
  ];

  const linkedApproved = (parentId: string, studentId: string, period: string) => {
    if (!links.some((l) => l.parent_user_id === parentId && l.student_id === studentId)) {
      throw new FakeError(403, 'FORBIDDEN', 'Anda tidak memiliki akses ke resource ini');
    }
    return inPeriod(period).filter((s) => s.status === 'approved' && s.student_id === studentId);
  };

  routes.push(
    [
      'get',
      /^\/parent\/dashboard\/summary$/,
      (req) => {
        const user = requireRole('parent');
        const rows = linkedApproved(user.id, req.params.student_id ?? '', req.params.period ?? '');
        return ok({
          period: req.params.period,
          student_id: req.params.student_id,
          approved_sessions: rows.length,
          approved_duration_minutes: rows.reduce((sum, s) => sum + s.duration_minutes, 0),
          subjects: [...new Set(rows.map((s) => core(s).subject_name))].sort(),
        });
      },
    ],
    [
      'get',
      /^\/parent\/students\/([^/]+)\/progress$/,
      (req, [studentId = '']) => {
        const user = requireRole('parent');
        const rows = linkedApproved(user.id, studentId, req.params.period ?? '').sort((a, b) => b.lesson_date.localeCompare(a.lesson_date));
        const s = students.find((st) => st.id === studentId);
        return ok({
          student: { id: studentId, full_name: s?.full_name ?? '', grade: s?.grade ?? '', school_name: s?.school_name ?? '' },
          period: req.params.period,
          sessions: rows.map((row) => {
            const c = core(row);
            return { id: row.id, lesson_date: row.lesson_date, tutor_name: c.tutor_name, subject_name: c.subject_name, duration_minutes: row.duration_minutes, learning_material: row.learning_material, learning_notes: row.learning_notes, next_focus: row.next_focus };
          }),
        });
      },
    ],
  );

  return {
    /** Hook test: sesi login dicabut server (mis. reset password / idle) → request berikutnya 401. */
    revokeSession() {
      currentUserId = null;
    },
    /** Hook test: isi tab spreadsheet demo seolah dari ekspor sebelumnya. */
    seedSheetTab(title: string, dataRows: number) {
      sheetTabs.set(title, dataRows);
    },
    /** Hook test: ekspor berikutnya gagal seperti Google menolak akses (503). */
    failNextSheetExport() {
      failNextExport = true;
    },
    handle(req: FakeRequest): FakeResponse {
      try {
        for (const [method, pattern, handler] of routes) {
          if (method !== req.method) continue;
          const match = pattern.exec(req.path);
          if (match) {
            requireCsrf(req);
            return handler(req, match.slice(1).map(decodeURIComponent));
          }
        }
        throw new FakeError(404, 'NOT_FOUND', 'Resource tidak tersedia di fake API');
      } catch (error) {
        if (error instanceof FakeError) {
          return { status: error.status, data: { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } } };
        }
        throw error;
      }
    },
  };
}

export type FakeBackend = ReturnType<typeof createFakeBackend>;
