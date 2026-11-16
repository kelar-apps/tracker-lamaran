# Server lisensi Kelar (Google Apps Script)

Server kecil ini menjawab satu pertanyaan dari aplikasi: "apakah akun Google ini sudah membeli produk ini?". Datanya diambil dari sheet **Pembeli** milikmu.

Cara kerjanya:

1. Aplikasi mengirim access token Google milik user.
2. Script memeriksa token itu ke Google. Token harus untuk Client ID Kelar, email-nya terverifikasi, dan belum kedaluwarsa.
3. Script mencari email itu di sheet Pembeli.
4. Jawaban disimpan sementara selama 10 menit per email, supaya sheet tidak dibaca terus-menerus.

Token tidak pernah dicatat (di-log).

Kerjakan langkah di bawah dengan akun Google bisnis Kelar (pemilik sheet Pembeli).

## 1. Buat sheet Pembeli

1. Buka https://sheets.new. Beri nama file, misalnya **Kelar — Pembeli**.
2. Ganti nama tab di bawah (Sheet1) menjadi **`Pembeli`** (huruf P besar, persis).
3. Isi baris 1 (header): `email` | `produk` | `tanggal` | `ref_id` | `status`.
4. Salin **ID sheet** dari address bar, yaitu bagian di antara `/d/` dan `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`INI_ID_SHEET`**`/edit`

Contoh isi satu baris pembeli:

| email | produk | tanggal | ref_id | status |
| --- | --- | --- | --- | --- |
| budi@gmail.com | tracker-lamaran | 2026-11-13 | LYNK-123 | aktif |

- `produk`: `tracker-lamaran`, atau `semua` untuk akses ke semua aplikasi Kelar.
- `status`: harus `aktif`. Ganti ke `nonaktif` (atau apa saja selain `aktif`) untuk mencabut akses.
- Huruf besar-kecil dan spasi di email diabaikan.
- Perubahan di sheet butuh **maksimal 10 menit** untuk berlaku (karena cache).

## 2. Buat project Apps Script

1. Di sheet Pembeli tadi: menu **Extensions** → **Apps Script**.
2. Hapus isi `Code.gs` bawaan, lalu tempel seluruh isi file [`Code.gs`](Code.gs) dari folder ini. Klik ikon **Save** (disket).
3. Ganti nama project (kiri atas, "Untitled project") menjadi **Kelar Lisensi**.

## 3. Isi Script Properties

1. Menu kiri → ikon roda gigi **Project Settings**.
2. Gulir ke **Script Properties** → **Add script property**. Tambahkan dua:
   - `CLIENT_ID` = Client ID OAuth Kelar (sama dengan `VITE_GOOGLE_CLIENT_ID` di `.env`, berakhiran `.apps.googleusercontent.com`)
   - `SHEET_ID` = ID sheet dari langkah 1.4
3. **Save script properties**.

## 4. Jalankan `setup` sekali (memberi izin)

1. Kembali ke **Editor** (ikon `< >`).
2. Di dropdown fungsi di atas, pilih **`setup`** → klik **Run**.
3. Muncul **Authorization required** → **Review permissions** → pilih akun bisnis Kelar.
4. Kalau muncul "Google hasn't verified this app": klik **Advanced** → **Go to Kelar Lisensi (unsafe)**. Ini aman: script ini buatanmu sendiri.
5. **Allow**. Script butuh izin membaca sheet dan menghubungi Google (untuk memeriksa token).

## 5. Deploy sebagai Web app

1. Kanan atas: **Deploy** → **New deployment**.
2. Ikon roda gigi di samping "Select type" → **Web app**.
3. Isi:
   - Description: `v1`
   - Execute as: **Me** (email bisnismu)
   - Who has access: **Anyone**
4. **Deploy**. Salin **Web app URL** (berakhiran `/exec`).
5. Cek dengan membuka URL itu di browser. Harus muncul: `Kelar license server is running.`

## 6. Pasang URL di aplikasi

- **Laptop**: di file `.env`, isi `VITE_LICENSE_URL=` dengan URL `/exec` tadi. Lalu hentikan `npm run dev` (Ctrl+C) dan jalankan lagi.
- **GitHub (Fase 8)**: buat repository variable `VITE_LICENSE_URL` dengan nilai yang sama.

Selama `VITE_LICENSE_URL` masih kosong (atau masih contoh `XXXXXXXX`), mode dev (`npm run dev`) melewati cek lisensi supaya app tetap bisa dicoba. Build produksi selalu mewajibkan cek lisensi.

## Mengubah script nanti

Setelah mengedit `Code.gs`: **Deploy** → **Manage deployments** → pilih deployment → ikon pensil → Version: **New version** → **Deploy**. Dengan cara ini URL-nya tetap sama. Jangan pakai "New deployment" lagi, karena akan menghasilkan URL baru.

## Menambah pembeli

Cara termudah: aplikasi **Kelar Admin** (`https://kelar-apps.github.io/admin/`, repo `kelar-apps/admin`). Aktifkan, nonaktifkan, dan aktifkan lagi pembeli dari HP; perubahan langsung berlaku tanpa menunggu cache 10 menit.

Kelar Admin butuh Script Property tambahan:

- `ADMIN_EMAILS` = email Google admin, pisahkan dengan koma kalau lebih dari satu (misalnya `kelarr.appss@gmail.com`). Kosong = semua perintah admin ditolak.
- `PRODUCTS` (opsional) = daftar id produk, default `tracker-lamaran`. Dipakai untuk menghapus cache saat baris `semua` diubah.

Perintah admin (`admin.list`, `admin.upsert`, `admin.setStatus`) memeriksa access token Google yang sama seperti cek lisensi, lalu mencocokkan email-nya dengan `ADMIN_EMAILS`. Pembeli biasa tidak bisa memakainya.

Masih bisa juga menambah baris di sheet secara manual (berlaku maksimal 10 menit), atau memanggil `addBuyer(email, product, refId)` dari editor / webhook nanti. `addBuyer` tidak membuat baris dobel: email + produk yang sama diaktifkan ulang.
