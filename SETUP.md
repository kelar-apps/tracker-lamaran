# Setup — yang perlu kamu siapkan sendiri

Langkah ini dikerjakan sekali. Kamu butuh akun Google (sebaiknya akun khusus bisnis Kelar) dan akun GitHub.

Nama menu di Google Cloud Console kadang berubah sedikit. Kalau ada yang beda, cari menu dengan nama yang mirip.

---

## 1. Buat project Google Cloud dan aktifkan API

1. Buka https://console.cloud.google.com dan login.
2. Klik **pemilih project** di bagian atas (di sebelah logo Google Cloud) → **New Project**.
3. Project name: `kelar-apps` → **Create**. Tunggu sampai selesai, lalu pastikan project `kelar-apps` terpilih di bagian atas.
4. Menu kiri (☰) → **APIs & Services** → **Library**.
5. Cari **Google Sheets API** → klik → **Enable**.
6. Kembali ke **Library**, cari **Google Drive API** → klik → **Enable**.

## 2. Atur layar izin (OAuth consent screen)

1. Menu kiri → **APIs & Services** → **OAuth consent screen** (akan membuka **Google Auth Platform**). Klik **Get started** kalau muncul.
2. **App Information**: App name `Kelar Apps`, User support email = email kamu → **Next**.
3. **Audience**: pilih **External** → **Next**.
4. **Contact Information**: email kamu → **Next**.
5. Centang persetujuan kebijakan → **Continue** → **Create**.
6. Menu kiri Google Auth Platform → **Data Access** → **Add or remove scopes**. Centang:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `.../auth/drive.file` (kalau tidak ada di daftar, tempel `https://www.googleapis.com/auth/drive.file` di kotak **Manually add scopes** → **Add to table**)

   Klik **Update** → **Save**. Keempat scope ini termasuk **non-sensitive**, jadi tidak perlu verifikasi keamanan dari Google.
7. **Selama development, biarkan status di Testing.** Menu kiri → **Audience** → gulir ke bawah ke **Test users** → **+ Add users** → isi email Google yang akan kamu pakai untuk mencoba app → **Save**. Hanya email di daftar ini (maks. 100) yang bisa login.
   - Tombol **Publish app** baru aktif setelah halaman **Branding** lengkap: **Application home page**, **Application privacy policy link**, dan **Authorized domains**. Halaman beranda (`tentang.html`) dan kebijakan privasi (`privasi.html`) ikut di-deploy ke GitHub Pages. Setelah deploy, ikuti bagian **9f** untuk mengisi Branding lalu **Publish app**.
8. Menu **Branding** (opsional): kalau kamu **mengunggah logo**, Google bisa meminta **verifikasi brand** sebelum logo tampil. Verifikasi ini butuh domain milikmu sendiri yang terverifikasi, plus halaman homepage dan privacy policy di domain itu. Domain `github.io` tidak bisa kamu verifikasi. Saran: **jangan unggah logo dulu** sampai punya domain sendiri. Tanpa logo, layar izin tetap jalan dengan nama "Kelar Apps".

## 3. Buat OAuth Client ID

1. Menu kiri Google Auth Platform → **Clients** → **Create client**.
2. Application type: **Web application**. Name: `Kelar Web`.
3. **Authorized JavaScript origins** → **Add URI**, isi satu per satu (tanpa garis miring di akhir, tanpa path):
   - `http://localhost:5173`
   - `https://USERNAME.github.io` (ganti `USERNAME` dengan username GitHub kamu)
   - Nanti, untuk uji di HP sebelum deploy: origin tunnel HTTPS yang kamu pakai (dijelaskan di Fase 1).
4. **Authorized redirect URIs**: kosongkan (tidak dipakai).
5. **Create**. Salin **Client ID** (bentuknya `xxxx.apps.googleusercontent.com`). Client secret **tidak** dipakai.

Perubahan origin bisa butuh 5 menit sampai beberapa jam untuk aktif.

## 4. Apps Script lisensi + Sheet "Pembeli"

Ikuti langkah klik-per-klik di [`apps-script/README.md`](apps-script/README.md). Ringkasnya:

1. Buat Google Sheet dengan tab **Pembeli** (kolom `email`, `produk`, `tanggal`, `ref_id`, `status`).
2. Extensions → Apps Script. Tempel `apps-script/Code.gs`.
3. Isi Script Properties `CLIENT_ID` dan `SHEET_ID`. Jalankan `setup` sekali untuk memberi izin.
4. Deploy → Web app → Execute as: **Me** → Who has access: **Anyone**. Salin URL `/exec` ke `VITE_LICENSE_URL` di `.env`.
5. Tambahkan email-mu sendiri sebagai pembeli (`produk` = `tracker-lamaran`, `status` = `aktif`) supaya kamu bisa menguji.

Selama `VITE_LICENSE_URL` masih kosong atau masih contoh, `npm run dev` melewati cek lisensi.

## 5. File `.env` dan GitHub Variables

**Lokal (laptop):**

1. Salin `.env.example` menjadi `.env` di folder proyek.
2. Isi:
   - `VITE_GOOGLE_CLIENT_ID` = Client ID dari langkah 3
   - `VITE_LICENSE_URL` = URL web app dari langkah 4 (berakhiran `/exec`), boleh dikosongkan dulu sampai Fase 6
   - `VITE_PRODUCT_ID=tracker-lamaran`
   - `VITE_BUY_URL` = link checkout produkmu (misalnya halaman Lynk.id)
   - `VITE_CONTACT_EMAIL` = email kontak yang tampil di halaman Tentang dan Kebijakan Privasi
   - `VITE_BASE=/`
3. `.env` sudah ada di `.gitignore`, jadi tidak ikut ter-commit.

**Deploy (GitHub):** lihat bagian 9.

## 6. Ikon aplikasi

Ikon resmi dari `kelar-assets/app-icons/` sudah dipasang di `public/icons/` dengan nama file aslinya. Logo putih dan logo berwarna dari `kelar-assets/logo/` ada di `public/brand/`.

Kalau ikon brand diperbarui: salin ulang file dari `app-icons/` ke `public/icons/` dengan nama yang sama, lalu deploy ulang. Di HP yang sudah memasang app, ikon baru bisa butuh waktu muncul, atau app perlu dipasang ulang.

## 7. Uji login di HP (Fase 1)

Login Google hanya jalan di `localhost` atau di alamat **HTTPS** yang terdaftar di Client ID. HP tidak bisa membuka `localhost` laptop, jadi butuh alamat HTTPS yang **tetap** (supaya cukup didaftarkan sekali). Caranya pakai **ngrok** dengan domain gratisnya:

1. Daftar di https://ngrok.com (gratis), lalu login ke dashboard.
2. Menu **Domains**: kamu dapat 1 domain statis gratis, misalnya `nama-acak.ngrok-free.app` atau `nama-acak.ngrok-free.dev`. Salin domainnya.
3. Pasang ngrok di PowerShell: `winget install ngrok.ngrok`. Winget tidak menambahkan ngrok ke PATH, jadi simpan path lengkapnya ke variabel (jalankan ulang setiap kali membuka PowerShell baru):

   ```bash
   $ngrok = "C:\Users\MODERN 14\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
   ```

   Lalu `& $ngrok update` (versi dari winget sudah lama), dan `& $ngrok config add-authtoken TOKEN` (authtoken dari dashboard ngrok, menu **Your Authtoken**; rahasia, jangan dibagikan). Di langkah 5, ganti `ngrok` dengan `& $ngrok`.
4. Google Cloud Console → Google Auth Platform → **Clients** → `Kelar Web` → **Authorized JavaScript origins** → **Add URI** → `https://nama-acak.ngrok-free.app` → **Save**. Tunggu sekitar 5–10 menit.
5. Jalankan app di laptop (`npm run dev`), lalu di terminal lain:

   ```bash
   ngrok http --url=nama-acak.ngrok-free.app 5173
   ```

6. Di HP, buka `https://nama-acak.ngrok-free.app`. Kalau muncul halaman peringatan ngrok, tap **Visit Site**.

**Checklist uji di iPhone (laporkan hasilnya ke Claude):**

- [ ] **A. Safari biasa:** tap "Masuk dengan Google" → pilih akun → izinkan → Beranda tampil "Spreadsheet-mu siap".
- [ ] **B. Pasang ke Home Screen:** di Safari tap ikon Share → **Add to Home Screen** → **Add**.
- [ ] **C. Buka dari ikon Home Screen** (mode standalone, tanpa address bar). Data dari langkah A **tidak** ikut, karena iOS memisahkan penyimpanan app Home Screen dari Safari. Jadi akan muncul layar onboarding lagi.
- [ ] **D.** Tap "Masuk dengan Google" di app Home Screen. Catat yang terjadi:
  - berhasil sampai Beranda, **atau**
  - jendela login terbuka tapi setelah memilih akun tidak kembali ke app / layar putih / tertutup sendiri, **atau**
  - muncul pesan error (tulis isi pesannya).
- [ ] **E.** Kalau D berhasil: tutup app sepenuhnya (geser ke atas dari app switcher), buka lagi. Beranda harus langsung tampil dari cache dengan chip **"Ketuk untuk sinkronkan"**. Tap chip itu, harus tersinkron tanpa layar izin lagi (paling-paling memilih akun).

Uji yang sama di Android (Chrome → menu ⋮ → **Add to Home screen** / **Install app**) juga berguna.

## 8. Menjalankan di laptop

```bash
npm install
```

```bash
npm run dev
```

Buka http://localhost:5173. Perintah lain: `npm run test` (unit test) dan `npm run build` (build produksi ke folder `dist/`).

**Mencoba versi PWA (service worker, instal, offline).** Service worker hanya aktif di build produksi, bukan di `npm run dev`:

1. Hentikan `npm run dev` (Ctrl+C).
2. Jalankan `npm run build`, lalu `npm run preview`. Preview memakai port **5173** yang sama, jadi login Google dan ngrok tetap jalan.
3. Buka http://localhost:5173 (atau alamat ngrok di HP).

Catatan: build produksi **selalu** mewajibkan cek lisensi. Isi dulu `VITE_LICENSE_URL` (Fase 6) sebelum mencoba versi ini.

Kalau setelah ini kembali ke `npm run dev` dan tampilan terasa "lama", service worker dari preview masih aktif. Di Chrome: DevTools → Application → Service workers → **Unregister**, lalu muat ulang.

## 9. Deploy ke GitHub Pages

Cukup sekali. Setelah itu, setiap `git push` ke branch `main` otomatis menjalankan build, test, dan deploy.

### 9a. Buat repository dan push kode

1. Buka https://github.com/new. Repository name: misalnya `kelar-lamaran`. Pilih **Public** (GitHub Pages gratis untuk repo publik). **Jangan** centang "Add a README". Klik **Create repository**.
2. Kalau belum pernah memakai git di laptop ini, isi identitasmu sekali (ganti nama dan email):

   ```bash
   git config --global user.name "Nama Kamu"
   ```

   ```bash
   git config --global user.email "email@kamu.com"
   ```

3. Di PowerShell, di folder proyek, jalankan satu per satu:

   ```bash
   git init -b main
   ```

   ```bash
   git add .
   ```

   ```bash
   git status
   ```

   Pastikan **`.env` tidak ada** di daftar file (file ini sudah ada di `.gitignore`). Lalu:

   ```bash
   git commit -m "Kelar Tracker Lamaran v0.1.0"
   ```

   ```bash
   git remote add origin https://github.com/USERNAME/kelar-lamaran.git
   ```

   ```bash
   git push -u origin main
   ```

   Kalau `git remote add` menjawab "remote origin already exists", pakai `git remote set-url origin https://github.com/USERNAME/kelar-lamaran.git`.

### 9b. Aktifkan GitHub Pages

Repo GitHub → **Settings** → **Pages** (menu kiri) → **Build and deployment** → Source: **GitHub Actions**.

### 9c. Isi Repository Variables

Repo → **Settings** → **Secrets and variables** → **Actions** → tab **Variables** → **New repository variable**. Buat satu per satu:

| Name | Value |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Client ID dari langkah 3 |
| `VITE_LICENSE_URL` | URL Apps Script (`…/exec`) |
| `VITE_PRODUCT_ID` | `tracker-lamaran` |
| `VITE_BUY_URL` | Link checkout (misalnya Lynk.id) |
| `VITE_CONTACT_EMAIL` | Email kontak untuk halaman publik |
| `VITE_BASE` | `/kelar-lamaran/` (nama repo diapit garis miring). Boleh dilewati: kalau kosong, otomatis memakai nama repo. |

Nilai-nilai ini bukan rahasia (semuanya ikut terlihat di aplikasi), jadi cukup disimpan di **Variables**, bukan Secrets.

### 9d. Jalankan deploy

1. Tab **Actions** → **Deploy ke GitHub Pages** → **Run workflow**, atau push commit baru.
2. Tunggu sampai hijau (sekitar 1–2 menit). Kalau merah di langkah "Cek repository Variables", berarti ada variable yang belum diisi.
3. App bisa dibuka di `https://USERNAME.github.io/kelar-lamaran/`.

### 9e. Daftarkan domain di Google Cloud

Google Auth Platform → **Clients** → `Kelar Web` → **Authorized JavaScript origins**: pastikan ada `https://USERNAME.github.io` (tanpa nama repo, tanpa garis miring di akhir) → **Save**.

### 9f. Publikasikan OAuth supaya semua orang bisa login

1. Google Auth Platform → **Branding**:
   - Application home page: `https://USERNAME.github.io/kelar-lamaran/tentang.html`
   - Application privacy policy link: `https://USERNAME.github.io/kelar-lamaran/privasi.html`
   - Authorized domains → **Add domain** → `USERNAME.github.io`
   - **Save**. Jangan unggah logo dulu (lihat bagian 2 poin 8).
2. **Audience** → **Publish app** → **Confirm**. Status berubah menjadi **In production**.
3. Semua scope termasuk non-sensitif dan tidak ada logo, jadi app langsung bisa dipakai siapa saja tanpa verifikasi Google. Daftar test users tidak dipakai lagi.

### 9g. Uji coba

Ikuti checklist di [`TESTING.md`](TESTING.md) di HP Android dan iPhone.
