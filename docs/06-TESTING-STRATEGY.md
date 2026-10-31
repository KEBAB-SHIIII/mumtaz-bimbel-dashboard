# Testing Strategy

## Prinsip

Tes membuktikan aturan akses, validasi data, periode, verifikasi manual, klasifikasi anomali, payroll demo, dan ekspor laporan. Unit/integration tests tidak boleh memerlukan credential Google Sheets atau Gemini live; gunakan fake adapter untuk tes deterministik dan bedakan dari smoke test live.

## Unit tests backend

- Validator submit form: field wajib, durasi bukan integer/tidak positif, tanggal tidak valid, murid/mapel nonaktif atau tidak ada.
- Mapping sesi → row ekspor delapan kolom; `no` berurutan, tanggal/durasi konsisten, tanpa field tambahan.
- Period filter `YYYY-MM` memakai `lesson_date`, termasuk sesi yang baru disubmit pada bulan berikutnya.
- Payroll: hanya sesi approved; tarif dummy Rp50.000 per sesi dibaca dari `tutor_rates`; hasil decimal-safe dengan flag `is_demo_assumption` (UI: badge "Tarif demo").
- Retry `PATCH` revisi: jika respons pertama hilang dan sesi sudah `pending` dengan payload editable yang identik, server mengembalikan sesi yang sama tanpa mengubah timestamp atau menjadwalkan analisis ulang kedua kali; state/payload berbeda menghasilkan `409 SESSION_STATE_CONFLICT`.
- State transition: pending → approved/revision_requested/rejected; tutor hanya memperbaiki sesi miliknya yang revision_requested; setelah revisi kembali pending, `submitted_at` diperbarui, metadata review dibersihkan, finding lama menjadi `superseded`; sesi approved/rejected tidak dapat dibuka ulang pada baseline working default O-15; jika keputusan ini berubah, update state-machine tests.
- Anomaly service membentuk/menilai kandidat duplikasi berdasarkan atribut sesi dan dapat mengembalikan `suspected_duplicate` dengan referensi sesi pembanding.
- Anomaly finding terpisah dari status sesi. Tidak ada auto-reject, auto-delete, atau perubahan honor oleh AI.
- Model response schema invalid, timeout/quota/error memberi status `failed`/`not_evaluated` dengan pesan aman.
- Google Sheets exporter: membuat tab jika belum ada, replace/update tab periode yang sama tanpa append duplikat, membersihkan sisa cell A:H secara atomik bila memungkinkan, menangani bulan kosong dan API failure, serta mencatat export run.
- Export selection: tests memastikan semua status (`pending`, `approved`, `revision_requested`, `rejected`) pada periode terpilih ikut diekspor dalam delapan kolom mentah.
- Export history: GET history memfilter periode dan mengembalikan status/timestamps/records/link dari spreadsheet ID yang tersimpan.
- Empty export: tab lama yang berisi tidak diganti oleh hasil kosong tanpa `confirm_empty_replace=true`; preflight 409 tidak meninggalkan log export.
- Export replacement failure: API failure tidak boleh menghapus data report lama; simulasi failure sebelum batch update dan verifikasi Neon tetap utuh.
- Auth: role credential sesuai aturan, password hash tidak bocor, ID Akses Orang Tua digest-only dan rate-limited, session store/rotation dan CSRF token bootstrap/validation diuji.
- Error sanitization: tidak ada credential, private key, parent access code, atau detail API sensitif dalam response/log.

## Authorization/API tests (Supertest)

- Endpoint terlindungi menolak request tanpa session; role mismatch mengembalikan 403.
- Admin/Tutor login username-password; Parent login hanya memakai ID Akses Orang Tua, dengan rate limit dan respons gagal generik.
- Tutor submit memakai tutor dari session, mengabaikan/menolak tutor ID palsu dari request body.
- Tutor tidak dapat membaca/mengubah sesi tutor lain.
- Tutor hanya dapat mengubah sesi sendiri yang berstatus revision_requested.
- Parent hanya bisa membaca siswa melalui `parent_students`; tidak dapat mengakses anak lain dengan mengganti URL/ID.
- Response Parent tidak pernah mengandung admin note, anomaly detail internal, honor/tarif, kode akses atau data siswa lain.
- Hanya Admin yang dapat approve/reject, review anomaly, mengelola Master Data, dan mengekspor Google Sheets.
- Google Sheets API failure tidak merollback atau menghapus data Neon.

## Frontend tests (Vitest + React Testing Library)

- Loading, error, empty dan success states di setiap tab.
- Form auto-fills tutor identity, grade/school dari murid yang dipilih sendiri; menyimpan pending dan memberi konfirmasi setelah DB commit.
- Temuan anomaly ditampilkan sebagai indikator yang perlu direview, bukan status sesi atau tuduhan otomatis.
- Monthly selector mengubah query key/list sesuai periode.
- Admin status badges, keputusan verifikasi dan workflow revisi.
- Riwayat/honor Tutor dibatasi ke tutor login.
- Parent login hanya mempunyai satu field ID Akses Orang Tua; progress hanya memuat anak terkait dan sesi approved.
- Export meminta periode valid, menampilkan loading, dan menyatakan hasil/error sesuai response.
- Axios mock mengikuti API contract; jangan memakai native fetch untuk request API aplikasi.

## Integration/smoke tests (credential live bila tersedia)

1. Buat tutor (password acak sekali tampil), siswa, dan mapel; tarif tunggal Rp50.000/sesi dari konfigurasi.
2. Login Tutor, submit sesi, pastikan status pending, tersimpan di Neon, dan tidak ada call Sheets saat submit.
3. Pastikan anomaly detector dipanggil melalui adapter. Dalam test offline gunakan fake detector yang diberi label; jika menguji Gemini live, gunakan credential valid dan data sintetis/pseudonymous.
4. Login Admin, review temuan anomali secara terpisah, lalu approve sesi. Pastikan honor/progress hanya memasukkan sesi setelah approved.
5. Login sebagai tutor lain dan pastikan data tutor pertama tidak dapat diakses.
6. Login Parent memakai access-code fixture test-only; pastikan hanya progress anak terhubung yang approved terlihat. Uji kode salah/rate limit.
7. Ekspor satu bulan ke spreadsheet demo. Cocokkan row count dan delapan kolom dengan query Neon.
8. Re-export bulan yang sama setelah perubahan sesi approved; pastikan tab diperbarui tanpa duplikasi.
9. Cabut permission Sheet sementara dalam test terkontrol; pastikan export gagal jujur dan database tetap utuh.

## Quality gates

Jalankan `npm test`, `npm run typecheck`, `npm run lint`, dan `npm run build` yang benar-benar tersedia di repository. Catat perintah dan hasil aktual; jangan mengklaim command lolos jika belum dijalankan. Bedakan unit/mock test dari smoke test integrasi live.
