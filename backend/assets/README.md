# Logo invoice Mumtaz

`mumtaz-logo.jpg` adalah salinan logo asli dari `frontend/public/Logo Bimbel.jpg`.
PDF menyematkan gambar lokal ini di dalam area lingkaran putih; file sumber tidak dimodifikasi.

Renderer memakai path relatif terhadap modul sehingga berlaku untuk `src/services/billing`
maupun `dist/services/billing`. Docker menyalin folder `backend/assets` ke image runtime.
Untuk deployment tanpa Docker, sertakan folder ini bersama `backend/dist`.

Favicon `frontend/public/favicon.svg` menyematkan logo asli sebagai data URI dengan klip
lingkaran, sehingga tidak membutuhkan permintaan gambar tambahan.

Palet invoice: biru `#26468F`, cyan `#6DCFE3`, catatan `#E3F5FA`.
Layout: header brand, penerima dan metadata, tabel sesi, panel catatan dan total.
Kolom sesi mempertahankan tanggal/jam, mapel/kelas/tutor, durasi, nominal dan tarif per jam.
Header tabel diulang pada halaman lanjutan; total berada bersama setidaknya sesi terakhir.
