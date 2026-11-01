CREATE TABLE "lesson_session_subjects" (
	"lesson_session_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	CONSTRAINT "lesson_session_subjects_lesson_session_id_subject_id_pk" PRIMARY KEY("lesson_session_id","subject_id")
);
--> statement-breakpoint
ALTER TABLE "anomaly_flags" DROP CONSTRAINT "anomaly_flags_finding_type_check";--> statement-breakpoint
ALTER TABLE "lesson_sessions" DROP CONSTRAINT "lesson_sessions_decision_note_check";--> statement-breakpoint
ALTER TABLE "lesson_sessions" DROP CONSTRAINT "lesson_sessions_snapshot_approved_check";--> statement-breakpoint
ALTER TABLE "lesson_sessions" DROP CONSTRAINT "lesson_sessions_review_metadata_check";--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD COLUMN "start_time" time;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD COLUMN "end_time" time;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD COLUMN "validity" varchar(16);--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD COLUMN "validity_reason" text;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD COLUMN "admin_fee_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "lesson_session_subjects" ADD CONSTRAINT "lesson_session_subjects_lesson_session_id_lesson_sessions_id_fk" FOREIGN KEY ("lesson_session_id") REFERENCES "public"."lesson_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_session_subjects" ADD CONSTRAINT "lesson_session_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_session_subjects_subject_idx" ON "lesson_session_subjects" USING btree ("subject_id");--> statement-breakpoint
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_finding_type_check" CHECK ("anomaly_flags"."finding_type" IN ('suspected_duplicate', 'duration_outlier', 'late_start', 'unusual_pattern'));--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_validity_check" CHECK ("lesson_sessions"."validity" IS NULL OR "lesson_sessions"."validity" IN ('valid', 'needs_revision', 'rejected'));--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_time_range_check" CHECK (("lesson_sessions"."start_time" IS NULL AND "lesson_sessions"."end_time" IS NULL) OR ("lesson_sessions"."start_time" IS NOT NULL AND "lesson_sessions"."end_time" IS NOT NULL AND "lesson_sessions"."end_time" > "lesson_sessions"."start_time"));--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_admin_fee_snapshot_check" CHECK ("lesson_sessions"."admin_fee_snapshot" IS NULL OR "lesson_sessions"."admin_fee_snapshot" >= 0);--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_snapshot_approved_check" CHECK (("lesson_sessions"."rate_amount_snapshot" IS NULL AND "lesson_sessions"."admin_fee_snapshot" IS NULL) OR "lesson_sessions"."status" = 'approved');--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_review_metadata_check" CHECK ("lesson_sessions"."status" = 'pending' OR "lesson_sessions"."reviewed_at" IS NOT NULL);--> statement-breakpoint
-- Backfill (data-preserving): mapel tunggal lama → tabel relasi; status lama → label validitas.
INSERT INTO "lesson_session_subjects" ("lesson_session_id", "subject_id") SELECT "id", "subject_id" FROM "lesson_sessions";--> statement-breakpoint
UPDATE "lesson_sessions" SET "validity" = CASE "status" WHEN 'approved' THEN 'valid' WHEN 'rejected' THEN 'rejected' WHEN 'revision_requested' THEN 'needs_revision' END WHERE "status" <> 'pending';
