-- Custom migration: aturan anti-overlap yang tidak dapat diekspresikan schema Drizzle.
-- docs/04 §4: tarif tidak boleh overlap untuk assignment yang sama; assignment aktif
-- dengan tuple tutor+siswa+mapel yang sama tidak boleh overlap periodenya.
-- Rentang tanggal inklusif '[]'; effective_to/end_date NULL = tanpa batas akhir.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "tutor_rates"
  ADD CONSTRAINT "tutor_rates_no_overlap"
  EXCLUDE USING gist (
    "assignment_id" WITH =,
    daterange("effective_from", "effective_to", '[]') WITH &&
  );
--> statement-breakpoint
ALTER TABLE "tutor_assignments"
  ADD CONSTRAINT "tutor_assignments_active_no_overlap"
  EXCLUDE USING gist (
    "tutor_id" WITH =,
    "student_id" WITH =,
    "subject_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("is_active");
