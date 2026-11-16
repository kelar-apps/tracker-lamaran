# Keputusan

Catatan keputusan yang tidak diatur langsung di prompt. Terbaru di bawah.

## Fase 0

1. **Hash routing** (`#/beranda`, `#/lamaran`, ...) lewat `src/core/router.js`. GitHub Pages tidak punya fallback SPA, jadi URL hash paling sederhana dan tidak butuh trik `404.html`. File ini ditaruh di `/core` karena bisa dipakai ulang.
2. **File tambahan di luar struktur prompt**: `src/core/icons.js` (ikon garis SVG), `src/core/router.js`, dan `src/app/layout.js` (shell, navigasi bawah, tombol "+"). Semuanya kecil dan berdiri sendiri.
3. **Gradasi tombol utama dimulai dari biru utama `#3D5BF0`**, bukan `#3D86F7`. Teks putih di atas `#3D86F7` hanya 3,5:1, di bawah syarat 4,5:1. Gradasi brand penuh (`#3D86F7 → #5B5CE8 → #7B4FE0`) tetap dipakai di header Beranda, dengan teks judul besar dan tebal (syarat untuk teks besar 3:1).
4. **Warna badge status** dipilih sendiri dan dicek otomatis di `test/contrast.test.js`. Semua ≥ 4,5:1.
5. **Ikon** digambar sendiri dengan path SVG sederhana. Ikon gerigi diadaptasi dari Feather Icons (lisensi MIT).
6. **`vite-plugin-pwa` sudah dipasang** tapi baru diaktifkan di Fase 7.
7. **Versi aplikasi** diambil dari `version` di `package.json` saat build.
8. **Input memakai font 16px** (bukan 15px) supaya Safari iOS tidak zoom otomatis saat input disentuh.
9. **`VITE_BASE`** ditambahkan ke `.env.example` untuk base path GitHub Pages.
10. **Fase 8 ditambah halaman kebijakan privasi dan halaman beranda publik.** Google mewajibkan keduanya di Branding sebelum app bisa di-publish ke "In production". Sampai saat itu, OAuth tetap di status Testing dengan test users.

## Fase 1

1. **Spreadsheet dibuat lewat Drive API** (`files.create` dengan `appProperties` sekaligus), lalu struktur sheet dibuat oleh `ensureStructure`. Dengan begitu file selalu bisa ditemukan lagi walau setup terputus di tengah. `ensureStructure` dijalankan di setiap login, jadi sheet yang terhapus atau kolom yang hilang otomatis diperbaiki. Kolom yang sudah ada tidak diubah, kolom baru ditambahkan di kanan.
2. **Kolom dibaca berdasarkan nama header**, bukan posisi. User boleh menggeser kolom di Sheet.
3. **Baris tanpa `id`** (misalnya diketik manual oleh user) diabaikan saat dibaca.
4. **Spreadsheet selalu dicari ulang di Drive saat login** (1 request), bukan hanya memakai `spreadsheetId` dari cache. Ini menangani file yang dihapus ke Sampah. `spreadsheetId` tetap disimpan di `localStorage` sesuai prompt.
5. **Ganti akun Google**: kalau email yang login berbeda dari cache, cache lama dihapus dulu supaya data antar-akun tidak tercampur.
6. **Keluar** mencabut (revoke) token dan menghapus cache lokal. Data di Sheet tidak disentuh.
7. **Login dibuka dengan `hint` = email terakhir**, supaya Google langsung memilih akun yang sama.
8. **Konfirmasi "Keluar" sementara memakai `window.confirm`**. Diganti modal buatan sendiri di Fase 2.
9. **Beranda sementara** menampilkan status koneksi dan jumlah data (untuk menguji Fase 1). Dashboard lengkap dibuat di Fase 4.
10. **Manifest minimal** (`public/manifest.webmanifest`) ditambahkan sekarang, supaya Add to Home Screen di iPhone berjalan standalone untuk uji login. Diganti `vite-plugin-pwa` di Fase 7.
11. **Uji di HP memakai ngrok dengan domain statis gratis**, supaya origin OAuth cukup didaftarkan sekali. `vite.config.js` mengizinkan host `*.ngrok-free.app` dan `*.ngrok-free.dev`.
12. **Hasil uji iPhone (13 Nov 2026): login di Safari dan di app Home Screen (standalone) sama-sama berhasil.** App juga terbuka dari cache, lalu tersinkron lewat chip tanpa layar izin ulang. Karena itu, **fallback "login lewat Safari dulu" tidak dibuat**. Pesan bantuan untuk iOS standalone di layar onboarding tetap dipertahankan, untuk jaga-jaga kalau popup gagal.
13. **Catatan ngrok di Windows**: winget memasang ngrok tanpa menambahkannya ke PATH, jadi dijalankan lewat path lengkap (lihat SETUP.md).

## Fase 2

1. **Rute**: `#/lamaran/baru`, `#/lamaran/edit?id=…`, `#/lamaran/detail?id=…`. Daftar bisa dibuka dengan filter status lewat `#/lamaran?status=Tes,Interview` (dipakai kartu status Beranda di Fase 4).
2. **Penulisan diantrekan** (satu per satu). Setiap penulisan membaca ulang baris header dan kolom `id` tepat sebelum menulis. Kalau ada kolom wajib yang hilang, `ensureStructure` dijalankan dulu. Insert juga mengikuti urutan header di Sheet, jadi aman kalau user menggeser kolom.
3. **Update menulis satu baris penuh** dari data lokal (termasuk kolom tambahan buatan user, supaya tidak hilang).
4. **Sinkron latar belakang dijalankan setelah antrean penulisan kosong.** Hasil sinkron yang dimulai sebelum ada perubahan lokal dibuang, supaya perubahan optimistic tidak tertimpa data lama.
5. **Penulisan pertama setelah app dibuka dari cache** mengecek dulu akun (userinfo) dan spreadsheet-nya. Kalau ternyata akun Google lain atau spreadsheet berbeda, perubahan dibatalkan (tidak ditulis) dan data dimuat ulang untuk akun itu.
6. **Baris tidak ditemukan saat update** (dihapus di perangkat lain/manual): perubahan dikembalikan, muncul toast, lalu sinkron ulang. **Saat hapus**, kalau baris sudah tidak ada, dianggap berhasil.
7. **Pesan gagal**: "Gagal menyimpan, coba lagi". Kalau penyebabnya login (popup ditutup, token habis), ditambah "Kamu perlu masuk ke Google untuk menyimpan."
8. **Status hanya diubah dari layar Detail** (bottom sheet), tidak dari form Edit. Form Tambah tetap punya pilihan status awal. Dengan begitu, riwayat status di Fase 3 cukup dicatat dari satu tempat.
9. **Ikon lonceng follow-up di kartu daftar ditambahkan di Fase 4**, bersama aturan follow-up (aturannya butuh data jadwal dari Fase 3).
10. **Gaji** diterima dalam format `8000000`, `8.000.000`, atau `Rp 8.000.000`, lalu disimpan sebagai angka. Panjang teks dibatasi (perusahaan/posisi/lokasi 120, kontak 200, catatan 2000 karakter).
11. **Tanggal dari Sheet** yang berupa angka serial (kalau user mengetik tanggal manual di Sheet) dikonversi ke `YYYY-MM-DD` saat ditampilkan.
12. **Link lowongan yang tidak valid** (bukan http/https) ditampilkan sebagai teks biasa di Detail, tidak bisa diklik.
13. **Dialog** memakai elemen `<dialog>` bawaan browser (fokus terkunci, Esc menutup, fokus kembali ke tombol pembuka). Konfirmasi "Keluar" di Pengaturan sekarang memakai modal ini, menggantikan `window.confirm`.
14. **Banner offline** ("Kamu sedang offline, data hanya bisa dilihat") dan penonaktifan tombol simpan dibuat sekarang, karena Fase 2 sudah punya aksi tulis. Tombol yang menulis ditandai `data-write`.
15. **Layar tidak di-render ulang saat sinkron** kalau sedang mengetik (form dan kolom cari), supaya fokus dan isian tidak hilang.
16. **Header layar**: di HP sempit, chip sinkron pindah ke baris kedua supaya judul tidak tertimpa.
17. **Filter daftar diingat** selama app terbuka (kembali dari Detail, filter tetap sama). Tidak disimpan ke localStorage.

## Fase 3

1. **Status awal saat lamaran dicatat**: kalau statusnya **bukan** Dikirim (misalnya langsung Interview), app menambah satu baris Riwayat `status` dengan catatan "Status awal saat dicatat". Dengan begitu, tahap tertinggi yang pernah dicapai tetap tercatat untuk funnel statistik. Status awal Dikirim **tidak** dicatat, supaya tidak dihitung sebagai "perubahan status pertama" di rata-rata waktu balasan.
2. **Ubah status dan "Sudah follow-up"** menulis baris Lamaran dan baris Riwayat dalam satu penulisan. Kalau gagal, keduanya dikembalikan bersama dan app sinkron ulang dengan Sheet (bisa saja sebagian sudah tertulis).
3. **"Lamaran dikirim"** di paling bawah timeline diambil dari `tanggal_melamar`, bukan baris Riwayat.
4. **Tombol "Sudah follow-up"** hanya tampil untuk status Dikirim, Diproses, Tes, Interview, dan Offering, dan tidak untuk lamaran yang diarsipkan. `terakhir_follow_up` diisi tanggal hari ini.
5. **Catatan di Riwayat tidak bisa diedit atau dihapus dari app** (bisa lewat Sheet). Fiturnya sengaja tidak ditambah di luar prompt.
6. **Jadwal bisa diedit dan dihapus** (menu ⋮ di kartu jadwal). Ini bagian dari fitur "Jadwal interview & tes", karena salah ketik tanggal/jam harus bisa diperbaiki.
7. **Jadwal ditambah dari Detail Lamaran.** Tab Jadwal hanya menampilkan dan menandai selesai; empty state-nya mengarahkan ke daftar lamaran.
8. **Pengelompokan jadwal berdasarkan tanggal**: Hari ini = tanggal hari ini (walau jamnya sudah lewat); Minggu ini = besok sampai Minggu; Nanti = setelah minggu ini; Sudah lewat = sebelum hari ini (urutan terbaru dulu). Jadwal yang sudah selesai tetap di kelompoknya, dengan label "Selesai" dan tampilan lebih datar (bukan transparan, supaya kontras teks tetap ≥ 4,5:1).
9. **Jam boleh kosong.** Tanpa jam mulai, Google Calendar dibuat sebagai acara seharian. Tanpa jam selesai, durasi 1 jam. Jam selesai harus setelah jam mulai.
10. **Link Google Calendar**: waktu lokal tanpa zona waktu (Calendar memakai zona waktu user), semua parameter di-encode dengan `encodeURIComponent`. Jam dari Sheet yang berupa angka pecahan (diketik manual) dikonversi ke `HH:MM`.
11. **Lokasi jadwal** hanya jadi link kalau berupa http/https; selain itu tampil sebagai teks biasa.

## Fase 4

1. **Aturan follow-up disatukan jadi satu "tanggal patokan"**: tanggal paling akhir di antara `tanggal_melamar`, perubahan status terakhir, follow-up terakhir (kolom `terakhir_follow_up` atau baris Riwayat `follow_up`), dan, khusus Tes/Interview, jadwal terakhir. Pengingat muncul kalau sudah ≥ `hari_follow_up` hari sejak patokan itu. Untuk Tes/Interview, hasilnya sama dengan aturan di prompt (jadwal terakhir sudah lewat, status belum berubah, dan belum follow-up sejak jadwal itu). Bedanya hanya satu: setelah user follow-up, pengingat **muncul lagi** setelah `hari_follow_up` hari berikutnya kalau tetap belum ada kabar, sama seperti Dikirim/Diproses. Menurut prompt secara harfiah, pengingat akan hilang selamanya.
2. **Jadwal terakhir yang masih di masa depan** = belum perlu follow-up (masih menunggu tes/interview). Jadwal yang ditandai selesai tetap dihitung sebagai jadwal.
3. **Perbandingan hari memakai tanggal kalender lokal** (bukan jam). Riwayat yang disimpan ISO dikonversi ke tanggal lokal perangkat.
4. **Nama sapaan di pesan follow-up** diambil dari `kontak_hr`: bagian pertama sebelum tanda pemisah (—, -, koma, garis miring, kurung), lalu sapaan seperti "Bu"/"Pak" dibuang karena template sudah memakai "Bapak/Ibu". Kalau isinya email, nomor, atau kosong: "Tim Rekrutmen".
5. **Nama pengirim** di pesan = nama lengkap akun Google, lalu nama panggilan, lalu nama depan. Tanggal ditulis lengkap ("6 November 2026") karena pesannya formal.
6. **Template "setelah tes/interview"** dipakai kalau statusnya Tes/Interview dan punya jadwal yang sudah lewat. Selain itu template "setelah melamar".
7. **Salin pesan**: memakai Clipboard API. Kalau browser menolak, pesan ditampilkan di bottom sheet (teks sudah terpilih) supaya bisa disalin manual.
8. **"Lihat semua"** follow-up membuka layar baru `#/follow-up` (daftar lengkap, paling lama menunggu di atas). Link ini hanya muncul kalau ada lebih dari 3 pengingat.
9. **Kartu "Waktunya follow-up" di Detail** menampilkan alasan dan tombol Salin pesan kalau lamaran itu sedang perlu di-follow-up.
10. **Ringkasan status di Beranda** menghitung lamaran yang tidak diarsipkan, untuk Dikirim, Diproses, Tes, Interview, dan Offering (sesuai prompt). Tap kartu membuka daftar dengan filter status itu.
11. **Target minggu ini** dihitung dari `tanggal_melamar` dalam minggu Senin–Minggu (yang diarsipkan ikut dihitung). Fungsi ini dibuat sekarang di `target.js`; streak dan layar Target di Fase 5. Teks penyemangat: 0 = "Yuk mulai…", < 50% = "Awal yang bagus…", < 100% = "Sedikit lagi, tinggal N lamaran!", tercapai = "Target minggu ini tercapai. Keren!".
12. **Jadwal terdekat**: jadwal yang belum selesai dari hari ini sampai 7 hari ke depan, maksimal 2.
13. **Pengaturan nama panggilan, target mingguan, dan hari follow-up belum bisa diubah dari app**; dibuat di Fase 5 bersama stepper target. Sampai saat itu, nilainya bisa diubah langsung di sheet `Pengaturan`.
14. **Kartu "Spreadsheet-mu siap" sementara di Beranda dihapus.** Link "Buka Google Sheet saya" tetap ada di Pengaturan.

## Fase 5

1. **Batas 10 lamaran** untuk menampilkan statistik memakai **semua** lamaran (termasuk yang diarsipkan). Bagian Target tetap tampil walau statistik belum muncul.
2. **Rata-rata waktu balasan dan funnel** hanya memakai lamaran yang **tidak diarsipkan** (sama seperti tingkat respons). Waktu balasan yang negatif (tanggal riwayat lebih awal dari tanggal melamar) dianggap 0 hari. Baris "Status awal saat dicatat" (Fase 3) ikut dihitung sebagai perubahan status pertama, karena lamaran itu memang sudah direspons saat dicatat.
3. **Sumber terbaik**: lamaran tanpa sumber tidak masuk tabel. Kalau tingkat respons sama, sumber dengan lamaran lebih banyak di atas.
4. **Grafik lamaran per minggu** dibuat dengan SVG: 8 minggu terakhir (minggu berjalan paling kanan, label "Ini"), satu warna (biru utama), garis target putus-putus. Angka hanya ditulis di batang minggu ini; minggu lain lewat tooltip saat disentuh/hover. Pembaca layar mendapat tabel tersembunyi berisi semua angka.
5. **Funnel** ditampilkan sebagai batang horizontal biasa (HTML), panjangnya relatif terhadap jumlah tahap Dikirim.
6. **Streak**: dihitung mundur dari minggu lalu. Minggu berjalan menambah 1 kalau target sudah tercapai, dan tidak memutus streak kalau belum. Target yang dipakai untuk semua minggu adalah target saat ini (sesuai prompt).
7. **Pengaturan sekarang bisa diubah dari app**: nama panggilan (maks. 40 karakter, tombol Simpan), target mingguan (stepper 1–50), dan hari follow-up (stepper 3–30). Stepper target juga ada di layar Statistik.
8. **Ketukan cepat pada stepper digabung jadi satu penulisan** per kunci (nilai terakhir yang ditulis), supaya tidak boros kuota API Google. Kalau baris kuncinya hilang dari sheet `Pengaturan`, baris baru ditambahkan.
9. **Fokus keyboard dipertahankan** setelah layar di-render ulang (misalnya setelah menekan + di stepper), dengan mencocokkan id atau `aria-label` elemen yang sedang fokus.

## Fase 6

1. **Cek lisensi dijalankan sebelum spreadsheet dicari/dibuat.** Akun yang belum membeli tidak membuat file apa pun di Drive-nya.
2. **Status terkunci** (`phase: 'locked'`) punya tiga jenis:
   - **denied**: server menjawab `allowed: false`. Muncul layar "Akses belum aktif".
   - **recheck**: data ada di cache, tapi cache lisensi sudah lebih dari 7 hari (atau milik email lain). Muncul layar "Masuk lagi, yuk".
   - **error**: server lisensi tidak bisa dihubungi atau jawabannya tidak valid. Muncul layar "Akses belum bisa dicek" dengan tombol Coba lagi.

   Data di cache tidak dihapus saat terkunci, supaya langsung kembali setelah akses aktif.
3. **Jawaban error dari Apps Script tidak berisi `allowed`** (misalnya token tidak valid atau Script Property belum diisi), sehingga app menampilkan "belum bisa dicek", bukan "belum membeli". Hanya `allowed: false` yang berarti belum membeli.
4. **Tombol tambahan "Sudah bayar? Cek lagi"** di layar "Akses belum aktif". Tanpa tombol ini, pembeli baru harus keluar lalu masuk lagi setelah bayar.
5. **"Ganti akun Google"**: menghapus data lokal akun ini (token dicabut, cache dan cache lisensi dihapus), lalu membuka pemilih akun Google (`prompt: 'select_account'`).
6. **Cache lisensi** disimpan per produk (`kelar.license.tracker-lamaran`) berisi email dan waktu cek. Cache berusia 1–7 hari dipakai, lalu dicek ulang di latar belakang. Kalau pengecekan latar belakang itu gagal karena jaringan, app tetap jalan. Kalau jawabannya `false`, app langsung terkunci. Waktu cek yang lebih dari 5 menit di masa depan (jam perangkat diubah mundur) tidak dipercaya.
7. **Keluar juga menghapus cache lisensi.**
8. **Mode dev tanpa server lisensi**: kalau `VITE_LICENSE_URL` kosong atau masih nilai contoh (`XXXXXXXX`), `npm run dev` melewati cek lisensi. Build produksi tanpa URL selalu terkunci dengan pesan "belum selesai disiapkan".
9. **Apps Script**:
   - Scope dianggap memuat email kalau berisi `email` atau `https://www.googleapis.com/auth/userinfo.email`. Tokeninfo bisa menampilkan salah satunya.
   - Kolom sheet Pembeli dicari berdasarkan nama header.
   - Cache 10 menit per email + produk.
   - `addBuyer` memakai `LockService` dan menyimpan teks dengan awalan `'` supaya tidak dibaca sebagai formula.
   - Ada `doGet` sederhana untuk mengecek URL deployment di browser, dan fungsi `setup` untuk membuat header serta memberi izin.

## Fase 7

1. **Font Poppins di-bundle lokal** (`@fontsource/poppins`, subset latin, 400/500/600/700) menggantikan Google Fonts. Alasannya: aturan service worker melarang cache apa pun dari `googleapis.com` (termasuk `fonts.googleapis.com`), sedangkan font harus tetap tampil saat offline. Bonus: tidak ada request ke Google saat app dibuka.
2. **Ikon sementara** dibuat dari `public/icons/source.svg` dengan `@vite-pwa/assets-generator` (`npx pwa-assets-generator`). Bentuknya centang kuning di atas gradasi brand, dengan logo di zona aman tengah sehingga cocok juga untuk maskable. Cara mengganti dengan ikon resmi ada di SETUP.md.
3. **Service worker hanya untuk app shell**: precache file build sendiri, tanpa `runtimeCaching`. Request ke `googleapis.com`, `accounts.google.com`, dan `script.google.com` tidak pernah di-cache (dicek otomatis di `test/pwa.test.js` terhadap `dist/sw.js`). Data tetap dari cache `localStorage` seperti sebelumnya.
4. **Update app memakai mode `prompt`**: saat ada versi baru, muncul toast "Versi baru tersedia" dengan tombol "Muat ulang". App tidak memuat ulang sendiri, supaya isian form tidak hilang.
5. **`npm run preview` memakai port 5173** (sama dengan dev), supaya origin OAuth yang sudah terdaftar dan ngrok tetap jalan saat menguji build produksi.
6. **Ajakan instal Android** tampil sebagai kartu di Beranda (hanya kalau Chrome mengirim `beforeinstallprompt`). Tombolnya "Instal" dan "Nanti". "Nanti" menyembunyikan kartu selama 7 hari.
7. **Ajakan instal iOS** berupa bottom sheet bergambar (ikon Share → Add to Home Screen + 3 langkah). Muncul 1,5 detik setelah Beranda terbuka, maksimal sekali per 3 hari, dan tidak pernah di atas dialog lain. Ada catatan bahwa app di Home Screen perlu login sekali lagi, karena iOS memisahkan penyimpanannya.
8. **Pengaturan → "Instal aplikasi"**: memakai dialog instal Chrome kalau tersedia. Kalau tidak, menampilkan petunjuk (iOS atau Chrome/laptop). Disembunyikan kalau app sudah berjalan sebagai standalone.
9. **Skeleton loading** tampil saat setup pertama (setelah login, sambil spreadsheet dicari/dibuat dan data dimuat), dengan teks "Menyiapkan spreadsheet-mu…". Animasinya mati kalau user memilih kurangi gerakan (`prefers-reduced-motion`).
10. **Navigasi**:
    - Layar baru mulai dari atas. Tombol kembali mengembalikan posisi scroll sebelumnya (disimpan di `history.state`).
    - Fokus dipindah ke kontainer layar supaya pembaca layar mulai dari layar baru.
    - Judul tab mengikuti judul layar ("Lamaran — Kelar").
11. **Cek aksesibilitas** memakai axe-core (WCAG 2.1 AA + best practice) di semua layar, bottom sheet, modal konfirmasi, banner offline, dan onboarding. Satu temuan diperbaiki: onboarding belum punya `h1` (logo "Kelar" sekarang `h1`). Satu-satunya sisa temuan adalah catatan "Mode dev" yang hanya muncul di `npm run dev`.
12. **Banner offline dan empty state** sudah dibuat di Fase 2–4. Di fase ini banner offline hanya disembunyikan di layar onboarding dan layar lisensi, karena kedua layar itu punya pesan offline sendiri.

## Fase 8

1. **Ikon dan logo resmi** dari `kelar-assets/` sekarang dipakai: ikon "K" + centang di `public/icons/` (nama file asli) dan logo putih di layar onboarding. Ikon sementara Fase 7 dan generator-nya dihapus. Gambar `og-image` dipasang, tapi `og:image` belum diisi karena butuh URL absolut. Bisa ditambahkan setelah domain final diketahui.
2. **Halaman publik `tentang.html` (homepage) dan `privasi.html` (kebijakan privasi)** di-build oleh Vite sebagai halaman terpisah. Keduanya dibutuhkan di Google Auth Platform → Branding sebelum app bisa di-publish. Kebijakan privasi berbahasa Indonesia, dengan ringkasan bahasa Inggris dan pernyataan kepatuhan *Google API Services User Data Policy (Limited Use)* untuk peninjau Google. Kedua halaman di-link dari onboarding dan Pengaturan.
3. **Variabel baru `VITE_CONTACT_EMAIL`** untuk email kontak di halaman publik. Diisi lewat placeholder `{{CONTACT_EMAIL}}` dan `{{BUY_URL}}` oleh plugin kecil di `vite.config.js` (nilainya di-escape). Link beli hanya dipakai kalau berawalan http/https.
4. **Workflow** `.github/workflows/deploy.yml`:
   - Push ke `main` (atau dijalankan manual) memicu `npm ci` → build → test → deploy ke Pages.
   - Test dijalankan **setelah** build supaya pengecekan `dist/` (manifest, service worker tanpa cache Google) ikut jalan.
   - Workflow gagal dengan pesan jelas kalau ada Repository Variable yang kosong.
   - `VITE_BASE` otomatis `/<nama-repo>/` kalau variabelnya tidak diisi.
   - Memakai Node 22.
5. **Konfigurasi hanya dari Repository Variables** (`vars.*`), bukan Secrets, karena semua nilainya memang terlihat di bundle publik. `.env` tetap di `.gitignore`.
6. **`TESTING.md`** berisi checklist per bagian (lisensi, alur utama, instal/offline, sesi, Lighthouse, halaman publik), dengan kolom Android dan iPhone, sesuai "Definisi selesai" di prompt.
7. **Tidak ada commit atau push yang dilakukan oleh Claude.** Langkah git ada di SETUP.md bagian 9a untuk dijalankan sendiri.

## Review UI/UX (16 Nov 2026)

Pemeriksaan ulang semua layar di HP 360–390 px dengan data realistis, plus pemeriksaan alur di kode.

**Alur**
1. **Token kedaluwarsa** (sekitar 1 jam) sekarang terdeteksi: chip "Ketuk untuk sinkronkan" muncul lagi, alih-alih app terlihat tersambung padahal tidak.
2. **Sinkron otomatis saat app dibuka lagi** (kembali dari latar belakang), kalau token masih berlaku dan sinkron terakhir sudah lebih dari 2 menit. Tidak pernah membuka popup.
3. **Toast sukses mengikuti hasil.** Kalau penulisan bisa langsung jalan, toast tampil seketika (optimistic). Kalau perlu login Google dulu, toast menunggu hasilnya, supaya tidak muncul "tersimpan" lalu "gagal".
4. **Cegah simpan ganda**: tap kedua pada Simpan (form lamaran, form jadwal) tidak membuat data dobel.
5. **"Buang perubahan?"** saat menekan Kembali atau Batal di form yang sudah diisi.
6. **Hapus lamaran** tidak lagi berkedip menampilkan "Lamaran tidak ditemukan" sebelum kembali ke daftar.
7. **Tanggal melamar tidak boleh di masa depan** (statistik dan target mingguan memakai tanggal ini).
8. **Tombol "+" nonaktif saat offline**, karena tidak ada yang bisa disimpan.
9. Tombol login di onboarding menampilkan "Menunggu login Google…" selama popup terbuka.

**Tampilan**
1. **Header baru**: satu baris berisi tombol kembali, judul (dipotong rapi kalau panjang), dan ikon aksi. Chip sinkron pindah ke baris di bawah judul, dan hanya tampil kalau ada yang perlu diketahui. Beranda menampilkan tanggal hari ini di bawah sapaan.
2. **Daftar Lamaran**: sumber, urutan, dan arsip pindah ke sheet **Filter & urutan**. Tombolnya menampilkan jumlah filter aktif. Sekarang hasil sudah terlihat di layar pertama. Ada ringkasan "N lamaran · urutan" dan tombol "Hapus semua filter". Kartu menampilkan sumber, dan posisi yang panjang dipotong 2 baris.
3. **Beranda**:
   - Petak keenam **Semua aktif** melengkapi grid status 3×2.
   - Tombol di kartu pengingat dibuat berdampingan ("Salin pesan" / "Sudah follow-up"). Di HP ≤ 380 px ikonnya disembunyikan supaya tetap satu baris.
   - Jadwal terdekat memakai label "Hari ini" / "Besok".
4. **Kartu Jadwal**:
   - Tombol centang bulat untuk menandai selesai (judulnya dicoret kalau selesai).
   - Label hari relatif dan tag mode.
   - "Buka link meeting" untuk link online, dan "Buka di Maps" untuk alamat offline.
   - Tombol Google Calendar hanya untuk jadwal yang belum lewat dan belum selesai.
5. **Detail**:
   - Status tampil sebagai kontrol yang jelas ("Interview · Ubah").
   - Info lowongan dalam dua kolom dengan judul.
   - Email dan nomor di Kontak HR bisa langsung diketuk (mailto/tel).
   - Jadwal yang akan datang tampil lebih dulu.
   - Riwayat status memakai badge berwarna.
6. **Form**:
   - Tombol Batal/Simpan menempel di bawah layar.
   - Field wajib diberi tanda "(wajib)".
   - Petunjuk lokasi di form jadwal mengikuti mode (link meeting / alamat).
7. **Pengaturan**: info "Terakhir disinkronkan …" dan tombol **Sinkronkan sekarang**.
8. **Gerak dan sentuhan**:
   - Sheet dan modal muncul dengan animasi singkat.
   - Tombol dan kartu memberi umpan balik saat ditekan.
   - Toast muncul halus.
   - Semua animasi dimatikan untuk pengguna yang memilih kurangi gerakan.
9. Ruang bawah ditambah di layar yang punya tombol "+", supaya kartu terakhir tidak tertutup. Di layar tanpa navigasi, toast diposisikan lebih rendah.

Diverifikasi: tidak ada elemen yang meluber di 360 px, semua tombol muat satu baris, dan axe (WCAG 2.1 AA + best practice) bersih di semua layar dan sheet baru.
