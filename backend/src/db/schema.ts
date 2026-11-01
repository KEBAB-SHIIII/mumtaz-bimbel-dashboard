import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  json,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Skema Neon PostgreSQL — docs/14 (ERD & data dictionary).
 * Aturan yang tidak bisa diekspresikan Drizzle (exclusion constraint anti-overlap)
 * ada di migration custom `drizzle/0001_*`.
 */

const timestamps = {
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Nominal IDR: numeric (bukan float). */
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    full_name: varchar('full_name', { length: 120 }).notNull(),
    username: varchar('username', { length: 64 }),
    email: varchar('email', { length: 254 }),
    password_hash: text('password_hash'),
    parent_access_code_hash: char('parent_access_code_hash', { length: 64 }),
    role: varchar('role', { length: 16 }).notNull(),
    is_active: boolean('is_active').notNull().default(true),
    /**
     * Dinaikkan saat password diganti, kode akses dirotasi, atau login dinonaktifkan.
     * Session yang menyimpan versi lama otomatis tidak berlaku (revocation).
     */
    credential_version: integer('credential_version').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_username_key').on(t.username).where(sql`${t.username} IS NOT NULL`),
    uniqueIndex('users_email_key').on(sql`lower(${t.email})`).where(sql`${t.email} IS NOT NULL`),
    uniqueIndex('users_parent_access_code_hash_key')
      .on(t.parent_access_code_hash)
      .where(sql`${t.parent_access_code_hash} IS NOT NULL`),
    check('users_role_check', sql`${t.role} IN ('admin', 'tutor', 'parent')`),
    // Credential harus sesuai jenis akun (docs/14 §4).
    check(
      'users_role_credentials_check',
      sql`(${t.role} IN ('admin', 'tutor') AND ${t.username} IS NOT NULL AND ${t.password_hash} IS NOT NULL AND ${t.parent_access_code_hash} IS NULL)
        OR (${t.role} = 'parent' AND ${t.parent_access_code_hash} IS NOT NULL AND ${t.username} IS NULL AND ${t.password_hash} IS NULL)`,
    ),
  ],
);

export const tutors = pgTable(
  'tutors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    phone: varchar('phone', { length: 20 }),
    is_active: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('tutors_user_id_key').on(t.user_id)],
);

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    full_name: varchar('full_name', { length: 120 }).notNull(),
    grade: varchar('grade', { length: 30 }).notNull(),
    school_name: varchar('school_name', { length: 120 }).notNull(),
    is_active: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('students_full_name_idx').on(t.full_name)],
);

export const parentStudents = pgTable(
  'parent_students',
  {
    parent_user_id: uuid('parent_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    student_id: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    relationship: varchar('relationship', { length: 40 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'parent_students_pkey', columns: [t.parent_user_id, t.student_id] }),
    index('parent_students_student_id_idx').on(t.student_id),
  ],
);

export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    is_active: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('subjects_name_key').on(sql`lower(${t.name})`)],
);

export const lessonSessions = pgTable(
  'lesson_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    client_submission_id: uuid('client_submission_id').notNull(),
    tutor_id: uuid('tutor_id')
      .notNull()
      .references(() => tutors.id, { onDelete: 'restrict' }),
    student_id: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    lesson_date: date('lesson_date', { mode: 'string' }).notNull(),
    /** Jam mulai/selesai les (WIB); `null` hanya untuk sesi lama sebelum jam dicatat. Durasi dihitung backend. */
    start_time: time('start_time'),
    end_time: time('end_time'),
    duration_minutes: integer('duration_minutes').notNull(),
    learning_material: varchar('learning_material', { length: 255 }).notNull(),
    learning_notes: text('learning_notes'),
    next_focus: text('next_focus'),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    anomaly_analysis_status: varchar('anomaly_analysis_status', { length: 16 }).notNull().default('pending'),
    /** Label validitas data dari AI (atau koreksi Admin); `null` = belum divalidasi. */
    validity: varchar('validity', { length: 16 }),
    validity_reason: text('validity_reason'),
    /** Snapshot saat sesi dihitung (approved): tarif les kotor dan potongan Admin per sesi. */
    rate_amount_snapshot: money('rate_amount_snapshot'),
    admin_fee_snapshot: money('admin_fee_snapshot'),
    reviewed_by_user_id: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
    submitted_at: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    admin_note: text('admin_note'),
  },
  (t) => [
    uniqueIndex('lesson_sessions_client_submission_id_key').on(t.client_submission_id),
    index('lesson_sessions_lesson_date_idx').on(t.lesson_date),
    index('lesson_sessions_status_idx').on(t.status),
    index('lesson_sessions_tutor_date_idx').on(t.tutor_id, t.lesson_date),
    index('lesson_sessions_student_date_idx').on(t.student_id, t.lesson_date),
    index('lesson_sessions_anomaly_pending_idx')
      .on(t.anomaly_analysis_status)
      .where(sql`${t.anomaly_analysis_status} = 'pending'`),
    check(
      'lesson_sessions_status_check',
      sql`${t.status} IN ('pending', 'approved', 'revision_requested', 'rejected')`,
    ),
    check(
      'lesson_sessions_anomaly_status_check',
      sql`${t.anomaly_analysis_status} IN ('pending', 'completed', 'failed', 'not_evaluated')`,
    ),
    check('lesson_sessions_duration_check', sql`${t.duration_minutes} > 0`),
    check(
      'lesson_sessions_validity_check',
      sql`${t.validity} IS NULL OR ${t.validity} IN ('valid', 'needs_revision', 'rejected')`,
    ),
    check(
      'lesson_sessions_time_range_check',
      sql`(${t.start_time} IS NULL AND ${t.end_time} IS NULL) OR (${t.start_time} IS NOT NULL AND ${t.end_time} IS NOT NULL AND ${t.end_time} > ${t.start_time})`,
    ),
    check('lesson_sessions_rate_snapshot_check', sql`${t.rate_amount_snapshot} IS NULL OR ${t.rate_amount_snapshot} > 0`),
    check('lesson_sessions_admin_fee_snapshot_check', sql`${t.admin_fee_snapshot} IS NULL OR ${t.admin_fee_snapshot} >= 0`),
    // Snapshot nominal hanya untuk sesi approved (yang dihitung ke honor & tagihan).
    check(
      'lesson_sessions_snapshot_approved_check',
      sql`(${t.rate_amount_snapshot} IS NULL AND ${t.admin_fee_snapshot} IS NULL) OR ${t.status} = 'approved'`,
    ),
    // Keputusan (oleh AI atau Admin) selalu bertanggal; `reviewed_by_user_id` null = diputuskan AI.
    check('lesson_sessions_review_metadata_check', sql`${t.status} = 'pending' OR ${t.reviewed_at} IS NOT NULL`),
  ],
);

/** Mata pelajaran per sesi: satu sesi bisa mencakup beberapa mapel (revisi PM), tarif tetap per sesi. */
export const lessonSessionSubjects = pgTable(
  'lesson_session_subjects',
  {
    lesson_session_id: uuid('lesson_session_id')
      .notNull()
      .references(() => lessonSessions.id, { onDelete: 'cascade' }),
    subject_id: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.lesson_session_id, t.subject_id] }),
    index('lesson_session_subjects_subject_idx').on(t.subject_id),
  ],
);

export const anomalyFlags = pgTable(
  'anomaly_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lesson_session_id: uuid('lesson_session_id')
      .notNull()
      .references(() => lessonSessions.id, { onDelete: 'restrict' }),
    related_lesson_session_id: uuid('related_lesson_session_id').references(() => lessonSessions.id, {
      onDelete: 'restrict',
    }),
    finding_type: varchar('finding_type', { length: 32 }).notNull(),
    severity: varchar('severity', { length: 16 }).notNull(),
    reason: text('reason').notNull(),
    evidence_summary: text('evidence_summary'),
    provider: varchar('provider', { length: 64 }),
    model: varchar('model', { length: 128 }),
    review_status: varchar('review_status', { length: 24 }).notNull().default('pending_review'),
    reviewed_by_user_id: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    review_note: text('review_note'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('anomaly_flags_lesson_session_id_idx').on(t.lesson_session_id),
    index('anomaly_flags_review_status_idx').on(t.review_status),
    check(
      'anomaly_flags_finding_type_check',
      sql`${t.finding_type} IN ('suspected_duplicate', 'duration_outlier', 'late_start', 'unusual_pattern')`,
    ),
    check('anomaly_flags_severity_check', sql`${t.severity} IN ('low', 'medium', 'high')`),
    check(
      'anomaly_flags_review_status_check',
      sql`${t.review_status} IN ('pending_review', 'confirmed_anomaly', 'false_positive', 'resolved', 'superseded')`,
    ),
    check(
      'anomaly_flags_not_self_related_check',
      sql`${t.related_lesson_session_id} IS NULL OR ${t.related_lesson_session_id} <> ${t.lesson_session_id}`,
    ),
  ],
);

export const sheetExportRuns = pgTable(
  'sheet_export_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exported_by_user_id: uuid('exported_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    report_type: varchar('report_type', { length: 32 }).notNull().default('attendance'),
    period: varchar('period', { length: 7 }).notNull(),
    spreadsheet_id: varchar('spreadsheet_id', { length: 128 }).notNull(),
    sheet_title: varchar('sheet_title', { length: 100 }).notNull(),
    records_exported: integer('records_exported').notNull().default(0),
    status: varchar('status', { length: 16 }).notNull(),
    safe_error_message: text('safe_error_message'),
    started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('sheet_export_runs_period_idx').on(t.period),
    // Satu ekspor berjalan per periode & jenis laporan (aman lintas instance API).
    uniqueIndex('sheet_export_runs_one_running_per_period')
      .on(t.report_type, t.period)
      .where(sql`${t.status} = 'running'`),
    index('sheet_export_runs_started_at_idx').on(t.started_at),
    check('sheet_export_runs_report_type_check', sql`${t.report_type} IN ('attendance')`),
    check('sheet_export_runs_status_check', sql`${t.status} IN ('running', 'succeeded', 'failed')`),
    check('sheet_export_runs_period_check', sql`${t.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check('sheet_export_runs_records_check', sql`${t.records_exported} >= 0`),
    check(
      'sheet_export_runs_completed_check',
      sql`(${t.status} = 'running' AND ${t.completed_at} IS NULL) OR (${t.status} <> 'running' AND ${t.completed_at} IS NOT NULL)`,
    ),
  ],
);

/**
 * Tabel infrastruktur session — skema kompatibel dengan `connect-pg-simple`.
 * Bukan entitas domain; dibuat lewat migration (bukan auto-create library).
 */
export const appSessions = pgTable(
  'app_sessions',
  {
    sid: varchar('sid').primaryKey(),
    sess: json('sess').notNull(),
    expire: timestamp('expire', { precision: 6 }).notNull(),
  },
  (t) => [index('app_sessions_expire_idx').on(t.expire)],
);
