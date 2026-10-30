# Synthetic fixtures

Semua data dalam folder ini sepenuhnya sintetis. Jangan mengganti nama contoh dengan data pribadi tutor/murid UMKM.

- `attendance-sample.csv`: contoh sintetis berbentuk CSV lama untuk referensi header dan pengujian parser/anomaly fixture terisolasi. File ini sengaja memuat baris invalid/duplikat dan nama tutor/siswa/mapel yang tidak semuanya ada di `seed-data.json`; **jangan gunakan untuk seed langsung `lesson_sessions`, jangan implementasikan import CSV/Sheets pada baseline.** Database seed relational yang valid hanya berasal dari `seed-data.json` dan factory test yang sesuai schema.
- `seed-data.json`: contoh master data dan assignment sintetis dengan UUID stabil (nama fiktif: 6 tutor, 12 siswa, 8 wali, 4 mapel, 16 assignment termasuk 1 nonaktif); tarif yang tercantum adalah asumsi demonstrasi saja. Isinya identik dengan `packages/contracts/src/fixtures/master-data.ts` dan dijaga oleh test `packages/contracts/tests/fixtures.test.ts`. Sesi les test (`s01–s11`), finding anomali, expected outcomes, dan generator dataset dev (`dev-dataset.ts`, ~150 sesi untuk Neon development) ada di fixture TypeScript tersebut, bukan di file JSON ini.
- `anomaly-response.json`: contoh **output normalisasi anomaly service** (bukan raw model JSON), bukan bukti hasil Gemini live. `analysis_status` ditetapkan service backend; model/provider hanya menyarankan findings yang lalu divalidasi schema.
- `fixture-expectations.md`: aturan contoh deterministik untuk pengujian field mapping, period grouping dan status sesi. Tidak ada ekspektasi `import_run` karena import bukan alur utama.

Format pada CSV contoh: tanggal `DD/MM/YYYY`, durasi `N menit`. Kolom `no` hanya urutan tampilan. Jangan mengasumsikan format nilai itu sama dengan spreadsheet UMKM tanpa konfirmasi.
