import { describe, expect, it } from 'vitest';
import { countThisWeek, weeklyProgress } from '../src/app/target.js';
import { upcomingJadwal } from '../src/app/jadwal.js';
import { formatDateLong, isoToLocalDate } from '../src/core/dates.js';

// Friday 13 Nov 2026. Week = Mon 9 Nov – Sun 15 Nov.
const NOW = new Date(2026, 10, 13, 10, 0);

describe('countThisWeek', () => {
  it('counts Monday–Sunday by tanggal_melamar, archived included', () => {
    const lamaran = [
      { tanggal_melamar: '2026-11-08' }, // Sunday before
      { tanggal_melamar: '2026-11-09' }, // Monday
      { tanggal_melamar: '2026-11-15', diarsipkan: true }, // Sunday
      { tanggal_melamar: '2026-11-16' }, // next Monday
      { tanggal_melamar: '' },
    ];
    expect(countThisWeek(lamaran, NOW)).toBe(2);
  });

  it('on Sunday the week still started on Monday', () => {
    expect(countThisWeek([{ tanggal_melamar: '2026-11-09' }], new Date(2026, 10, 15, 23))).toBe(1);
  });
});

describe('weeklyProgress', () => {
  it('messages by progress', () => {
    expect(weeklyProgress(0, 10)).toMatchObject({ ratio: 0, message: 'Yuk mulai minggu ini dengan satu lamaran!' });
    expect(weeklyProgress(3, 10).message).toBe('Awal yang bagus, lanjutkan!');
    expect(weeklyProgress(6, 10).message).toBe('Sedikit lagi, tinggal 4 lamaran!');
    expect(weeklyProgress(12, 10)).toMatchObject({ ratio: 1, message: 'Target minggu ini tercapai. Keren!' });
  });
});

describe('upcomingJadwal', () => {
  it('today to 7 days ahead, not done, soonest first', () => {
    const list = [
      { id: 'past', tanggal: '2026-11-12' },
      { id: 'b', tanggal: '2026-11-14', jam_mulai: '09:00' },
      { id: 'a', tanggal: '2026-11-13', jam_mulai: '15:00' },
      { id: 'done', tanggal: '2026-11-14', selesai: true },
      { id: 'edge', tanggal: '2026-11-20' },
      { id: 'far', tanggal: '2026-11-21' },
    ];
    expect(upcomingJadwal(list, NOW, 7).map((j) => j.id)).toEqual(['a', 'b', 'edge']);
  });
});

describe('dates', () => {
  it('formatDateLong', () => {
    expect(formatDateLong('2026-08-17')).toBe('17 Agustus 2026');
    expect(formatDateLong('x')).toBe('');
  });
  it('isoToLocalDate', () => {
    expect(isoToLocalDate(new Date(2026, 10, 13, 23, 30).toISOString())).toBe('2026-11-13');
    expect(isoToLocalDate('')).toBe('');
  });
});
