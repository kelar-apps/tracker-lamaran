# Checklist uji coba sebelum rilis

Jalankan checklist ini di versi yang sudah di-deploy (`https://USERNAME.github.io/NAMA-REPO/`), di **HP Android (Chrome)** dan **iPhone (Safari)**. Centang kolom **A** untuk Android dan **i** untuk iPhone.

Siapkan dulu:

- **Akun pembeli**: email Google yang ada di sheet Pembeli (`produk` = `tracker-lamaran`, `status` = `aktif`).
- **Akun bukan pembeli**: email Google lain yang **tidak** ada di sheet Pembeli.
- Kalau OAuth masih berstatus Testing, kedua email itu harus terdaftar sebagai **Test users** (SETUP.md bagian 2).
- Supaya pengingat follow-up cepat muncul, ubah **Ingatkan follow-up setelah** jadi **3 hari** di Pengaturan, lalu kembalikan ke 7 setelah selesai.

## 0. Otomatis (di laptop)

- [ ] `npm test` lolos tanpa error.
- [ ] `npm run build` lolos tanpa error.
- [ ] Workflow **Deploy ke GitHub Pages** di tab **Actions** berwarna hijau.

## 1. Lisensi

| | A | i |
| --- | --- | --- |
| Buka app di browser, tap **Masuk dengan Google**, lalu pilih **akun bukan pembeli** → muncul layar **Akses belum aktif**, berisi email itu, tombol **Beli sekarang** dan **Ganti akun Google**, dan teks kecil soal email checkout. | [ ] | [ ] |
| **Beli sekarang** membuka halaman checkout di tab baru. | [ ] | [ ] |
| **Ganti akun Google** → pilih **akun pembeli** → app terbuka. | [ ] | [ ] |

## 2. Alur utama (akun pembeli)

| | A | i |
| --- | --- | --- |
| Login pertama: muncul layar "Menyiapkan spreadsheet-mu…", lalu Beranda. Di Google Drive ada spreadsheet **Kelar — Tracker Lamaran** dengan 4 sheet. | [ ] | [ ] |
| Tambah **3 lamaran** lewat tombol **+**. Toast "Lamaran tersimpan" muncul, dan barisnya ada di sheet Lamaran. | [ ] | [ ] |
| Satu lamaran diisi catatan `=1+1`. Di Sheet, catatan itu tampil sebagai teks `=1+1`, bukan `2`. | [ ] | [ ] |
| Buka satu lamaran → ubah status lewat badge → timeline bertambah "Status diubah ke …", dan sheet Riwayat bertambah 1 baris. | [ ] | [ ] |
| **Tambah catatan** di Detail → muncul di timeline. | [ ] | [ ] |
| **Tambah jadwal** (Interview HR, besok, 10.00) → muncul di Detail, tab **Jadwal** (kelompok yang benar), dan Beranda (**Jadwal terdekat**). | [ ] | [ ] |
| **Tambah ke Google Calendar** membuka Calendar dengan judul, jam, dan lokasi yang benar. | [ ] | [ ] |
| Ubah `tanggal_melamar` satu lamaran Dikirim jadi 3 hari lalu (Edit → Detail tambahan) → muncul di **Perlu di-follow-up**, dan di daftar kartunya ada ikon lonceng. | [ ] | [ ] |
| **Salin pesan follow-up** → tempel di WhatsApp/Notes: nama, posisi, dan tanggal benar. | [ ] | [ ] |
| **Sudah follow-up** → pengingat hilang. | [ ] | [ ] |
| Tab **Statistik** menampilkan "Tambah 7 lamaran lagi untuk melihat statistikmu" (kurang dari 10 lamaran). | [ ] | [ ] |
| Cari, filter status, filter sumber, urutan, dan **Tampilkan yang diarsipkan** di tab Lamaran bekerja. | [ ] | [ ] |
| **Arsipkan** lalu **Hapus** satu lamaran (dengan konfirmasi). Baris di Sheet ikut hilang, termasuk riwayat dan jadwalnya. | [ ] | [ ] |

## 3. Instal dan offline

| | A | i |
| --- | --- | --- |
| **Android**: kartu "Pasang Kelar di HP-mu" muncul di Beranda → **Instal** → ikon Kelar ada di layar utama. | [ ] | – |
| **iPhone**: sheet petunjuk "Pasang Kelar di iPhone" muncul di Beranda → ikuti Share → Add to Home Screen → ikon Kelar ada di layar utama. | – | [ ] |
| Buka dari ikon di layar utama: app terbuka tanpa address bar (standalone). Di iPhone, login sekali lagi. | [ ] | [ ] |
| Ajakan instal **tidak** muncul lagi di app yang sudah terpasang. | [ ] | [ ] |
| Nyalakan **mode pesawat**, tutup app sepenuhnya, lalu buka lagi → app terbuka dengan data terakhir, banner "Kamu sedang offline, data hanya bisa dilihat", dan tombol simpan nonaktif. | [ ] | [ ] |
| Matikan mode pesawat → tap **Ketuk untuk sinkronkan** → tersinkron. | [ ] | [ ] |
| Deploy versi baru (push ke `main`), lalu buka app → toast **Versi baru tersedia** → **Muat ulang**. | [ ] | [ ] |

## 4. Sesi dan akun

| | A | i |
| --- | --- | --- |
| Tutup app lebih dari 1 jam, lalu buka → data tampil langsung dari cache dengan chip **Ketuk untuk sinkronkan**. Ubah status → login muncul (atau langsung jalan), lalu perubahan tersimpan. | [ ] | [ ] |
| Pengaturan: ubah nama panggilan, target mingguan, dan hari follow-up → nilainya berubah di sheet Pengaturan. | [ ] | [ ] |
| **Keluar** (dengan konfirmasi) → kembali ke onboarding. Data di Sheet tetap ada. | [ ] | [ ] |

## 5. Lighthouse (laptop, Chrome)

Buka URL GitHub Pages di jendela **Incognito** → DevTools → **Lighthouse** → Device: **Mobile** → centang Performance, Accessibility, Best Practices → **Analyze page load**.

- [ ] Accessibility ≥ 90
- [ ] Performance ≥ 85
- [ ] Best Practices ≥ 90
- [ ] DevTools → **Application** → **Manifest**: tidak ada error, dan ikon tampil.
- [ ] DevTools → **Application** → **Service workers**: status *activated and is running*.

## 6. Halaman publik

- [ ] `…/tentang.html` dan `…/privasi.html` terbuka, email kontak benar, dan semua link berfungsi.
- [ ] Link "Kebijakan privasi" di layar onboarding dan Pengaturan membuka halaman privasi.

Catat hasil yang gagal (langkah, HP, versi OS, dan screenshot) sebelum memperbaikinya.
