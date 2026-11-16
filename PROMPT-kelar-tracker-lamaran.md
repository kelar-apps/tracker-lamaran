# Prompt Claude Code: Kelar Apps — Tracker Lamaran Kerja (PWA)

> Cara pakai: buat folder proyek kosong, simpan file ini di dalamnya, buka Claude Code di folder itu, lalu ketik:
> **"Baca PROMPT-kelar-tracker-lamaran.md dan kerjakan Fase 0. Berhenti setelah tiap fase dan tunggu konfirmasi saya."**

---

## 1. Peranmu dan cara kerja

Kamu adalah senior front-end engineer yang membangun aplikasi PWA produksi untuk produk digital berbayar bernama **Kelar Apps**. Aplikasi pertama adalah **Tracker Lamaran Kerja**.

Aturan kerja:
- Kerjakan **per fase** (bagian 10). Setelah tiap fase: jalankan test dan build, ringkas apa yang dibuat, beri tahu cara saya mencobanya, lalu **berhenti dan tunggu konfirmasi**.
- Kalau ada keputusan yang tidak tercakup di dokumen ini, pilih opsi paling sederhana, lalu catat di `DECISIONS.md`.
- Semua teks yang dilihat user memakai **Bahasa Indonesia**, gaya santai dan hangat (sapaan "kamu").
- Kode, nama variabel, dan komentar memakai bahasa Inggris.
- Jangan menambah fitur di luar daftar di bagian 4.

## 2. Ringkasan produk

- Aplikasi web yang **bisa diinstal di HP** (PWA), dibeli **sekali bayar**.
- **Data user disimpan di Google Sheet milik user sendiri** (di Google Drive mereka), bukan di server kita.
- Hanya pembeli yang bisa memakai aplikasi. Akses dicek dari daftar email pembeli.
- Target user: pencari kerja dan fresh graduate di Indonesia, 21–30 tahun, sebagian besar memakai HP Android dan sebagian iPhone.
- Tagline brand: **"Urusan harian, kelar."**

## 3. Arsitektur (wajib diikuti)

```
[PWA statis di GitHub Pages]
   │  Login Google (Google Identity Services, 1 token client)
   │
   ├──► Google Sheets API + Drive API (langsung dari browser,
   │     pakai access token user, scope drive.file)
   │     → membuat & membaca/menulis 1 spreadsheet di Drive user
   │
   └──► Apps Script Web App "Lisensi" (milik penjual)
         → verifikasi access token Google (tokeninfo)
         → cek email ada di Sheet "Pembeli"
```

Alasan desain ini (jangan diubah tanpa bertanya):
- Apps Script yang dijalankan sebagai "user yang mengakses" **tidak bisa dipanggil dengan andal dari domain lain**, karena cookie lintas situs diblokir. Jadi **data user diakses langsung lewat Google Sheets API dari browser**.
- Scope **`drive.file`** termasuk kategori non-sensitif. Aplikasi hanya bisa melihat file yang dibuatnya sendiri, sehingga layar izin lebih ramah dan tidak perlu verifikasi aplikasi yang rumit dari Google.
- Apps Script hanya dipakai untuk **cek lisensi** (dijalankan sebagai pemilik, akses "Anyone").
- Login memakai **satu token client** saja (bukan tombol Sign-In + token client terpisah), supaya user hanya melihat satu popup izin. Identitas user dan lisensi diverifikasi dari access token yang sama.

### Stack
- **Vite + JavaScript (ES modules), tanpa framework UI.** Komponen sederhana dibuat dengan fungsi yang mengembalikan elemen DOM.
- `vite-plugin-pwa` untuk manifest dan service worker.
- `vitest` untuk unit test logika (statistik, follow-up, target, tanggal).
- Grafik digambar dengan SVG buatan sendiri (tanpa library chart).
- Deploy ke **GitHub Pages** lewat GitHub Actions.

### Struktur folder
Pisahkan kode yang bisa dipakai ulang untuk aplikasi Kelar berikutnya:

```
/src
  /core            ← dipakai ulang di semua aplikasi Kelar
    auth.js        (Google Identity Services: token client, access token di memori)
    sheets.js      (wrapper Sheets API & Drive API: cari/buat spreadsheet, CRUD baris)
    license.js     (panggil Apps Script, cache hasil)
    pwa.js         (tombol instal, panduan iOS, deteksi standalone)
    ui.js          (helper DOM, toast, modal, bottom sheet)
    theme.css      (warna, font, komponen dasar)
    dates.js       (helper tanggal, zona waktu lokal perangkat; parse `YYYY-MM-DD`
                    secara manual, jangan pakai `new Date('YYYY-MM-DD')` karena
                    dibaca sebagai UTC dan bisa bergeser sehari)
  /app             ← khusus Tracker Lamaran
    schema.js      (definisi sheet & kolom)
    store.js       (state, cache lokal, sinkronisasi)
    followup.js    (logika pengingat)
    stats.js       (logika statistik)
    target.js      (logika target mingguan)
    /screens       (satu file per layar)
  main.js
/apps-script
  Code.gs          (web app lisensi)
  README.md        (cara deploy)
/public/icons      (ikon dari paket aset brand)
config.js          (CLIENT_ID, LICENSE_URL, PRODUCT_ID, BUY_URL — dibaca dari env Vite)
```

## 4. Fitur versi pertama (hanya ini)

1. **Dashboard ringkas**
2. **Pengingat follow-up** + template pesan yang bisa disalin
3. **Jadwal interview & tes** + tombol "Tambah ke Google Calendar"
4. **Riwayat per lamaran** (timeline)
5. **Cari & filter** lamaran
6. **Statistik**
7. **Target mingguan**

Ditambah fondasinya: login Google, pembuatan spreadsheet otomatis, cek lisensi, instal PWA, dan pengaturan.

**Di luar cakupan** (jangan dibuat): upload file atau screenshot, daftar dokumen CV, ekspor PDF, notifikasi push, fitur AI, mode multi-user.

## 5. Struktur data di Google Sheet user

Saat login pertama, aplikasi mencari spreadsheet buatannya di Drive user (Drive API `files.list` dengan `appProperties has { key='kelarApp' and value='tracker-lamaran' }`). Kalau tidak ada, buat spreadsheet baru bernama **"Kelar — Tracker Lamaran"**, beri `appProperties` tersebut, lalu buat 4 sheet dengan baris header berikut. Simpan `spreadsheetId` di `localStorage`.

**Sheet `Lamaran`**

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | string | UUID |
| perusahaan | string | wajib |
| posisi | string | wajib |
| sumber | enum | LinkedIn, Jobstreet, Glints, Kalibrr, Indeed, Website perusahaan, Referensi teman, Instagram/Threads, Lainnya |
| link_lowongan | string | hanya `http://` atau `https://` |
| lokasi | string | |
| tipe_kerja | enum | WFO, WFH, Hybrid |
| gaji_diminta | number | rupiah, boleh kosong |
| tanggal_melamar | date | `YYYY-MM-DD`, default hari ini |
| status | enum | lihat di bawah |
| kontak_hr | string | nama / email / nomor |
| catatan | string | |
| terakhir_follow_up | date | boleh kosong |
| diarsipkan | boolean | |
| dibuat | datetime ISO | |
| diperbarui | datetime ISO | |

Status (urutan alur): **Dikirim → Diproses → Tes → Interview → Offering → Diterima**, ditambah status akhir **Ditolak** dan **Mundur**.

**Sheet `Riwayat`**: id, lamaran_id, tanggal (datetime ISO), jenis (`status` | `catatan` | `follow_up`), status_baru, catatan.
Setiap kali status berubah, tambahkan baris riwayat secara otomatis.

**Sheet `Jadwal`**: id, lamaran_id, jenis (Interview HR, Interview User, Psikotes, Tes Teknis, Lainnya), tanggal, jam_mulai, jam_selesai, mode (Online, Offline), lokasi_atau_link, catatan, selesai (boolean).

**Sheet `Pengaturan`** (key, value): `target_mingguan` (default 10), `hari_follow_up` (default 7), `nama_panggilan`.

Aturan teknis Sheets:
- **Semua penulisan memakai `valueInputOption=RAW`**, jangan `USER_ENTERED`. Ini mencegah input user seperti `=IMPORTXML(...)` dijalankan sebagai formula. Untuk `values.append` pakai juga `insertDataOption=INSERT_ROWS`.
- Saat membaca, pakai `valueRenderOption=UNFORMATTED_VALUE` dan simpan tanggal sebagai string `YYYY-MM-DD` / ISO apa adanya.
- Insert memakai `values.append`. Untuk update/hapus: **baca ulang kolom `id` dari Sheet tepat sebelum menulis** untuk menemukan nomor baris yang benar, jangan memakai nomor baris dari cache (bisa bergeser kalau user membuka app di 2 perangkat atau mengedit Sheet manual). Kalau `id` tidak ditemukan, batalkan dan sinkron ulang. Lalu `values.update` atau `batchUpdate` `deleteDimension`.
- Hapus lamaran juga menghapus baris Riwayat dan Jadwal yang `lamaran_id`-nya sama (hapus dari baris paling bawah ke atas supaya indeks tidak bergeser).
- Baris yang `id`-nya kosong atau tidak valid (misalnya ditambah manual oleh user) diabaikan saat dibaca, tidak membuat app error.
- Muat semua data sekali saat aplikasi dibuka (`values.batchGet`), simpan salinan di `localStorage` untuk tampilan instan dan untuk dibaca saat offline. Sinkronkan ulang di latar belakang.
- Penulisan bersifat optimistic: UI langsung berubah. Kalau gagal, kembalikan perubahan dan tampilkan toast "Gagal menyimpan, coba lagi".
- Saat offline: tampilkan banner "Kamu sedang offline, data hanya bisa dilihat" dan nonaktifkan tombol simpan. Aplikasi harus tetap bisa **dibuka dan dibaca saat offline** dari cache, meskipun skrip GIS (`accounts.google.com`) gagal dimuat.

## 6. Login dan lisensi

### Login
- Pakai **Google Identity Services**, hanya **token client** (`google.accounts.oauth2.initTokenClient`) dengan scope:
  `openid email profile https://www.googleapis.com/auth/drive.file`.
- Nama dan email diambil dari `https://www.googleapis.com/oauth2/v3/userinfo` memakai access token. Simpan nama dan email (bukan token) di `localStorage` untuk tampilan.
- Jangan simpan access token di `localStorage` atau `sessionStorage`. Simpan di memori saja.
- **Popup hanya boleh dibuka dari gesture user** (tap tombol). `requestAccessToken` yang dipanggil otomatis saat app dibuka akan diblokir browser, termasuk dengan `prompt: ''`.

### Alur saat aplikasi dibuka (penting untuk UX)
1. Kalau ada cache data + cache lisensi yang masih berlaku: **langsung tampilkan app dari cache** (mode baca), tanpa memuat atau memanggil GIS dulu.
2. Muat skrip GIS di latar belakang. Tampilkan chip kecil di header "Ketuk untuk sinkronkan" selama belum ada access token.
3. Access token diminta saat user **pertama kali** melakukan aksi tulis (simpan, ubah status, dll.) atau mengetuk chip sinkron. Setelah token didapat, jalankan aksi yang tertunda, lalu sinkron ulang di latar belakang.
4. Access token berlaku sekitar 1 jam. Kalau kedaluwarsa, minta ulang dengan `prompt: ''` **di dalam gesture user berikutnya**. Kalau gagal, tampilkan tombol "Masuk lagi".
5. Kalau tidak ada cache sama sekali (user baru atau sudah keluar): tampilkan layar Onboarding.

### Risiko iOS (uji sejak Fase 1)
- Popup OAuth di PWA iOS yang berjalan **standalone** (sudah di-Add to Home Screen) sering gagal mengembalikan hasil ke aplikasi.
- Di Fase 1, sediakan cara menguji login di iPhone dalam mode standalone. Kalau gagal, buat fallback: deteksi iOS standalone, lalu tampilkan pesan "Login pertama kali lewat Safari dulu ya" dengan tombol yang membuka app di Safari. Catat hasil uji dan keputusan di `DECISIONS.md`.

### Cek lisensi
- Setelah login, kirim `POST` ke `LICENSE_URL` dengan `Content-Type: text/plain` (supaya tidak memicu CORS preflight). Body berupa JSON string: `{ "action": "verify", "accessToken": "...", "product": "tracker-lamaran" }`.
- `fetch` harus mengikuti redirect (perilaku default). Apps Script mengembalikan 302 ke googleusercontent.
- Respons: `{ "allowed": true|false, "email": "..." }`.
- Cache hasil `allowed: true` di `localStorage` selama **7 hari** beserta email, supaya aplikasi tetap bisa dibuka saat sinyal jelek. Cek ulang lisensi di latar belakang setiap kali access token baru didapat dan cache sudah lebih dari 1 hari.
- Kalau `allowed: false`, tampilkan layar **"Akses belum aktif"** berisi email yang dipakai login, tombol **"Beli sekarang"** (ke `BUY_URL`), tombol **"Ganti akun Google"**, dan teks kecil: "Sudah bayar tapi masih terkunci? Pastikan kamu login dengan email yang sama saat checkout."

### `apps-script/Code.gs`
- `doPost(e)`: parse JSON dari `e.postData.contents`.
- Verifikasi access token lewat `UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token), { muteHttpExceptions: true })`. Tolak kalau HTTP bukan 200. Cek `aud === CLIENT_ID` (dari Script Properties), `email_verified === 'true'`, `exp` belum lewat, dan `scope` memuat `email`.
- Jangan pernah mencatat (log) token.
- Cari email (huruf kecil, tanpa spasi) di sheet **`Pembeli`** milik penjual dengan kolom: email, produk, tanggal, ref_id, status. Lolos kalau `produk` sama atau berisi `semua`, dan `status` = `aktif`.
- Balas dengan `ContentService.createTextOutput(JSON.stringify(...)).setMimeType(ContentService.MimeType.JSON)`.
- Gunakan `CacheService` 10 menit per email untuk mengurangi pembacaan sheet.
- Tulis `apps-script/README.md` berisi langkah: buat Sheet Pembeli, isi Script Properties (`CLIENT_ID`, `SHEET_ID`), Deploy → Web app → Execute as: Me → Who has access: Anyone, lalu salin URL ke `.env`.
- **Webhook Lynk.id tidak dibuat di fase ini.** Untuk sementara, penjual menambahkan email pembeli ke sheet secara manual. Siapkan fungsi `addBuyer(email, product, refId)` yang nanti dipanggil webhook.

Catatan keamanan: pengecekan lisensi melindungi akses ke UI. Data tetap milik user di Drive mereka. Itu sudah cukup untuk produk ini, jadi jangan menambah sistem DRM yang rumit.

## 7. Layar dan alur

Desain **mobile-first** (lebar 360–430 px), tetap rapi di desktop dengan kolom tengah maksimal 480 px. Navigasi bawah berisi 4 tab: **Beranda**, **Lamaran**, **Jadwal**, **Statistik**. Tombol bulat **"+"** mengambang di tab Beranda dan Lamaran.

### 7.0 Onboarding (belum login)
- Logo, tagline "Urusan harian, kelar.", dan 3 poin manfaat singkat.
- Tombol "Masuk dengan Google".
- Teks kecil: "Datamu disimpan di Google Drive milikmu sendiri."

### 7.1 Beranda (Dashboard)
- Sapaan: "Halo, {nama_panggilan}!"
- Kartu **Target minggu ini**: "6 dari 10 lamaran", progress bar, dan teks penyemangat sesuai progres.
- Kartu ringkas per status (jumlah Dikirim, Diproses, Tes, Interview, Offering). Tap kartu membuka daftar lamaran yang sudah terfilter.
- Bagian **Perlu di-follow-up** (maksimal 3 item, lalu link "Lihat semua").
- Bagian **Jadwal terdekat** (2 item dalam 7 hari ke depan).
- Empty state untuk user baru: ilustrasi sederhana + "Belum ada lamaran. Yuk catat lamaran pertamamu!" + tombol.

### 7.2 Daftar Lamaran
- Kolom cari (perusahaan atau posisi, tanpa membedakan huruf besar-kecil).
- Chip filter status (bisa pilih lebih dari satu), filter sumber, dan urutan (terbaru, terlama, perusahaan A–Z).
- Toggle "Tampilkan yang diarsipkan".
- Kartu lamaran: perusahaan, posisi, badge status berwarna, "Dikirim 12 hari lalu", dan ikon lonceng kalau perlu follow-up.

### 7.3 Tambah/Edit Lamaran
- Form satu kolom. Field wajib (perusahaan, posisi) ada di atas. Field opsional ada di bagian "Detail tambahan" yang bisa dibuka-tutup.
- Validasi ramah, contoh: "Nama perusahaan belum diisi".
- Simpan, lalu kembali ke layar sebelumnya dengan toast "Lamaran tersimpan".

### 7.4 Detail Lamaran
- Header: perusahaan, posisi, status (bisa diganti lewat bottom sheet), link lowongan (buka di tab baru).
- **Timeline riwayat** (terbaru di atas) + tombol "Tambah catatan".
- **Jadwal** milik lamaran ini + tombol "Tambah jadwal".
- Tombol **"Sudah follow-up"**: mengisi `terakhir_follow_up` dan menambah riwayat.
- Menu: Edit, Arsipkan, Hapus (dengan konfirmasi).

### 7.5 Jadwal
- Daftar jadwal yang dikelompokkan: Hari ini, Minggu ini, Nanti, Sudah lewat.
- Setiap item punya tombol **"Tambah ke Google Calendar"** yang membuka:
  `https://calendar.google.com/calendar/render?action=TEMPLATE&text={jenis} – {perusahaan}&dates={mulai}/{selesai}&details={posisi + catatan}&location={lokasi_atau_link}`
  (format waktu lokal `YYYYMMDDTHHMMSS`, di-encode dengan benar, durasi default 1 jam).
- Tandai jadwal sebagai selesai.

### 7.6 Statistik & Target
- Kalau total lamaran < 10: tampilkan "Tambah {10 - n} lamaran lagi untuk melihat statistikmu" + progress, tanpa grafik kosong.
- Kalau ≥ 10:
  - **Tingkat respons** = lamaran yang **direspons** ÷ lamaran yang **dihitung**.
    - Direspons = pernah punya status selain Dikirim dan Mundur (Ditolak **dihitung** sebagai respons).
    - Dihitung = semua lamaran yang tidak diarsipkan, **kecuali** yang Mundur tanpa pernah direspons.
  - **Rata-rata waktu balasan** = rata-rata hari dari `tanggal_melamar` ke perubahan status pertama **yang bukan ke Mundur** di Riwayat. Lamaran tanpa perubahan seperti itu tidak ikut dihitung. Tampilkan juga jumlah lamaran yang menjadi dasar perhitungan.
  - **Funnel status** (kumulatif): jumlah yang mencapai Dikirim, Diproses, Tes, Interview, Offering, dan Diterima. Mencapai suatu tahap berarti dianggap sudah melewati semua tahap sebelumnya (lamaran yang dibuat langsung berstatus Interview ikut dihitung di Dikirim, Diproses, Tes). Untuk lamaran Ditolak/Mundur, pakai tahap tertinggi yang pernah dicapai menurut Riwayat.
  - **Sumber terbaik**: tabel per sumber berisi jumlah lamaran dan tingkat respons, diurutkan dari tingkat respons tertinggi (minimal 3 lamaran per sumber).
  - **Lamaran per minggu**: grafik batang 8 minggu terakhir, dengan garis target.
- Bagian **Target**: atur target mingguan (stepper 1–50) dan tampilkan **streak** (jumlah minggu berturut-turut target tercapai).
  - Lamaran dihitung ke minggu berdasarkan **`tanggal_melamar`** (bukan `dibuat`). Lamaran yang diarsipkan tetap dihitung.
  - Streak dihitung mundur dari minggu lalu. Minggu berjalan **menambah** streak kalau targetnya sudah tercapai, dan **tidak memutus** streak kalau belum tercapai.
  - Target yang dipakai untuk minggu-minggu lalu adalah nilai `target_mingguan` saat ini (tidak perlu menyimpan riwayat target).

### 7.7 Pengaturan (ikon gerigi di header Beranda)
- Nama panggilan, target mingguan, hari follow-up (3–30).
- "Buka Google Sheet saya" (link ke spreadsheet).
- "Instal aplikasi" (lihat bagian 8).
- Email yang sedang login + tombol Keluar.
- Versi aplikasi.

## 8. PWA dan instal

- Manifest: `name` "Kelar — Tracker Lamaran", `short_name` "Kelar Lamaran", `display: standalone`, `theme_color` #3D5BF0, `background_color` #F8F7FB, ikon dari `/public/icons` (192, 512, maskable 192/512), `start_url` dan `scope` sesuai base path GitHub Pages.
- Service worker: cache app shell (precache). Request ke `googleapis.com`, `accounts.google.com`, dan `script.google.com` **tidak boleh di-cache**.
- **Android/Chrome**: tangkap `beforeinstallprompt`, lalu tampilkan banner "Pasang Kelar di HP-mu" dengan tombol Instal.
- **iOS Safari**: deteksi iOS yang tidak standalone, lalu tampilkan bottom sheet bergambar sederhana: "Tap ikon Share → Add to Home Screen". Tampilkan maksimal sekali per 3 hari.
- Sembunyikan semua ajakan instal kalau aplikasi sudah berjalan sebagai standalone.
- Saat ada versi baru, tampilkan toast "Versi baru tersedia" + tombol "Muat ulang".

## 9. Desain visual

- Warna:
  - Biru utama `#3D5BF0`
  - Gradasi brand `#3D86F7 → #5B5CE8 → #7B4FE0` (hanya untuk header Beranda dan tombol utama)
  - Kuning aksen `#FFBE3B` (centang, highlight, progress target)
  - Navy teks `#13235B`
  - Latar `#F8F7FB`, kartu putih
- Warna badge status (latar muda + teks gelap yang kontrasnya ≥ 4.5:1): Dikirim abu-abu, Diproses biru, Tes ungu, Interview oranye, Offering kuning, Diterima hijau, Ditolak merah, Mundur abu-abu tua.
- Font **Poppins** (Google Fonts): 600/700 untuk judul, 400/500 untuk isi. Ukuran isi minimal 15 px.
- Sudut membulat 16 px untuk kartu dan 12 px untuk input. Bayangan sangat halus.
- Area sentuh minimal 44 px. Ikon garis (stroke), bukan emoji.
- Aksesibilitas: elemen asli `<button>`, `<label>` untuk setiap input, `aria-label` untuk tombol ikon, dan fokus keyboard yang terlihat.
- Keamanan render: semua input user ditampilkan lewat `textContent`, **jangan pernah** lewat `innerHTML`. Link lowongan hanya dibuka kalau skemanya `http` atau `https`, dengan `rel="noopener noreferrer"`.

## 10. Fase pengerjaan

**Fase 0 — Fondasi**
Scaffold Vite, struktur folder, `config.js` + `.env.example`, `theme.css`, layout dengan navigasi bawah (layar masih kosong), dan vitest siap. Tulis `SETUP.md` berisi langkah yang harus saya lakukan di Google Cloud (lihat bagian 11).

**Fase 1 — Login & spreadsheet**
`core/auth.js` dan `core/sheets.js`. Login, cari atau buat spreadsheet beserta 4 sheet-nya, baca Pengaturan, dan simpan cache lokal. Layar onboarding. Alur buka-dari-cache (bagian 6). Beri tahu saya cara menguji login di iPhone dalam mode standalone (lewat URL tunnel HTTPS atau deploy preview) dan **berhenti sampai saya melaporkan hasilnya**.

**Fase 2 — Lamaran (CRUD) + cari & filter**
Layar Daftar, Tambah/Edit, dan Detail (tanpa timeline dan jadwal dulu). Arsip, hapus, dan update optimistic.

**Fase 3 — Riwayat & jadwal**
Riwayat otomatis saat status berubah, tambah catatan, tombol "Sudah follow-up", tab Jadwal, dan tombol Google Calendar.

**Fase 4 — Dashboard & follow-up**
`followup.js` + test. Aturan pengingat:
- Status **Dikirim** atau **Diproses**, dan sudah ≥ `hari_follow_up` hari sejak tanggal paling akhir di antara: `tanggal_melamar`, perubahan status terakhir di Riwayat, dan `terakhir_follow_up`.
- Status **Tes/Interview**, jadwal terakhirnya sudah lewat ≥ `hari_follow_up` hari, status belum berubah sejak itu, dan belum di-follow-up sejak jadwal itu. Kalau tidak punya jadwal, pakai aturan seperti Dikirim/Diproses.
- Tidak berlaku untuk status Offering, Diterima, Ditolak, Mundur, atau lamaran yang diarsipkan.

Setiap pengingat punya tombol **"Salin pesan follow-up"** dengan template sesuai situasi:
- Setelah melamar: "Selamat siang Bapak/Ibu {kontak_hr atau 'Tim Rekrutmen'}, saya {nama}, pelamar posisi {posisi} yang mengirim lamaran pada {tanggal}. Saya ingin menanyakan perkembangan proses seleksinya. Terima kasih atas waktunya."
- Setelah tes/interview: "Selamat siang Bapak/Ibu {...}, saya {nama}, kandidat posisi {posisi} yang mengikuti {jenis jadwal} pada {tanggal}. Saya ingin menanyakan perkembangan proses seleksi selanjutnya. Terima kasih."

Lalu buat layar Beranda lengkap.

**Fase 5 — Statistik & target**
`stats.js` dan `target.js` + test (minggu dihitung Senin–Minggu waktu lokal perangkat). Layar Statistik & Target dengan grafik SVG.

**Fase 6 — Lisensi**
`core/license.js`, layar "Akses belum aktif", `apps-script/Code.gs`, dan README deploy-nya.

**Fase 7 — PWA & poles**
Manifest, service worker, ajakan instal Android/iOS, toast versi baru, banner offline, empty state, loading skeleton, dan pengecekan aksesibilitas.

**Fase 8 — Deploy**
GitHub Actions ke GitHub Pages, base path yang benar, dan checklist uji coba di HP Android & iPhone di `TESTING.md`. Nilai `VITE_*` dibaca dari **GitHub repository Variables** (`vars.*`) di workflow, bukan dari file `.env` yang di-commit. Pastikan `.env` ada di `.gitignore`.

## 11. Yang harus saya siapkan sendiri (tuliskan di `SETUP.md` dengan langkah klik-per-klik)

1. Project di Google Cloud Console. Aktifkan **Google Sheets API** dan **Google Drive API**.
2. OAuth consent screen (Google Auth Platform → Branding/Audience/Data Access): External, nama aplikasi "Kelar Apps", scope `openid`, `email`, `profile`, `drive.file`. Ubah status publikasi ke **In production**. Kalau masih Testing, hanya test user yang terdaftar (maks. 100) yang bisa login. Jelaskan juga bahwa kalau logo diunggah, Google bisa meminta **verifikasi brand** (perlu domain terverifikasi, halaman privacy policy, dan homepage) sebelum logo tampil.
3. OAuth Client ID tipe **Web application**. Authorized JavaScript origins: `http://localhost:5173`, domain GitHub Pages (tanpa path, contoh `https://username.github.io`), dan origin tunnel HTTPS untuk uji di HP kalau dipakai.
4. Apps Script lisensi + Sheet "Pembeli" (lihat `apps-script/README.md`).
5. File `.env` (lokal) dan GitHub repository Variables (untuk deploy): `VITE_GOOGLE_CLIENT_ID`, `VITE_LICENSE_URL`, `VITE_PRODUCT_ID=tracker-lamaran`, `VITE_BUY_URL`.
6. Salin ikon dari paket aset brand (`kelar-assets/app-icons/`) ke `public/icons/`.

## 12. Definisi selesai (seluruh proyek)

- `npm run test` dan `npm run build` lolos tanpa error.
- Lighthouse (mobile): Accessibility ≥ 90, Performance ≥ 85, Best Practices ≥ 90. (Kategori PWA sudah dihapus dari Lighthouse.)
- Installable: Chrome DevTools → Application → Manifest tidak menampilkan error, dan Chrome Android menampilkan opsi instal.
- Aplikasi bisa dibuka dan dibaca dalam mode pesawat setelah pernah dibuka sekali.
- Alur lengkap bisa dijalankan di HP: login → spreadsheet terbuat → tambah 3 lamaran → ubah status → tambah jadwal → pengingat follow-up muncul → statistik menampilkan pesan "kurang dari 10" → instal ke home screen.
- Email yang tidak ada di Sheet Pembeli melihat layar "Akses belum aktif".
- Tidak ada `innerHTML` untuk data user, dan tidak ada token yang disimpan di `localStorage`/`sessionStorage`.
- Semua penulisan ke Sheets memakai `valueInputOption=RAW` (uji: catatan berisi `=1+1` tersimpan sebagai teks).
