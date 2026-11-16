# Aset Brand Kelar Apps

Tagline: **Urusan harian, kelar.**

## Isi folder

| Folder | Isi | Dipakai untuk |
| --- | --- | --- |
| `profil/` | Foto profil 1080×1080 (gradasi, terang, navy) | Threads, Instagram, Lynk.id |
| `logo/` | Ikon dan logo (SVG + PNG transparan): warna, putih, mono, dengan/tanpa tagline | Landing page, konten, dokumen |
| `app-icons/` | Favicon, apple-touch-icon, ikon PWA 192/512, ikon maskable, `manifest.webmanifest` | Aplikasi PWA |
| `sosial/` | `og-image-1200x630.png` | Pratinjau link saat dibagikan |

Rekomendasi foto profil Threads: `profil/kelar-profil-gradasi-1080.png`.

## Warna

| Nama | Hex |
| --- | --- |
| Biru utama | #3D5BF0 |
| Biru terang (gradasi atas) | #3D86F7 |
| Ungu (gradasi bawah) | #7B4FE0 |
| Kuning centang | #FFBE3B |
| Navy (teks) | #13235B |
| Latar terang | #F8F7FB |

Font logo: **Poppins Bold** (gratis di Google Fonts). Tulisan di file SVG sudah diubah menjadi path, jadi tetap tampil benar walaupun font tidak terpasang.

## Cara pasang di PWA

Salin isi `app-icons/` ke folder `icons/` di proyek aplikasi. Taruh `manifest.webmanifest` di root, lalu tambahkan ini di `<head>`:

```html
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
<link rel="icon" href="icons/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="theme-color" content="#3D5BF0">
<meta property="og:image" content="https://DOMAIN-KAMU/og-image-1200x630.png">
```

Kalau ikon tidak diletakkan di folder `icons/`, sesuaikan path `src` di `manifest.webmanifest`.
