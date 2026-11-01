ALTER TABLE "lesson_sessions" DROP CONSTRAINT "lesson_sessions_subject_id_subjects_id_fk";
--> statement-breakpoint
ALTER TABLE "lesson_sessions" DROP COLUMN "subject_id";