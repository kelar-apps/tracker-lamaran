# Kelar — Tracker Lamaran Kerja

PWA untuk mencatat lamaran kerja: pengingat follow-up, jadwal interview dan tes (dengan tombol Google Calendar), riwayat per lamaran, statistik, dan target mingguan. Data user disimpan di spreadsheet di **Google Drive milik user sendiri**. Tidak ada server database.

- Vite + JavaScript (ES modules), tanpa framework UI
- Login: Google Identity Services (token client, scope `drive.file`)
- Data: Google Sheets API + Drive API, langsung dari browser
- Lisensi: Google Apps Script (`apps-script/`)
- Deploy: GitHub Pages lewat GitHub Actions

## Mulai

```bash
npm install
```

```bash
npm run dev
```

Perintah lain: `npm test`, `npm run build`, `npm run preview`.

## Dokumen

- [SETUP.md](SETUP.md): langkah yang perlu disiapkan di Google Cloud, Apps Script, dan GitHub
- [TESTING.md](TESTING.md): checklist uji coba di Android dan iPhone
- [DECISIONS.md](DECISIONS.md): keputusan teknis per fase
- [apps-script/README.md](apps-script/README.md): deploy server lisensi
