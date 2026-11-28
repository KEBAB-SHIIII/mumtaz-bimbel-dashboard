ALTER TABLE "students" ADD COLUMN "registration_source" varchar(16);--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_registration_source_check" CHECK ("students"."registration_source" IS NULL OR "students"."registration_source" IN ('whatsapp', 'instagram', 'tiktok', 'referral', 'other'));--> statement-breakpoint
-- Keputusan owner: murid historis (sebelum field ini ada) dicatat sebagai "Lainnya".
UPDATE "students" SET "registration_source" = 'other' WHERE "registration_source" IS NULL;
