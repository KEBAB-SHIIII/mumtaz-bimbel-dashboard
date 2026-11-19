ALTER TABLE "tutor_assignments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tutor_rates" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "tutor_assignments" CASCADE;--> statement-breakpoint
DROP TABLE "tutor_rates" CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_sessions" DROP CONSTRAINT "lesson_sessions_rate_snapshot_check";--> statement-breakpoint
ALTER TABLE "lesson_sessions" DROP CONSTRAINT IF EXISTS "lesson_sessions_assignment_id_tutor_assignments_id_fk";
--> statement-breakpoint
DROP INDEX "lesson_sessions_assignment_date_idx";--> statement-breakpoint
ALTER TABLE "lesson_sessions" ALTER COLUMN "tutor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ALTER COLUMN "student_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ALTER COLUMN "subject_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_sessions" DROP COLUMN "assignment_id";--> statement-breakpoint
ALTER TABLE "lesson_sessions" DROP COLUMN "rate_type_snapshot";--> statement-breakpoint
ALTER TABLE "lesson_sessions" DROP COLUMN "rate_is_demo_snapshot";--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_rate_snapshot_check" CHECK ("lesson_sessions"."rate_amount_snapshot" IS NULL OR "lesson_sessions"."rate_amount_snapshot" > 0);