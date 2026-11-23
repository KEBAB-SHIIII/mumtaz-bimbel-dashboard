CREATE TABLE "learning_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(16) NOT NULL,
	"student_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"lesson_session_id" uuid,
	"source_fingerprint" varchar(64) NOT NULL,
	"overall_status" varchar(24) NOT NULL,
	"summary" text NOT NULL,
	"strengths" jsonb NOT NULL,
	"areas_to_improve" jsonb NOT NULL,
	"subjects_covered" jsonb NOT NULL,
	"provider" varchar(40),
	"model" varchar(80),
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_summaries_scope_check" CHECK ("learning_summaries"."scope" IN ('session', 'monthly')),
	CONSTRAINT "learning_summaries_status_check" CHECK ("learning_summaries"."overall_status" IN ('very_good', 'good', 'needs_attention')),
	CONSTRAINT "learning_summaries_period_check" CHECK ("learning_summaries"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "learning_summaries_scope_session_check" CHECK (("learning_summaries"."scope" = 'session' AND "learning_summaries"."lesson_session_id" IS NOT NULL) OR ("learning_summaries"."scope" = 'monthly' AND "learning_summaries"."lesson_session_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "learning_summaries" ADD CONSTRAINT "learning_summaries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_summaries" ADD CONSTRAINT "learning_summaries_lesson_session_id_lesson_sessions_id_fk" FOREIGN KEY ("lesson_session_id") REFERENCES "public"."lesson_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_summaries_student_period_idx" ON "learning_summaries" USING btree ("student_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_summaries_session_key" ON "learning_summaries" USING btree ("lesson_session_id") WHERE "learning_summaries"."scope" = 'session';--> statement-breakpoint
CREATE UNIQUE INDEX "learning_summaries_monthly_key" ON "learning_summaries" USING btree ("student_id","period") WHERE "learning_summaries"."scope" = 'monthly';
