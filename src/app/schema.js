// Spreadsheet structure for Tracker Lamaran. Header names are the source of truth
// for the Google Sheet created in the user's Drive.

export const SPREADSHEET_TITLE = 'Kelar — Tracker Lamaran';
export const APP_PROPERTY = { key: 'kelarApp', value: 'tracker-lamaran' };

export const SHEETS = {
  Lamaran: [
    'id',
    'perusahaan',
    'posisi',
    'sumber',
    'link_lowongan',
    'lokasi',
    'tipe_kerja',
    'gaji_diminta',
    'tanggal_melamar',
    'status',
    'kontak_hr',
    'catatan',
    'terakhir_follow_up',
    'diarsipkan',
    'dibuat',
    'diperbarui',
  ],
  Riwayat: ['id', 'lamaran_id', 'tanggal', 'jenis', 'status_baru', 'catatan'],
  Jadwal: [
    'id',
    'lamaran_id',
    'jenis',
    'tanggal',
    'jam_mulai',
    'jam_selesai',
    'mode',
    'lokasi_atau_link',
    'catatan',
    'selesai',
  ],
  Pengaturan: ['key', 'value'],
};

/** Pipeline statuses in flow order. */
export const STATUS_FLOW = ['Dikirim', 'Diproses', 'Tes', 'Interview', 'Offering', 'Diterima'];
/** Terminal statuses outside the flow. */
export const STATUS_FINAL = ['Ditolak', 'Mundur'];
export const STATUSES = [...STATUS_FLOW, ...STATUS_FINAL];

export const SOURCES = [
  'LinkedIn',
  'Jobstreet',
  'Glints',
  'Kalibrr',
  'Indeed',
  'Website perusahaan',
  'Referensi teman',
  'Instagram/Threads',
  'Lainnya',
];

export const WORK_TYPES = ['WFO', 'WFH', 'Hybrid'];
export const HISTORY_TYPES = ['status', 'catatan', 'follow_up'];
export const SCHEDULE_TYPES = ['Interview HR', 'Interview User', 'Psikotes', 'Tes Teknis', 'Lainnya'];
export const SCHEDULE_MODES = ['Online', 'Offline'];

export const DEFAULT_SETTINGS = {
  target_mingguan: 10,
  hari_follow_up: 7,
  nama_panggilan: '',
};

/** CSS modifier for a status badge, e.g. "Interview" -> "badge--interview". */
export function statusBadgeClass(status) {
  return STATUSES.includes(status) ? `badge--${status.toLowerCase()}` : 'badge--dikirim';
}
