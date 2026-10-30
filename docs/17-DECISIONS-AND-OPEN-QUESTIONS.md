# Decision Log dan Hal yang Belum Diputuskan

Dokumen ini memisahkan keputusan owner yang sudah disepakati untuk development dari detail yang masih perlu dikonfirmasi kepada UMKM atau tim. Coding agent tidak boleh membuka ulang keputusan yang sudah disepakati tanpa alasan teknis kuat.

## 1. Keputusan owner yang sudah disepakati

| ID | Keputusan | Dampak implementasi |
|---|---|---|
| D-01 | Tutor mengirim form dari Dashboard Tutor. | Backend memvalidasi lalu menyimpan `lesson_sessions`; tidak ada submit rutin melalui Google Forms. |
| D-02 | Neon PostgreSQL adalah source of truth. | Semua dashboard membaca melalui Express API; Sheets bukan sumber data live. |
| D-03 | MVP mencakup dashboard Admin, Tutor, dan Orang Tua. | Semua API menerapkan role/scope checks di backend. |
| D-04 | Semua dashboard menggunakan sumber sesi yang sama. | `lesson_sessions` memasok Data Absensi, Riwayat Mengajar, Rekap, Honor, dan Progress melalui query berbeda. |
| D-05 | Status awal absensi `pending`. | Admin melakukan review manual; hanya sesi `approved` masuk estimasi honor dan Progress Anak. |
| D-06 | Tarif demo development Rp50.000 per sesi. | Seed `tutor_rates`: `rate_type='per_session'`, `rate_amount=50000`, `is_demo_assumption=true`. Ini bukan tarif resmi UMKM. |
| D-07 | Materi pembelajaran termasuk pengembangan saat ini. | `learning_material` menjadi field form dan disimpan di DB; catatan/fokus dapat melengkapi Progress Anak. Materi tidak masuk ekspor standar. |
| D-08 | Modul AI mengklasifikasikan anomali, terutama dugaan duplikasi. | Kandidat masuk `anomaly_flags`; Admin meninjau finding. AI tidak auto-reject/auto-delete/mengubah honor. |
| D-09 | Admin dan Tutor login dengan username + password. | Password wajib di-hash; gunakan session cookie aman, rate limit, dan role guard. |
| D-10 | Orang Tua login dengan satu ID akses unik saja, tanpa password. | ID akses merupakan credential rahasia, bukan NPM/ID publik atau kode berurutan. Buat secara acak, simpan digest HMAC, batasi percobaan, dan hanya izinkan akses ke anak terhubung. |
| D-11 | Google Sheets hanya tujuan ekspor bulanan yang diminta Admin. | Tidak ada Sheets API call pada submit tutor, impor rutin, atau sinkronisasi dua arah pada MVP. |
| D-12 | Ekspor standar hanya berisi delapan kolom mentah UMKM. | Header: `no`, `nama tutor`, `nama murid`, `kelas`, `asal sekolah`, `mata pelajaran`, `tanggal les`, `durasi les`. Tidak ada status, materi, anomaly, honor, atau ID internal. |
| D-13 | Periode ekspor bulanan ditentukan oleh `lesson_date`. | Sesi masuk bulan berdasarkan tanggal les, bukan waktu submit/verifikasi. |
| D-14 | Ekspor ulang bulan yang sama memperbarui tab tersebut. | Gunakan tab `Absensi YYYY-MM` dan replace/update isi laporan, bukan append. Periode berdasarkan `lesson_date`. |
| D-15 | `no` adalah nomor urut output, bukan primary key. | Setiap sesi memiliki UUID internal; urutan dibuat ulang dalam report. |
| D-16 | Palet, typography, logo, dan referensi visual final belum ditentukan. | Bangun dashboard modern, bersih, responsif dengan semantic design tokens netral yang mudah diubah. Tunggu referensi tim sebelum finalisasi visual. |
| D-17 | UX harus minim friction dan tetap aman. | Auto-fill dari Master Data, field jelas, loading/empty/error/success states, role/scope checks, dan validasi server-side. |
| D-18 | Anomaly finding harus ditinjau manusia. | Status anomaly dipisahkan dari status sesi. Kandidat duplikasi bukan bukti kesalahan; jangan hapus atau tolak otomatis. |
| D-19 | Ekspor Sheets mencakup semua submission pada bulan terpilih tanpa filter status review. | Tetap gunakan delapan kolom mentah. Sebelum menulis, UI memperingatkan Admin bahwa data pending/revisi/ditolak juga ikut; jangan menyiratkan semua baris sudah disetujui. |
| D-20 | Label panjang "Simulasi — bukan tarif resmi UMKM" dihapus karena membingungkan. | Nominal dari tarif demo (`is_demo_assumption=true`) ditandai badge kecil "Tarif demo" di samping nominal pada halaman Honor saja; tidak ada alert/label di dashboard. API tidak lagi mengirim teks label (`demo_label`); UI memakai flag `is_demo_assumption`. |
| D-21 | Status analisis anomali tidak ditampilkan di UI. | `anomaly_analysis_status` tetap dipakai backend (resume worker, filter API) dan polling frontend; Admin cukup melihat temuan. |

## 2. Detail yang masih perlu konfirmasi

| ID | Pertanyaan terbuka | Default development | Tindak lanjut |
|---|---|---|---|
| O-01 | Berapa tarif honor resmi UMKM? Apakah tarif berbeda per tutor, siswa, atau mata pelajaran? | Rp50.000 per sesi, khusus demo. Tipe tarif per sesi sudah ditentukan untuk development. | Ganti nilai/rule setelah UMKM mengonfirmasi; jangan menyebut nilai demo sebagai tarif resmi. |
| O-02 | Apa spreadsheet ID dan nama target Google Sheets? Bolehkan sistem membuat/memperbarui tab bulanan? | Spreadsheet demo, tab `Absensi YYYY-MM`. | Minta owner menyiapkan akses dan izin sebelum live smoke test. |
| O-03 | Kriteria/pola apa (termasuk threshold durasi outlier) yang perlu ditandai sebagai anomali? | Kandidat/rule awal configurable dan dilabeli heuristik; AI mengklasifikasikan kandidat, bukan menetapkan aturan bisnis resmi. Ini berbeda dari hard validation yang menolak input (O-12). | Diskusikan kriteria anomali dengan UMKM setelah melihat data aktual yang diizinkan. |
| O-04 | Apakah data historis dari spreadsheet lama perlu dimigrasi ke aplikasi? | Tidak diimpor otomatis; gunakan synthetic seed. | Jika dibutuhkan, lakukan migrasi terpisah dengan mapping, validasi, dan rekonsiliasi. |
| O-05 | Referensi visual final apa yang akan dipakai tim? | Neutral semantic tokens dan dashboard modern/minimal yang terinspirasi referensi tim/Dribbble secara umum. | Tim memberikan referensi spesifik, palet dan typography setelah meeting; jangan menebak dulu. |
| O-06 | Bagaimana ID Akses Orang Tua dibagikan dan dipulihkan jika hilang? | Admin generate/rotate dan membagikan secara privat. | Putuskan SOP distribusi dan verifikasi wali. Karena akses tanpa password, ID harus rahasia dan sulit ditebak. |
| O-07 | Apakah pembayaran aktual harus dicatat dalam scope MVP? | MVP menampilkan estimasi honor, bukan status pembayaran. | Tambahkan payroll/payment tracking hanya jika kebutuhan dikonfirmasi. |
| O-09 | Apakah `learning_material` wajib diisi? | Working default saat development: wajib; `learning_notes` dan `next_focus` opsional. | Owner setuju field materi dicantumkan, tetapi wajib/opsionalnya belum dinyatakan eksplisit. Konfirmasi sebelum final UX. |
| O-10 | Apa yang harus terjadi pada laporan lama jika nama/kelas/sekolah/mapel master berubah? | Working default: ekspor join nilai master saat ini; tidak ada snapshot historis pada skema baseline. | Konfirmasi apakah diperlukan snapshot nilai pada tanggal sesi untuk laporan historis. |
| O-11 | Format tanggal dan durasi persis seperti apa yang dipakai pada spreadsheet asli UMKM? | Untuk fixture/dev: tanggal teks `DD/MM/YYYY` dan durasi `N menit`. | Cocokkan dengan spreadsheet asli sebelum live export; jika format/unit berbeda, ubah mapping/export tests terlebih dahulu. |
| O-12 | Batas durasi mana yang harus ditolak sebagai input invalid versus diterima namun ditandai sebagai outlier anomali? | Reject bila bukan integer positif; threshold outlier dibuat configurable dan menghasilkan finding/review, bukan auto-reject. Belum ada batas maksimum bisnis yang disepakati. | Tetapkan batas hard-validation dan threshold anomali setelah diskusi UMKM; jangan mengarang angka sebagai aturan resmi. |
| O-13 | Apakah `learning_notes` dan `next_focus` perlu menjadi field MVP untuk Progress Anak, atau cukup `learning_material` dahulu? | Disarankan sebagai field opsional; `learning_material` tetap working default required O-09. | Konfirmasi cakupan UX sebelum finalisasi form dan Parent Progress. |
| O-14 | Apakah tutor boleh submit tanggal les yang akan datang, dan apakah sesi lama/backdated dibolehkan? | Working default: tolak tanggal di masa depan berdasarkan tanggal lokal `Asia/Jakarta`, izinkan tanggal lampau untuk pelaporan terlambat. | Konfirmasi kebijakan tanggal dengan UMKM sebelum menjadikan validasi ini aturan final. |
| O-15 | Apakah Admin perlu mengedit field absensi secara langsung, memperbaiki/membuka kembali sesi setelah `approved`/`rejected`, atau menghapus sesi? | Working default: tidak ada endpoint edit field absensi oleh Admin atau delete; Admin hanya memutuskan review. Tutor memperbaiki melalui `revision_requested`; `approved` dan `rejected` terminal tanpa reopen. | Konfirmasi dengan UMKM. Jika koreksi langsung/pascakeputusan dibutuhkan, rancang izin, state/correction flow, dan audit trail terlebih dahulu; jangan mengubah data final secara diam-diam. |
| O-16 | Bagaimana Tutor yang lupa password dipulihkan? Apakah Admin perlu fitur reset password tutor? | Working default: Tutor dapat mengganti password sendiri lewat tab Profil (`PATCH /tutor/me/password`); belum ada endpoint reset password oleh Admin. | Konfirmasi SOP pemulihan akun; jika Admin reset dibutuhkan, tambahkan field/endpoint terpisah dengan audit dan jangan menampilkan password di log. |

## 3. Batasan dan risiko yang diketahui

- Baseline menyimpan keputusan review terakhir di `lesson_sessions`; full audit history untuk setiap perubahan status adalah P1/future, bukan fitur yang bisa dihasilkan dari schema saat ini.
- Session auth baseline menggunakan server-side session store di PostgreSQL; jangan gunakan Express MemoryStore pada production. Detail store dan CSRF token bootstrap di kontrak API.

- Spreadsheet belum memuat jam mulai/selesai, sehingga sistem tidak bisa memastikan sesi bertabrakan secara akurat.
- Materi dan catatan pembelajaran adalah laporan tutor, bukan penilaian akademik formal.
- Finding anomali/duplikasi adalah indikasi untuk review, bukan bukti kecurangan.
- Ekspor Sheets adalah snapshot. Perubahan manual di Sheets tidak mengubah Neon; Admin perlu ekspor ulang untuk memperbarui snapshot.
- Login ID akses Orang Tua tanpa password adalah kompromi UX/security. Kode harus random/berentropi tinggi, private, rate-limited, dapat dirotasi, dan tidak pernah ditulis ke log. Jangan gunakan NPM/nomor publik sebagai credential.
- Credential AI/Sheets disiapkan kemudian oleh owner. Dalam tests gunakan adapter fake, tetapi jangan menyebut hasil fake sebagai hasil integrasi live.

## 4. Aturan memperbarui dokumen

Jika ada keputusan baru dari tim/UMKM, perbarui dokumen yang terkait secara konsisten: `01-PRD.md`, `02-AGENT-CONTEXT.md`, `03-TECHNICAL-ARCHITECTURE.md`, API/data contract, user flow, ERD, dashboard tabs, export specification, fixtures, tests, dan phase docs. Jangan mengubah aturan hanya pada satu dokumen.
