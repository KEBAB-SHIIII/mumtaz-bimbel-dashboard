CREATE TABLE "anomaly_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_session_id" uuid NOT NULL,
	"related_lesson_session_id" uuid,
	"finding_type" varchar(32) NOT NULL,
	"severity" varchar(16) NOT NULL,
	"reason" text NOT NULL,
	"evidence_summary" text,
	"provider" varchar(64),
	"model" varchar(128),
	"review_status" varchar(24) DEFAULT 'pending_review' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anomaly_flags_finding_type_check" CHECK ("anomaly_flags"."finding_type" IN ('suspected_duplicate', 'duration_outlier', 'unusual_pattern')),
	CONSTRAINT "anomaly_flags_severity_check" CHECK ("anomaly_flags"."severity" IN ('low', 'medium', 'high')),
	CONSTRAINT "anomaly_flags_review_status_check" CHECK ("anomaly_flags"."review_status" IN ('pending_review', 'confirmed_anomaly', 'false_positive', 'resolved', 'superseded')),
	CONSTRAINT "anomaly_flags_not_self_related_check" CHECK ("anomaly_flags"."related_lesson_session_id" IS NULL OR "anomaly_flags"."related_lesson_session_id" <> "anomaly_flags"."lesson_session_id")
);
--> statement-breakpoint
CREATE TABLE "app_sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_submission_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"lesson_date" date NOT NULL,
	"duration_minutes" integer NOT NULL,
	"learning_material" varchar(255) NOT NULL,
	"learning_notes" text,
	"next_focus" text,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"anomaly_analysis_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"rate_type_snapshot" varchar(20),
	"rate_amount_snapshot" numeric(12, 2),
	"rate_is_demo_snapshot" boolean,
	"reviewed_by_user_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"admin_note" text,
	CONSTRAINT "lesson_sessions_status_check" CHECK ("lesson_sessions"."status" IN ('pending', 'approved', 'revision_requested', 'rejected')),
	CONSTRAINT "lesson_sessions_anomaly_status_check" CHECK ("lesson_sessions"."anomaly_analysis_status" IN ('pending', 'completed', 'failed', 'not_evaluated')),
	CONSTRAINT "lesson_sessions_duration_check" CHECK ("lesson_sessions"."duration_minutes" > 0),
	CONSTRAINT "lesson_sessions_rate_snapshot_check" CHECK (("lesson_sessions"."rate_type_snapshot" IS NULL AND "lesson_sessions"."rate_amount_snapshot" IS NULL AND "lesson_sessions"."rate_is_demo_snapshot" IS NULL)
        OR ("lesson_sessions"."rate_type_snapshot" IN ('per_session') AND "lesson_sessions"."rate_amount_snapshot" > 0 AND "lesson_sessions"."rate_is_demo_snapshot" IS NOT NULL)),
	CONSTRAINT "lesson_sessions_snapshot_approved_check" CHECK ("lesson_sessions"."rate_amount_snapshot" IS NULL OR "lesson_sessions"."status" = 'approved'),
	CONSTRAINT "lesson_sessions_decision_note_check" CHECK ("lesson_sessions"."status" NOT IN ('revision_requested', 'rejected') OR length(btrim(coalesce("lesson_sessions"."admin_note", ''))) > 0),
	CONSTRAINT "lesson_sessions_review_metadata_check" CHECK ("lesson_sessions"."status" = 'pending' OR ("lesson_sessions"."reviewed_by_user_id" IS NOT NULL AND "lesson_sessions"."reviewed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "parent_students" (
	"parent_user_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"relationship" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_students_pkey" PRIMARY KEY("parent_user_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "sheet_export_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exported_by_user_id" uuid NOT NULL,
	"report_type" varchar(32) DEFAULT 'attendance' NOT NULL,
	"period" varchar(7) NOT NULL,
	"spreadsheet_id" varchar(128) NOT NULL,
	"sheet_title" varchar(100) NOT NULL,
	"records_exported" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) NOT NULL,
	"safe_error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "sheet_export_runs_report_type_check" CHECK ("sheet_export_runs"."report_type" IN ('attendance')),
	CONSTRAINT "sheet_export_runs_status_check" CHECK ("sheet_export_runs"."status" IN ('running', 'succeeded', 'failed')),
	CONSTRAINT "sheet_export_runs_period_check" CHECK ("sheet_export_runs"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "sheet_export_runs_records_check" CHECK ("sheet_export_runs"."records_exported" >= 0),
	CONSTRAINT "sheet_export_runs_completed_check" CHECK (("sheet_export_runs"."status" = 'running' AND "sheet_export_runs"."completed_at" IS NULL) OR ("sheet_export_runs"."status" <> 'running' AND "sheet_export_runs"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"grade" varchar(30) NOT NULL,
	"school_name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_assignments_dates_check" CHECK ("tutor_assignments"."end_date" IS NULL OR "tutor_assignments"."end_date" >= "tutor_assignments"."start_date")
);
--> statement-breakpoint
CREATE TABLE "tutor_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"rate_type" varchar(20) NOT NULL,
	"rate_amount" numeric(12, 2) NOT NULL,
	"is_demo_assumption" boolean DEFAULT false NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_rates_rate_type_check" CHECK ("tutor_rates"."rate_type" IN ('per_session')),
	CONSTRAINT "tutor_rates_amount_check" CHECK ("tutor_rates"."rate_amount" > 0),
	CONSTRAINT "tutor_rates_dates_check" CHECK ("tutor_rates"."effective_to" IS NULL OR "tutor_rates"."effective_to" >= "tutor_rates"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "tutors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"username" varchar(64),
	"email" varchar(254),
	"password_hash" text,
	"parent_access_code_hash" char(64),
	"role" varchar(16) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"credential_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('admin', 'tutor', 'parent')),
	CONSTRAINT "users_role_credentials_check" CHECK (("users"."role" IN ('admin', 'tutor') AND "users"."username" IS NOT NULL AND "users"."password_hash" IS NOT NULL AND "users"."parent_access_code_hash" IS NULL)
        OR ("users"."role" = 'parent' AND "users"."parent_access_code_hash" IS NOT NULL AND "users"."username" IS NULL AND "users"."password_hash" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_lesson_session_id_lesson_sessions_id_fk" FOREIGN KEY ("lesson_session_id") REFERENCES "public"."lesson_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_related_lesson_session_id_lesson_sessions_id_fk" FOREIGN KEY ("related_lesson_session_id") REFERENCES "public"."lesson_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_assignment_id_tutor_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."tutor_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_export_runs" ADD CONSTRAINT "sheet_export_runs_exported_by_user_id_users_id_fk" FOREIGN KEY ("exported_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_assignments" ADD CONSTRAINT "tutor_assignments_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_assignments" ADD CONSTRAINT "tutor_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_assignments" ADD CONSTRAINT "tutor_assignments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_rates" ADD CONSTRAINT "tutor_rates_assignment_id_tutor_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."tutor_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutors" ADD CONSTRAINT "tutors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anomaly_flags_lesson_session_id_idx" ON "anomaly_flags" USING btree ("lesson_session_id");--> statement-breakpoint
CREATE INDEX "anomaly_flags_review_status_idx" ON "anomaly_flags" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "app_sessions_expire_idx" ON "app_sessions" USING btree ("expire");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_sessions_client_submission_id_key" ON "lesson_sessions" USING btree ("client_submission_id");--> statement-breakpoint
CREATE INDEX "lesson_sessions_lesson_date_idx" ON "lesson_sessions" USING btree ("lesson_date");--> statement-breakpoint
CREATE INDEX "lesson_sessions_status_idx" ON "lesson_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lesson_sessions_assignment_date_idx" ON "lesson_sessions" USING btree ("assignment_id","lesson_date");--> statement-breakpoint
CREATE INDEX "lesson_sessions_anomaly_pending_idx" ON "lesson_sessions" USING btree ("anomaly_analysis_status") WHERE "lesson_sessions"."anomaly_analysis_status" = 'pending';--> statement-breakpoint
CREATE INDEX "parent_students_student_id_idx" ON "parent_students" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "sheet_export_runs_period_idx" ON "sheet_export_runs" USING btree ("period");--> statement-breakpoint
CREATE INDEX "sheet_export_runs_started_at_idx" ON "sheet_export_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "students_full_name_idx" ON "students" USING btree ("full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_name_key" ON "subjects" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "tutor_assignments_tutor_id_idx" ON "tutor_assignments" USING btree ("tutor_id");--> statement-breakpoint
CREATE INDEX "tutor_assignments_student_id_idx" ON "tutor_assignments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "tutor_rates_assignment_id_idx" ON "tutor_rates" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tutors_user_id_key" ON "tutors" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree ("username") WHERE "users"."username" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email")) WHERE "users"."email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_parent_access_code_hash_key" ON "users" USING btree ("parent_access_code_hash") WHERE "users"."parent_access_code_hash" IS NOT NULL;