import { describe, expect, it } from 'vitest';
import {
  createLamaran,
  dateValue,
  filterLamaran,
  formatRupiah,
  isTrue,
  parseRupiah,
  parseStatusParam,
  safeHttpUrl,
  sentLabel,
  updateLamaran,
  validateLamaran,
} from '../src/app/lamaran.js';

const NOW = new Date(2026, 10, 13, 10, 0); // 13 Nov 2026, local time

describe('validateLamaran', () => {
  it('requires perusahaan and posisi with friendly messages', () => {
    const { errors } = validateLamaran({ perusahaan: '  ', posisi: '' }, { now: NOW });
    expect(errors.perusahaan).toBe('Nama perusahaan belum diisi');
    expect(errors.posisi).toBe('Posisi belum diisi');
  });

  it('fills defaults and trims', () => {
    const { errors, value } = validateLamaran({ perusahaan: ' PT Maju ', posisi: 'Admin' }, { now: NOW });
    expect(errors).toEqual({});
    expect(value.perusahaan).toBe('PT Maju');
    expect(value.tanggal_melamar).toBe('2026-11-13');
    expect(value.status).toBe('Dikirim');
    expect(value.gaji_diminta).toBe('');
  });

  it('rejects links that are not http(s)', () => {
    for (const link of ['javascript:alert(1)', 'data:text/html,hi', 'www.example.com', 'ftp://x.y']) {
      const { errors } = validateLamaran({ perusahaan: 'A', posisi: 'B', link_lowongan: link });
      expect(errors.link_lowongan).toBe('Link harus diawali http:// atau https://');
    }
    expect(validateLamaran({ perusahaan: 'A', posisi: 'B', link_lowongan: 'https://kerja.id/1' }).errors).toEqual({});
  });

  it('parses salary, rejects text', () => {
    expect(validateLamaran({ perusahaan: 'A', posisi: 'B', gaji_diminta: 'Rp 8.000.000' }).value.gaji_diminta).toBe(8000000);
    expect(validateLamaran({ perusahaan: 'A', posisi: 'B', gaji_diminta: 'delapan juta' }).errors.gaji_diminta).toBeTruthy();
  });

  it('drops unknown enum values and invalid dates', () => {
    const { errors, value } = validateLamaran({
      perusahaan: 'A',
      posisi: 'B',
      sumber: 'Koran',
      tipe_kerja: 'Remote',
      status: 'Hilang',
      tanggal_melamar: '2026-02-31',
    });
    expect(value.sumber).toBe('');
    expect(value.tipe_kerja).toBe('');
    expect(value.status).toBe('Dikirim');
    expect(errors.tanggal_melamar).toBe('Tanggal belum valid');
  });

  it('enforces length limits', () => {
    const { errors } = validateLamaran({ perusahaan: 'x'.repeat(121), posisi: 'B' });
    expect(errors.perusahaan).toMatch(/Maksimal 120/);
  });

  it('keeps formula-looking text as plain text (written RAW later)', () => {
    const { errors, value } = validateLamaran({ perusahaan: '=IMPORTXML("x")', posisi: 'B' });
    expect(errors).toEqual({});
    expect(value.perusahaan).toBe('=IMPORTXML("x")');
  });
});

describe('create / update', () => {
  it('createLamaran fills system fields', () => {
    const row = createLamaran({ perusahaan: 'A', posisi: 'B' }, { now: NOW, id: 'id-1' });
    expect(row).toMatchObject({ id: 'id-1', diarsipkan: false, terakhir_follow_up: '' });
    expect(row.dibuat).toBe(NOW.toISOString());
    expect(row.diperbarui).toBe(row.dibuat);
  });

  it('createLamaran makes unique UUIDs by default', () => {
    const a = createLamaran({}).id;
    const b = createLamaran({}).id;
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });

  it('updateLamaran keeps id, unknown columns and creation time', () => {
    const before = { id: 'x', perusahaan: 'A', kolom_saya: 'tetap', dibuat: 'old', diperbarui: 'old' };
    const after = updateLamaran(before, { perusahaan: 'B', id: 'hack' }, { now: NOW });
    expect(after).toMatchObject({ id: 'x', perusahaan: 'B', kolom_saya: 'tetap', dibuat: 'old' });
    expect(after.diperbarui).toBe(NOW.toISOString());
  });
});

describe('filterLamaran', () => {
  const list = [
    { id: '1', perusahaan: 'Gojek', posisi: 'Backend Engineer', status: 'Interview', sumber: 'LinkedIn', tanggal_melamar: '2026-11-01', diarsipkan: false },
    { id: '2', perusahaan: 'bukalapak', posisi: 'Data Analyst', status: 'Dikirim', sumber: 'Glints', tanggal_melamar: '2026-11-10', diarsipkan: false },
    { id: '3', perusahaan: 'Astra', posisi: 'Admin', status: 'Ditolak', sumber: 'LinkedIn', tanggal_melamar: '2026-10-20', diarsipkan: true },
    { id: '4', perusahaan: 'Tokopedia', posisi: 'Engineer Intern', status: 'Tes', sumber: 'Jobstreet', tanggal_melamar: '2026-11-05', diarsipkan: 'TRUE' },
  ];
  const ids = (r) => r.map((l) => l.id);

  it('hides archived by default, newest first', () => {
    expect(ids(filterLamaran(list))).toEqual(['2', '1']);
  });

  it('shows archived when toggled', () => {
    expect(ids(filterLamaran(list, { showArchived: true }))).toEqual(['2', '4', '1', '3']);
  });

  it('searches company or position, case-insensitive', () => {
    expect(ids(filterLamaran(list, { q: 'ENGINEER', showArchived: true }))).toEqual(['4', '1']);
    expect(ids(filterLamaran(list, { q: 'BUKA' }))).toEqual(['2']);
    expect(ids(filterLamaran(list, { q: '  ' }))).toEqual(['2', '1']);
  });

  it('filters by several statuses and by source', () => {
    expect(ids(filterLamaran(list, { statuses: ['Interview', 'Dikirim'] }))).toEqual(['2', '1']);
    expect(ids(filterLamaran(list, { sumber: 'LinkedIn', showArchived: true }))).toEqual(['1', '3']);
  });

  it('sorts oldest first and by company A–Z', () => {
    expect(ids(filterLamaran(list, { sort: 'terlama', showArchived: true }))).toEqual(['3', '1', '4', '2']);
    expect(ids(filterLamaran(list, { sort: 'perusahaan', showArchived: true }))).toEqual(['3', '2', '1', '4']);
  });

  it('does not mutate the input', () => {
    const copy = JSON.stringify(list);
    filterLamaran(list, { sort: 'perusahaan' });
    expect(JSON.stringify(list)).toBe(copy);
  });
});

describe('labels and parsing', () => {
  it('sentLabel', () => {
    expect(sentLabel('2026-11-13', NOW)).toBe('Dikirim hari ini');
    expect(sentLabel('2026-11-12', NOW)).toBe('Dikirim kemarin');
    expect(sentLabel('2026-11-01', NOW)).toBe('Dikirim 12 hari lalu');
    expect(sentLabel('2026-11-20', NOW)).toBe('Dikirim nanti');
    expect(sentLabel('', NOW)).toBe('');
  });

  it('dateValue accepts strings and Sheets date serials', () => {
    expect(dateValue('2026-11-13')).toBe('2026-11-13');
    expect(dateValue('2026-11-13T08:00:00.000Z')).toBe('2026-11-13');
    expect(dateValue(46339)).toBe('2026-11-13');
    expect(dateValue('13/11/2026')).toBe('');
  });

  it('isTrue', () => {
    expect([true, 'TRUE', 'ya', '1'].every(isTrue)).toBe(true);
    expect([false, 'FALSE', '', null, 0].some(isTrue)).toBe(false);
  });

  it('safeHttpUrl', () => {
    expect(safeHttpUrl('https://a.id/x')).toBe('https://a.id/x');
    expect(safeHttpUrl('  http://a.id ')).toBe('http://a.id/');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHttpUrl('')).toBeNull();
  });

  it('rupiah', () => {
    expect(parseRupiah('')).toBeNull();
    expect(parseRupiah('8.500.000')).toBe(8500000);
    expect(Number.isNaN(parseRupiah('8,5 juta'))).toBe(true);
    expect(formatRupiah(8500000)).toBe('Rp 8.500.000');
    expect(formatRupiah('')).toBe('');
  });

  it('parseStatusParam keeps only known statuses', () => {
    expect(parseStatusParam('Tes,Interview,Hacked')).toEqual(['Tes', 'Interview']);
    expect(parseStatusParam(null)).toEqual([]);
  });
});

describe('review pass', () => {
  it('tanggal melamar cannot be in the future', () => {
    const { errors } = validateLamaran({ perusahaan: 'A', posisi: 'B', tanggal_melamar: '2026-11-14' }, { now: NOW });
    expect(errors.tanggal_melamar).toBe('Tanggal melamar tidak boleh di masa depan');
    expect(validateLamaran({ perusahaan: 'A', posisi: 'B', tanggal_melamar: '2026-11-13' }, { now: NOW }).errors).toEqual({});
  });
});
