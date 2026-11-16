CREATE TABLE "student_grade_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"changed_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_grade_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"grade" varchar(30) NOT NULL,
	"effective_from" date NOT NULL,
	"reason" text NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD COLUMN "grade_snapshot" varchar(30);--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD COLUMN "grade_source" varchar(16) DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_sessions" ADD COLUMN "hourly_rate_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "student_grade_audit" ADD CONSTRAINT "student_grade_audit_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_grade_audit" ADD CONSTRAINT "student_grade_audit_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_grade_history" ADD CONSTRAINT "student_grade_history_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_grade_history" ADD CONSTRAINT "student_grade_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "student_grade_effective_key" ON "student_grade_history" USING btree ("student_id","effective_from");
--> statement-breakpoint
-- Initial class is the current master value, not a reconstructed historical fact.
INSERT INTO student_grade_history (student_id, grade, effective_from, reason)
SELECT id, grade, '0001-01-01', 'Kelas awal dari data master saat migrasi' FROM students;
--> statement-breakpoint
-- Preserve every historical gross/admin amount. Derive the old hourly basis from gross, when known.
UPDATE lesson_sessions ls SET grade_snapshot = s.grade, grade_source = 'legacy',
 hourly_rate_snapshot = CASE WHEN ls.rate_amount_snapshot IS NOT NULL
   THEN ls.rate_amount_snapshot / (1 + GREATEST(0, FLOOR((ls.duration_minutes::numeric - 60) / 30)) * 0.5)
   WHEN s.grade IN ('PAUD','TK') THEN 40000
   WHEN s.grade IN ('1 SD','2 SD','3 SD') THEN 60000
   WHEN s.grade IN ('4 SD','5 SD','6 SD') THEN 80000
   WHEN s.grade IN ('1 SMP','2 SMP','3 SMP') THEN 100000
   WHEN s.grade IN ('1 SMA','2 SMA','3 SMA') THEN 120000 ELSE NULL END
FROM students s WHERE s.id = ls.student_id;
