ALTER TABLE "lesson_sessions" ADD COLUMN "tutor_id" uuid;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD COLUMN "student_id" uuid;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD COLUMN "subject_id" uuid;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_sessions_tutor_date_idx" ON "lesson_sessions" USING btree ("tutor_id","lesson_date");--> statement-breakpoint
CREATE INDEX "lesson_sessions_student_date_idx" ON "lesson_sessions" USING btree ("student_id","lesson_date");
--> statement-breakpoint
-- Isi tutor/murid/mapel dari penugasan lama (data sesi dipertahankan). Dihapus di 0004.
UPDATE "lesson_sessions" AS s SET "tutor_id" = a."tutor_id", "student_id" = a."student_id", "subject_id" = a."subject_id" FROM "tutor_assignments" AS a WHERE a."id" = s."assignment_id";
