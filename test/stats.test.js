import { describe, expect, it } from 'vitest';
import {
  computeStats,
  countedLamaran,
  funnel,
  highestStage,
  isResponded,
  replyTime,
  responseRate,
  sourceStats,
  statusHistory,
  weeklyCounts,
} from '../src/app/stats.js';
import { streak } from '../src/app/target.js';

// Friday 13 Nov 2026. Week = Mon 9 Nov – Sun 15 Nov.
const NOW = new Date(2026, 10, 13, 10, 0);
const iso = (y, m, d) => new Date(y, m - 1, d, 10).toISOString();

const L = (id, status, over = {}) => ({ id, status, sumber: 'LinkedIn', tanggal_melamar: '2026-11-01', diarsipkan: false, ...over });
const S = (lamaran_id, status_baru, date) => ({ lamaran_id, jenis: 'status', status_baru, tanggal: date });

describe('responded / counted', () => {
  const history = statusHistory([S('m2', 'Diproses', iso(2026, 11, 3)), S('m2', 'Mundur', iso(2026, 11, 5))]);

  it('Ditolak counts as a response, Dikirim and Mundur do not', () => {
    expect(isResponded(L('a', 'Ditolak'), history)).toBe(true);
    expect(isResponded(L('a', 'Dikirim'), history)).toBe(false);
    expect(isResponded(L('a', 'Mundur'), history)).toBe(false);
  });

  it('a status from history counts (responded, then withdrew)', () => {
    expect(isResponded(L('m2', 'Mundur'), history)).toBe(true);
  });

  it('counted excludes archived and Mundur-without-response', () => {
    const list = [L('a', 'Dikirim'), L('b', 'Tes', { diarsipkan: true }), L('m1', 'Mundur'), L('m2', 'Mundur')];
    expect(countedLamaran(list, history).map((l) => l.id)).toEqual(['a', 'm2']);
  });

  it('responseRate', () => {
    const list = [L('a', 'Dikirim'), L('b', 'Ditolak'), L('c', 'Interview'), L('d', 'Dikirim'), L('m1', 'Mundur')];
    expect(responseRate(list, statusHistory([]))).toEqual({ responded: 2, counted: 4, rate: 0.5 });
  });

  it('responseRate with nothing counted', () => {
    expect(responseRate([], statusHistory([]))).toEqual({ responded: 0, counted: 0, rate: 0 });
  });
});

describe('replyTime', () => {
  it('days to the first status change that is not Mundur', () => {
    const history = statusHistory([
      S('a', 'Diproses', iso(2026, 11, 4)), // 3 days
      S('a', 'Interview', iso(2026, 11, 9)),
      S('b', 'Mundur', iso(2026, 11, 2)),
      S('b', 'Tes', iso(2026, 11, 8)), // 7 days (Mundur skipped)
      S('c', 'Mundur', iso(2026, 11, 2)), // only Mundur: left out
    ]);
    const list = [L('a', 'Interview'), L('b', 'Tes'), L('c', 'Mundur'), L('d', 'Dikirim')];
    expect(replyTime(list, history)).toEqual({ average: 5, n: 2 });
  });

  it('no data', () => {
    expect(replyTime([L('a', 'Dikirim')], statusHistory([]))).toEqual({ average: null, n: 0 });
  });

  it('history order in the sheet does not matter', () => {
    const history = statusHistory([S('a', 'Interview', iso(2026, 11, 9)), S('a', 'Diproses', iso(2026, 11, 4))]);
    expect(replyTime([L('a', 'Interview')], history).average).toBe(3);
  });
});

describe('funnel', () => {
  it('is cumulative', () => {
    const rows = funnel([L('a', 'Interview'), L('b', 'Dikirim'), L('c', 'Diterima')], statusHistory([]));
    expect(rows.map((r) => r.count)).toEqual([3, 2, 2, 2, 1, 1]);
    expect(rows.map((r) => r.status)).toEqual(['Dikirim', 'Diproses', 'Tes', 'Interview', 'Offering', 'Diterima']);
  });

  it('Ditolak/Mundur use the highest stage in history', () => {
    const history = statusHistory([S('x', 'Tes', iso(2026, 11, 3)), S('x', 'Ditolak', iso(2026, 11, 6))]);
    expect(highestStage(L('x', 'Ditolak'), history)).toBe(2);
    expect(highestStage(L('y', 'Ditolak'), history)).toBe(0);
  });

  it('archived are left out', () => {
    expect(funnel([L('a', 'Tes', { diarsipkan: true })], statusHistory([]))[0].count).toBe(0);
  });
});

describe('sourceStats', () => {
  it('needs 3 per source, sorted by rate', () => {
    const list = [
      L('1', 'Interview', { sumber: 'Glints' }),
      L('2', 'Dikirim', { sumber: 'Glints' }),
      L('3', 'Ditolak', { sumber: 'Glints' }),
      L('4', 'Dikirim', { sumber: 'LinkedIn' }),
      L('5', 'Dikirim', { sumber: 'LinkedIn' }),
      L('6', 'Tes', { sumber: 'LinkedIn' }),
      L('7', 'Tes', { sumber: 'Indeed' }),
      L('8', 'Tes', { sumber: '' }),
    ];
    const rows = sourceStats(list, statusHistory([]));
    expect(rows.map((r) => [r.sumber, r.total, Math.round(r.rate * 100)])).toEqual([
      ['Glints', 3, 67],
      ['LinkedIn', 3, 33],
    ]);
  });
});

describe('weeklyCounts', () => {
  it('8 weeks Monday–Sunday, current week last', () => {
    const weeks = weeklyCounts(
      [
        { tanggal_melamar: '2026-11-09' },
        { tanggal_melamar: '2026-11-15', diarsipkan: true },
        { tanggal_melamar: '2026-11-08' },
        { tanggal_melamar: '2026-09-20' }, // older than 8 weeks
      ],
      NOW,
    );
    expect(weeks).toHaveLength(8);
    expect(weeks.at(-1)).toEqual({ start: '2026-11-09', end: '2026-11-15', count: 2 });
    expect(weeks.at(-2)).toMatchObject({ start: '2026-11-02', count: 1 });
    expect(weeks[0].start).toBe('2026-09-21');
    expect(weeks.reduce((a, w) => a + w.count, 0)).toBe(3);
  });
});

describe('streak', () => {
  const week = (monday, n) => Array.from({ length: n }, () => ({ tanggal_melamar: monday }));

  it('counts back from last week', () => {
    const lamaran = [...week('2026-11-02', 2), ...week('2026-10-26', 3), ...week('2026-10-12', 5)];
    expect(streak(lamaran, 2, NOW)).toBe(2); // 2 Nov, 26 Okt; 19 Okt breaks it
  });

  it('current week adds 1 when reached, never breaks when not yet', () => {
    const past = [...week('2026-11-02', 2), ...week('2026-10-26', 2)];
    expect(streak(past, 2, NOW)).toBe(2);
    expect(streak([...past, ...week('2026-11-10', 2)], 2, NOW)).toBe(3);
  });

  it('zero when last week missed', () => {
    expect(streak(week('2026-10-26', 5), 2, NOW)).toBe(0);
    expect(streak(week('2026-11-11', 5), 2, NOW)).toBe(1);
  });
});

describe('computeStats', () => {
  it('bundles everything', () => {
    const s = computeStats({ lamaran: [L('a', 'Tes')], riwayat: [] }, NOW);
    expect(s.total).toBe(1);
    expect(s.funnel).toHaveLength(6);
    expect(s.weekly).toHaveLength(8);
  });
});
