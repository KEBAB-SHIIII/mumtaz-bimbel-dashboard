# Phase 05 — Anomaly Screening dan Klasifikasi Dugaan Duplikasi

> **Catatan D-24 (30 Okt 2026):** penugasan tutor dan tarif per penugasan sudah dihapus. Istilah *assignment/penugasan/tarif demo* di dokumen fase ini bersifat historis; Tutor kini memilih murid dan mapel sendiri dan honor memakai satu tarif tunggal dari konfigurasi. Lihat `docs/17` D-24.

## Tujuan

Menyediakan temuan yang membantu Admin meninjau data bermasalah, terutama kandidat duplikasi atau pola tak wajar. AI/model memberi klasifikasi/indikasi, bukan keputusan final absensi atau honor.

## Alur yang diwajibkan

1. Record sesi disimpan terlebih dahulu di Neon dengan status sesi `pending` dan `anomaly_analysis_status='pending'`.
2. Validasi dasar dilakukan deterministik: field wajib, assignment, tipe tanggal/durasi dan aturan integritas.
3. Detector membuat kandidat pembanding berdasarkan field terstruktur/ID pseudonymous (misalnya tutor, siswa, mapel, tanggal, durasi). Untuk kandidat duplikasi, gunakan matching terstruktur agar model tidak perlu memproses seluruh histori secara boros.
4. Adapter model AI mengklasifikasikan kandidat/anomali yang relevan dan mengembalikan output terstruktur yang divalidasi Zod.
5. Simpan satu atau lebih finding di `anomaly_flags`, termasuk `finding_type`, sesi pembanding bila ada, severity, alasan, evidence ringkas, provider/model, dan `review_status`. Status proses analisis disimpan hanya di `lesson_sessions.anomaly_analysis_status`, bukan di setiap finding.
6. Setelah analisis selesai, update `lesson_sessions.anomaly_analysis_status` ke `completed`, `failed`, atau `not_evaluated` sesuai hasil.
7. Admin meninjau finding di Data Absensi. Hasil review dapat `confirmed_anomaly`, `false_positive`, atau `resolved`. Finding yang berasal dari payload lama ketika sesi direvisi diberi status sistem `superseded` dan tidak dapat ditetapkan manual oleh Admin.
8. Keputusan anomaly terpisah dari keputusan sesi. Admin masih harus memutuskan `approved`, `revision_requested`, atau `rejected` lewat flow absensi.

## Keamanan dan ketahanan

- Gunakan interface provider supaya unit test tidak membutuhkan API key live.
- Provider live yang direncanakan adalah Gemini: implementasikan adapter `@google/genai` di backend dan baca key/model dari environment saat owner siap melakukan setup credential. Implementasi modul/provider adapter tetap dikerjakan sekarang.
- Kirim fitur minimum dengan ID pseudonymous, bukan nama lengkap, email, telepon, kode akses Parent, atau catatan berisi PII.
- Jangan mengklaim output model sebagai hasil yang pasti/terkalibrasi atau bukti kecurangan.
- Jangan auto-delete/auto-reject sesi dan jangan mengubah honor otomatis.
- Jika provider belum dikonfigurasi/AI tidak dijalankan, gunakan `not_evaluated`; jika upaya pemanggilan provider benar-benar dilakukan tetapi timeout/error/quota/JSON tidak valid, gunakan `failed`. Record sesi yang telah tersimpan tetap valid untuk review/rekap/export sesuai statusnya. `analysis_status` ditetapkan backend, bukan dipercaya dari output model.
- AI outage tidak boleh memblokir form submit, review, rekap, honor, atau ekspor.
- Pada test/offline, gunakan fake detector deterministic dan pastikan UI/seed membedakan hasil mock dari hasil live.

## Contoh tipe finding

- `suspected_duplicate`: kandidat sesi mirip/duplikat.
- `duration_outlier`: durasi di luar range konfigurasi demo.
- `unusual_pattern`: pola yang perlu dicek Admin.

## Acceptance criteria

- [ ] Deteksi duplikasi masuk ke `anomaly_flags` dan dapat menyebut sesi pembanding.
- [ ] Status analisis sesi terpisah dari status review sesi.
- [ ] Finding ditampilkan ke Admin dengan alasan yang bisa dipahami.
- [ ] Admin dapat mereview finding tanpa mengubah status sesi secara otomatis.
- [ ] PII tidak dikirim ke model.
- [ ] Unit test berjalan tanpa credential AI.
- [ ] Error AI tidak menggagalkan penyimpanan sesi dan tidak menampilkan hasil palsu.
