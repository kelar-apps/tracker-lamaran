import { describe, expect, it } from 'vitest';
import {
  calendarUrl,
  createJadwal,
  groupJadwal,
  groupKey,
  jadwalFor,
  timeRangeLabel,
  timeValue,
  validateJadwal,
} from '../src/app/jadwal.js';

// Friday 13 Nov 2026, 10:00 local. Week = Mon 9 Nov – Sun 15 Nov.
const NOW = new Date(2026, 10, 13, 10, 0);

describe('timeValue', () => {
  it('normalises strings and Sheets time fractions', () => {
    expect(timeValue('9:00')).toBe('09:00');
    expect(timeValue('09.30')).toBe('09:30');
    expect(timeValue(0.375)).toBe('09:00');
    expect(timeValue(0.5625)).toBe('13:30');
    expect(timeValue('25:00')).toBe('');
    expect(timeValue('jam 9')).toBe('');
    expect(timeValue('')).toBe('');
  });

  it('timeRangeLabel', () => {
    expect(timeRangeLabel({ jam_mulai: '09:00', jam_selesai: '10:30' })).toBe('09.00–10.30');
    expect(timeRangeLabel({ jam_mulai: '09:00' })).toBe('09.00');
    expect(timeRangeLabel({})).toBe('');
  });
});

describe('validateJadwal', () => {
  const base = { jenis: 'Interview HR', tanggal: '2026-11-20', mode: 'Online' };

  it('accepts a minimal schedule', () => {
    const { errors, value } = validateJadwal(base);
    expect(errors).toEqual({});
    expect(value).toMatchObject({ jenis: 'Interview HR', tanggal: '2026-11-20', jam_mulai: '', mode: 'Online' });
  });

  it('requires type and a valid date', () => {
    expect(validateJadwal({ ...base, jenis: 'Ngopi' }).errors.jenis).toBe('Pilih jenis jadwal');
    expect(validateJadwal({ ...base, tanggal: '' }).errors.tanggal).toBe('Tanggal belum diisi');
    expect(validateJadwal({ ...base, tanggal: '2026-02-30' }).errors.tanggal).toBe('Tanggal belum valid');
  });

  it('checks the end time', () => {
    expect(validateJadwal({ ...base, jam_selesai: '10:00' }).errors.jam_selesai).toBe('Isi jam mulai dulu');
    expect(validateJadwal({ ...base, jam_mulai: '10:00', jam_selesai: '09:00' }).errors.jam_selesai).toMatch(/setelah jam mulai/);
    expect(validateJadwal({ ...base, jam_mulai: '9:00', jam_selesai: '10:00' }).value.jam_mulai).toBe('09:00');
  });

  it('createJadwal starts as not done', () => {
    expect(createJadwal('L1', validateJadwal(base).value, { id: 'J1' })).toMatchObject({ id: 'J1', lamaran_id: 'L1', selesai: false });
  });
});

describe('grouping', () => {
  const j = (id, tanggal, jam = '') => ({ id, tanggal, jam_mulai: jam });

  it('groupKey by calendar date, weeks Monday–Sunday', () => {
    expect(groupKey(j('a', '2026-11-12'), NOW)).toBe('past');
    expect(groupKey(j('a', '2026-11-13'), NOW)).toBe('today');
    expect(groupKey(j('a', '2026-11-15'), NOW)).toBe('week');
    expect(groupKey(j('a', '2026-11-16'), NOW)).toBe('later');
    expect(groupKey(j('a', ''), NOW)).toBe('past');
    // A Sheets date serial typed by hand still lands in the right group.
    expect(groupKey(j('a', 46339), NOW)).toBe('today');
  });

  it('on Sunday "Minggu ini" ends today', () => {
    const sunday = new Date(2026, 10, 15, 9);
    expect(groupKey(j('a', '2026-11-16'), sunday)).toBe('later');
  });

  it('orders groups and items', () => {
    const groups = groupJadwal(
      [
        j('p1', '2026-11-01'),
        j('t2', '2026-11-13', '14:00'),
        j('l1', '2026-12-01'),
        j('t1', '2026-11-13', '09:00'),
        j('p2', '2026-11-10'),
        j('w1', '2026-11-14'),
      ],
      NOW,
    );
    expect(groups.map((g) => g.title)).toEqual(['Hari ini', 'Minggu ini', 'Nanti', 'Sudah lewat']);
    expect(groups[0].items.map((x) => x.id)).toEqual(['t1', 't2']);
    expect(groups[3].items.map((x) => x.id)).toEqual(['p2', 'p1']);
  });

  it('skips empty groups', () => {
    expect(groupJadwal([j('l1', '2027-01-01')], NOW).map((g) => g.key)).toEqual(['later']);
    expect(groupJadwal([], NOW)).toEqual([]);
  });

  it('jadwalFor filters by application, soonest first', () => {
    const list = [
      { id: '1', lamaran_id: 'A', tanggal: '2026-11-20' },
      { id: '2', lamaran_id: 'B', tanggal: '2026-11-10' },
      { id: '3', lamaran_id: 'A', tanggal: '2026-11-15' },
    ];
    expect(jadwalFor(list, 'A').map((x) => x.id)).toEqual(['3', '1']);
  });
});

describe('calendarUrl', () => {
  const lamaran = { perusahaan: 'PT Maju & Jaya', posisi: 'Staf Admin' };
  const parse = (url) => {
    const u = new URL(url);
    return Object.fromEntries(u.searchParams);
  };

  it('builds a timed event with a 1-hour default', () => {
    const url = calendarUrl(
      { jenis: 'Interview HR', tanggal: '2026-11-20', jam_mulai: '09:00', catatan: 'Bawa CV', lokasi_atau_link: 'Jl. Sudirman 1' },
      lamaran,
    );
    expect(url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&')).toBe(true);
    const q = parse(url);
    expect(q.text).toBe('Interview HR – PT Maju & Jaya');
    expect(q.dates).toBe('20261120T090000/20261120T100000');
    expect(q.details).toBe('Staf Admin\n\nBawa CV');
    expect(q.location).toBe('Jl. Sudirman 1');
  });

  it('encodes special characters so they cannot break the query', () => {
    const url = calendarUrl({ jenis: 'Lainnya', tanggal: '2026-11-20', jam_mulai: '09:00', catatan: 'a&b=c #1 +2' }, lamaran);
    expect(url).not.toContain('a&b');
    expect(parse(url).details).toBe('Staf Admin\n\na&b=c #1 +2');
  });

  it('uses the end time when given, and crosses midnight correctly', () => {
    expect(parse(calendarUrl({ jenis: 'Psikotes', tanggal: '2026-11-20', jam_mulai: '13:00', jam_selesai: '15:30' })).dates).toBe(
      '20261120T130000/20261120T153000',
    );
    expect(parse(calendarUrl({ jenis: 'Psikotes', tanggal: '2026-11-30', jam_mulai: '23:30' })).dates).toBe(
      '20261130T233000/20261201T003000',
    );
  });

  it('makes an all-day event without a start time', () => {
    expect(parse(calendarUrl({ jenis: 'Tes Teknis', tanggal: '2026-12-31' })).dates).toBe('20261231/20270101');
  });

  it('returns null without a valid date', () => {
    expect(calendarUrl({ jenis: 'Tes Teknis', tanggal: '' })).toBeNull();
  });
});

describe('review pass helpers', () => {
  it('relativeDayLabel', async () => {
    const { relativeDayLabel } = await import('../src/app/jadwal.js');
    expect(relativeDayLabel('2026-11-13', NOW)).toBe('Hari ini');
    expect(relativeDayLabel('2026-11-14', NOW)).toBe('Besok');
    expect(relativeDayLabel('2026-11-12', NOW)).toBe('Kemarin');
    expect(relativeDayLabel('2026-11-19', NOW)).toBe('Kam, 19 Nov');
    expect(relativeDayLabel('2027-01-04', NOW)).toBe('Sen, 4 Jan 2027');
    expect(relativeDayLabel('', NOW)).toBe('Tanggal belum diisi');
  });

  it('jadwalForDetail: upcoming soonest first, then past most recent first', async () => {
    const { jadwalForDetail } = await import('../src/app/jadwal.js');
    const list = [
      { id: 'p-old', lamaran_id: 'A', tanggal: '2026-10-01' },
      { id: 'u-late', lamaran_id: 'A', tanggal: '2026-11-30' },
      { id: 'today', lamaran_id: 'A', tanggal: '2026-11-13' },
      { id: 'p-new', lamaran_id: 'A', tanggal: '2026-11-10' },
      { id: 'other', lamaran_id: 'B', tanggal: '2026-11-14' },
    ];
    expect(jadwalForDetail(list, 'A', NOW).map((j) => j.id)).toEqual(['today', 'u-late', 'p-new', 'p-old']);
  });

  it('mapsUrl and isPast', async () => {
    const { mapsUrl, isPast } = await import('../src/app/jadwal.js');
    expect(mapsUrl('Jl. Sudirman No.1, Jakarta')).toBe('https://www.google.com/maps/search/?api=1&query=Jl.%20Sudirman%20No.1%2C%20Jakarta');
    expect(mapsUrl('  ')).toBeNull();
    expect(isPast({ tanggal: '2026-11-12' }, NOW)).toBe(true);
    expect(isPast({ tanggal: '2026-11-13' }, NOW)).toBe(false);
  });
});
