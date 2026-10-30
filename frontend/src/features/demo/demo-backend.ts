/**
 * FAKE API BACKEND (in-memory) — data SINTETIS dari `@mumtaz/contracts/fixtures`.
 * Dipakai mode demo (`VITE_API_MODE=demo`) dan test UI. Bentuk respons mengikuti
 * docs/04 (diverifikasi test terhadap schema kontrak). Bukan data Neon.
 */
import {
  isDateInPeriod,
  normalizeParentAccessCode,
  type AdminAttendanceDetail,
  type AdminAttendanceListItem,
  type AnomalyFinding,
  type AuthUser,
  type ErrorCode,
  type Parent,
  type PayrollPreviewResponse,
  type RecapResponse,
  type SessionStatus,
  type Student,
  type Subject,
  type Tutor,
  type TutorAssignment,
  type TutorRate,
  type TutorSession,
} from '@mumtaz/contracts';
import {
  TEST_ONLY_CREDENTIALS,
  fixtureAnomalyFlags,
  fixtureAssignments,
  fixtureParentStudents,
  fixtureRates,
  fixtureSessions,
  fixtureStudents,
  fixtureSubjects,
  fixtureTutors,
  fixtureUsers,
  type FixtureLessonSession,
} from '@mumtaz/contracts/fixtures';

export interface DemoRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  body: Record<string, unknown>;
  csrfHeader: string | undefined;
}

export interface DemoResponse {
  status: number;
  data: unknown;
}

const FIXED_TIMESTAMP = '2026-09-01T00:00:00.000Z';

class DemoError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

const ok = (data: unknown, status = 200): DemoResponse => ({ status, data });

function demoId(prefix: string, n: number) {
  return `00000000-0000-4000-${prefix}-${String(n).padStart(12, '0')}`;
}

/** State in-memory; `createDemoBackend()` membuat salinan bersih (mis. per test). */
export function createDemoBackend(options: { now?: () => Date } = {}) {
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
  const assignmentRows = fixtureAssignments.map((a) => ({ ...a }));
  const rates: TutorRate[] = fixtureRates.map((r) => ({ ...r, created_at: FIXED_TIMESTAMP, updated_at: FIXED_TIMESTAMP }));
  const sessions: FixtureLessonSession[] = fixtureSessions.map((s) => ({ ...s }));
  const flags = fixtureAnomalyFlags.map((f) => ({ ...f }));

  let csrfToken = 'demo-csrf-anonymous';
  let currentUserId: string | null = null;

  // --- helpers ---------------------------------------------------------------

  const tutorName = (tutorId: string) => tutors.find((t) => t.id === tutorId)?.full_name ?? '';
  const assignmentView = (id: string): TutorAssignment => {
    const a = assignmentRows.find((row) => row.id === id);
    if (!a) throw new DemoError(404, 'NOT_FOUND', 'Penugasan tidak ditemukan');
    return {
      ...a,
      tutor_name: tutorName(a.tutor_id),
      student_name: students.find((s) => s.id === a.student_id)?.full_name ?? '',
      subject_name: subjects.find((s) => s.id === a.subject_id)?.name ?? '',
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    };
  };

  const core = (s: FixtureLessonSession) => {
    const a = assignmentView(s.assignment_id);
    const student = students.find((st) => st.id === a.student_id);
    return {
      id: s.id,
      assignment_id: s.assignment_id,
      tutor_id: a.tutor_id,
      tutor_name: a.tutor_name,
      student_id: a.student_id,
      student_name: a.student_name,
      grade: student?.grade ?? '',
      school_name: student?.school_name ?? '',
      subject_id: a.subject_id,
      subject_name: a.subject_name,
      lesson_date: s.lesson_date,
      duration_minutes: s.duration_minutes,
    };
  };

  const toFinding = (f: (typeof flags)[number]): AnomalyFinding => ({ ...f });

  const toListItem = (s: FixtureLessonSession): AdminAttendanceListItem => ({
    ...core(s),
    status: s.status,
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
    if (!user || !user.is_active) throw new DemoError(401, 'UNAUTHENTICATED', 'Sesi tidak valid atau sudah berakhir');
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
    if (user.role !== role) throw new DemoError(403, 'FORBIDDEN', 'Anda tidak memiliki akses ke resource ini');
    return user;
  };

  const tutorIdOf = (user: AuthUser) => tutors.find((t) => t.user_id === user.id)?.id ?? '';

  const inPeriod = (period: string) => sessions.filter((s) => isDateInPeriod(s.lesson_date, period));

  const statusCounts = (rows: FixtureLessonSession[]) => {
    const counts: Record<SessionStatus, number> = { pending: 0, approved: 0, revision_requested: 0, rejected: 0 };
    for (const row of rows) counts[row.status] += 1;
    return counts;
  };

  /** Fake payroll: approved × snapshot (nilai fixture bilangan bulat rupiah). */
  const payroll = (period: string, tutorId?: string): PayrollPreviewResponse => {
    const rows = inPeriod(period).filter((s) => !tutorId || assignmentView(s.assignment_id).tutor_id === tutorId);
    const byTutor = new Map<string, FixtureLessonSession[]>();
    for (const row of rows) {
      const id = assignmentView(row.assignment_id).tutor_id;
      byTutor.set(id, [...(byTutor.get(id) ?? []), row]);
    }
    let total = 0;
    const tutorsOut = [...byTutor.entries()].map(([id, own]) => {
      const counts = statusCounts(own);
      const priced = own.filter((s) => s.status === 'approved' && s.rate_amount_snapshot !== null);
      const amount = priced.reduce((sum, s) => sum + Number(s.rate_amount_snapshot), 0);
      total += amount;
      const isDemo = priced.some((s) => s.rate_is_demo_snapshot === true);
      return {
        tutor_id: id,
        tutor_name: tutorName(id),
        approved_sessions: counts.approved,
        pending_sessions: counts.pending,
        revision_requested_sessions: counts.revision_requested,
        rejected_sessions: counts.rejected,
        estimated_amount: String(amount),
        rate_lines: priced.length
          ? [{ rate_amount: priced[0]?.rate_amount_snapshot ?? '0', is_demo_assumption: isDemo, sessions: priced.length, subtotal: String(amount), session_ids: priced.map((s) => s.id).sort() }]
          : [],
        approved_sessions_without_rate: counts.approved - priced.length,
        is_demo_assumption: isDemo,
        sessions: [...own]
          .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date) || a.id.localeCompare(b.id))
          .map((s) => {
            const c = core(s);
            const counted = s.status === 'approved' && s.rate_amount_snapshot !== null;
            return {
              session_id: s.id,
              lesson_date: s.lesson_date,
              student_name: c.student_name,
              subject_name: c.subject_name,
              duration_minutes: s.duration_minutes,
              status: s.status,
              rate_amount: counted ? s.rate_amount_snapshot : null,
              is_demo_assumption: counted ? s.rate_is_demo_snapshot : null,
              amount: counted ? s.rate_amount_snapshot : null,
              counted,
            };
          }),
      };
    });
    return { period, tutors: tutorsOut, total_estimated_amount: String(total), is_demo_assumption: tutorsOut.some((t) => t.is_demo_assumption), warnings: [] };
  };

  const requireCsrf = (req: DemoRequest) => {
    if (req.method !== 'get' && req.csrfHeader !== csrfToken) {
      throw new DemoError(403, 'CSRF_INVALID', 'Permintaan tidak dapat diverifikasi. Muat ulang halaman lalu coba lagi.');
    }
  };

  // --- routes ------------------------------------------------------------------

  type Handler = (req: DemoRequest, match: string[]) => DemoResponse;
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
          throw new DemoError(401, 'UNAUTHENTICATED', 'Kredensial tidak valid');
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
        if (!user || !user.is_active) throw new DemoError(401, 'UNAUTHENTICATED', 'Kredensial tidak valid');
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
        const ids = new Set(rows.map((r) => r.id));
        const p = payroll(req.params.period ?? '');
        return ok({
          period: req.params.period,
          active_tutors: tutors.filter((t) => t.is_active && t.login_active).length,
          active_students: students.filter((s) => s.is_active).length,
          total_sessions: rows.length,
          status_counts: statusCounts(rows),
          anomaly_findings_pending_review: flags.filter((f) => f.review_status === 'pending_review' && ids.has(f.lesson_session_id)).length,
          honor: { estimated_amount: p.total_estimated_amount, is_demo_assumption: p.is_demo_assumption },
        });
      },
    ],
    [
      'get',
      /^\/admin\/attendance$/,
      (req) => {
        requireRole('admin');
        const { status, anomaly_status, tutor_id, student_id, subject_id, search } = req.params;
        const rows = inPeriod(req.params.period ?? '')
          .map(toListItem)
          .filter((i) => (!status || i.status === status) && (!anomaly_status || i.anomaly_analysis_status === anomaly_status) && (!tutor_id || i.tutor_id === tutor_id) && (!student_id || i.student_id === student_id) && (!subject_id || i.subject_id === subject_id))
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
        if (!s) throw new DemoError(404, 'NOT_FOUND', 'Sesi tidak ditemukan');
        return ok(toDetail(s));
      },
    ],
    [
      'patch',
      /^\/admin\/attendance\/([^/]+)\/decision$/,
      (req, [id]) => {
        const admin = requireRole('admin');
        const s = sessions.find((row) => row.id === id);
        if (!s) throw new DemoError(404, 'NOT_FOUND', 'Sesi tidak ditemukan');
        if (s.status !== 'pending') throw new DemoError(409, 'SESSION_STATE_CONFLICT', 'Hanya sesi berstatus pending yang dapat diputuskan');
        const decision = req.body.decision as SessionStatus;
        const note = typeof req.body.admin_note === 'string' ? req.body.admin_note.trim() : '';
        if (decision !== 'approved' && !note) throw new DemoError(422, 'VALIDATION_FAILED', 'Validasi gagal', [{ field: 'admin_note', message: 'Wajib diisi' }]);
        const rate = rates.find((r) => r.assignment_id === s.assignment_id && r.effective_from <= s.lesson_date && (!r.effective_to || r.effective_to >= s.lesson_date));
        Object.assign(s, {
          status: decision,
          admin_note: note || null,
          reviewed_by_user_id: admin.id,
          reviewed_at: now().toISOString(),
          updated_at: now().toISOString(),
          ...(decision === 'approved' && rate
            ? { rate_type_snapshot: rate.rate_type, rate_amount_snapshot: rate.rate_amount, rate_is_demo_snapshot: rate.is_demo_assumption }
            : {}),
        });
        return ok(toDetail(s));
      },
    ],
    [
      'patch',
      /^\/admin\/anomalies\/([^/]+)\/review$/,
      (req, [id]) => {
        const admin = requireRole('admin');
        const flag = flags.find((f) => f.id === id);
        if (!flag) throw new DemoError(404, 'NOT_FOUND', 'Temuan anomali tidak ditemukan');
        if (flag.review_status === 'superseded') {
          throw new DemoError(409, 'SESSION_STATE_CONFLICT', 'Temuan sudah digantikan oleh revisi sesi dan tidak dapat direview');
        }
        const status = req.body.review_status;
        const note = typeof req.body.review_note === 'string' ? req.body.review_note.trim() : '';
        if ((status !== 'confirmed_anomaly' && status !== 'false_positive' && status !== 'resolved') || !note) {
          throw new DemoError(422, 'VALIDATION_FAILED', 'Validasi gagal');
        }
        // Hanya temuan yang berubah; status sesi tidak disentuh.
        Object.assign(flag, { review_status: status, review_note: note, reviewed_by_user_id: admin.id, reviewed_at: now().toISOString() });
        return ok(toFinding(flag));
      },
    ],
    [
      'get',
      /^\/admin\/recap$/,
      (req) => {
        requireRole('admin');
        const groupBy = (req.params.group_by ?? 'tutor') as RecapResponse['group_by'];
        const groups = new Map<string, RecapResponse['groups'][number]>();
        for (const s of inPeriod(req.params.period ?? '')) {
          const c = core(s);
          const key = groupBy === 'tutor' ? { id: c.tutor_id, label: c.tutor_name } : groupBy === 'student' ? { id: c.student_id, label: c.student_name } : { id: c.subject_id, label: c.subject_name };
          const g = groups.get(key.id) ?? { key_id: key.id, key_label: key.label, total_sessions: 0, approved_sessions: 0, pending_sessions: 0, revision_requested_sessions: 0, rejected_sessions: 0, approved_duration_minutes: 0, session_ids: [] };
          g.total_sessions += 1;
          g.session_ids.push(s.id);
          if (s.status === 'approved') {
            g.approved_sessions += 1;
            g.approved_duration_minutes += s.duration_minutes;
          } else if (s.status === 'pending') g.pending_sessions += 1;
          else if (s.status === 'revision_requested') g.revision_requested_sessions += 1;
          else g.rejected_sessions += 1;
          groups.set(key.id, g);
        }
        const sorted = [...groups.values()].sort((a, b) => a.key_label.localeCompare(b.key_label));
        const sum = (key: 'total_sessions' | 'approved_sessions' | 'pending_sessions' | 'revision_requested_sessions' | 'rejected_sessions' | 'approved_duration_minutes') =>
          sorted.reduce((total, g) => total + g[key], 0);
        const totals = {
          total_sessions: sum('total_sessions'),
          approved_sessions: sum('approved_sessions'),
          pending_sessions: sum('pending_sessions'),
          revision_requested_sessions: sum('revision_requested_sessions'),
          rejected_sessions: sum('rejected_sessions'),
          approved_duration_minutes: sum('approved_duration_minutes'),
        };
        return ok({ period: req.params.period, group_by: groupBy, groups: sorted, totals });
      },
    ],
    ['get', /^\/admin\/payroll\/preview$/, (req) => (requireRole('admin'), ok(payroll(req.params.period ?? '')))],

    // Admin — Master Data (list + create/update ringkas)
    ['get', /^\/admin\/tutors$/, (req) => (requireRole('admin'), ok(paginate(tutors.filter((t) => matches(t.full_name, req.params.search) || matches(t.username, req.params.search)), req.params)))],
    ['get', /^\/admin\/students$/, (req) => (requireRole('admin'), ok(paginate(students.filter((s) => matches(s.full_name, req.params.search)), req.params)))],
    ['get', /^\/admin\/subjects$/, (req) => (requireRole('admin'), ok(paginate(subjects.filter((s) => matches(s.name, req.params.search)), req.params)))],
    ['get', /^\/admin\/parents$/, (req) => (requireRole('admin'), ok(paginate(users.filter((u) => u.role === 'parent' && matches(u.full_name, req.params.search)).map(toParent), req.params)))],
    ['get', /^\/admin\/tutor-assignments$/, (req) => (requireRole('admin'), ok(paginate(assignmentRows.map((a) => assignmentView(a.id)), req.params)))],
    ['get', /^\/admin\/tutor-rates$/, (req) => (requireRole('admin'), ok(paginate(rates.filter((r) => !req.params.assignment_id || r.assignment_id === req.params.assignment_id), req.params)))],
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
        if (!student) throw new DemoError(404, 'NOT_FOUND', 'Siswa tidak ditemukan');
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
          throw new DemoError(409, 'CONFLICT', 'Nama mata pelajaran sudah ada', [{ field: 'name', message: 'Nama mata pelajaran sudah ada' }]);
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
        if (!user) throw new DemoError(500, 'INTERNAL_ERROR', 'Gagal');
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
        const rows = inPeriod(req.params.period ?? '').filter((s) => assignmentView(s.assignment_id).tutor_id === tutorId);
        const p = payroll(req.params.period ?? '', tutorId);
        return ok({ period: req.params.period, status_counts: statusCounts(rows), honor: { estimated_amount: p.total_estimated_amount, is_demo_assumption: p.is_demo_assumption } });
      },
    ],
    [
      'get',
      /^\/tutor\/me\/assignments$/,
      () => {
        const tutorId = tutorIdOf(requireRole('tutor'));
        const items = assignmentRows
          .filter((a) => a.tutor_id === tutorId && a.is_active)
          .map((a) => {
            const student = students.find((s) => s.id === a.student_id);
            const subject = subjects.find((s) => s.id === a.subject_id);
            return {
              assignment_id: a.id,
              student: { id: a.student_id, full_name: student?.full_name ?? '', grade: student?.grade ?? '', school_name: student?.school_name ?? '' },
              subject: { id: a.subject_id, name: subject?.name ?? '' },
              start_date: a.start_date,
              end_date: a.end_date,
            };
          });
        return ok({ items });
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
        const assignment = assignmentRows.find((a) => a.id === body.assignment_id);
        if (!assignment || assignment.tutor_id !== tutorId || !assignment.is_active) {
          throw new DemoError(422, 'VALIDATION_FAILED', 'Validasi gagal', [{ field: 'assignment_id', message: 'Penugasan tidak valid atau tidak aktif untuk tutor ini' }]);
        }
        const timestamp = now().toISOString();
        const session: FixtureLessonSession = {
          id: nextId('8000'),
          client_submission_id: String(body.client_submission_id),
          assignment_id: assignment.id,
          lesson_date: String(body.lesson_date),
          duration_minutes: Number(body.duration_minutes),
          learning_material: String(body.learning_material),
          learning_notes: typeof body.learning_notes === 'string' ? body.learning_notes : null,
          next_focus: typeof body.next_focus === 'string' ? body.next_focus : null,
          status: 'pending',
          anomaly_analysis_status: 'pending',
          rate_type_snapshot: null,
          rate_amount_snapshot: null,
          rate_is_demo_snapshot: null,
          reviewed_by_user_id: null,
          submitted_at: timestamp,
          reviewed_at: null,
          updated_at: timestamp,
          admin_note: null,
        };
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
          .filter((s) => {
            const a = assignmentView(s.assignment_id);
            return a.tutor_id === tutorId && (!req.params.status || s.status === req.params.status) && (!req.params.student_id || a.student_id === req.params.student_id);
          })
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
        if (!session || assignmentView(session.assignment_id).tutor_id !== tutorId) throw new DemoError(404, 'NOT_FOUND', 'Sesi tidak ditemukan');
        if (session.status !== 'revision_requested') {
          throw new DemoError(409, 'SESSION_STATE_CONFLICT', 'Sesi hanya dapat direvisi saat berstatus revision_requested');
        }
        const assignment = assignmentRows.find((a) => a.id === req.body.assignment_id);
        if (!assignment || assignment.tutor_id !== tutorId || !assignment.is_active) {
          throw new DemoError(422, 'VALIDATION_FAILED', 'Validasi gagal', [{ field: 'assignment_id', message: 'Penugasan tidak valid atau tidak aktif untuk tutor ini' }]);
        }
        const timestamp = now().toISOString();
        Object.assign(session, {
          assignment_id: assignment.id,
          lesson_date: String(req.body.lesson_date),
          duration_minutes: Number(req.body.duration_minutes),
          learning_material: String(req.body.learning_material),
          learning_notes: typeof req.body.learning_notes === 'string' ? req.body.learning_notes : null,
          next_focus: typeof req.body.next_focus === 'string' ? req.body.next_focus : null,
          status: 'pending',
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
    ['get', /^\/tutor\/me\/payroll$/, (req) => ok(payroll(req.params.period ?? '', tutorIdOf(requireRole('tutor'))))],
    [
      'patch',
      /^\/tutor\/me\/password$/,
      (req) => {
        const user = requireRole('tutor');
        if (passwords.get(user.id) !== req.body.current_password) throw new DemoError(401, 'UNAUTHENTICATED', 'Kredensial tidak valid');
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
      throw new DemoError(403, 'FORBIDDEN', 'Anda tidak memiliki akses ke resource ini');
    }
    return inPeriod(period).filter((s) => s.status === 'approved' && assignmentView(s.assignment_id).student_id === studentId);
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
    handle(req: DemoRequest): DemoResponse {
      try {
        for (const [method, pattern, handler] of routes) {
          if (method !== req.method) continue;
          const match = pattern.exec(req.path);
          if (match) {
            requireCsrf(req);
            return handler(req, match.slice(1).map(decodeURIComponent));
          }
        }
        throw new DemoError(404, 'NOT_FOUND', 'Resource tidak tersedia di mode demo');
      } catch (error) {
        if (error instanceof DemoError) {
          return { status: error.status, data: { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } } };
        }
        throw error;
      }
    },
  };
}

export type DemoBackend = ReturnType<typeof createDemoBackend>;
