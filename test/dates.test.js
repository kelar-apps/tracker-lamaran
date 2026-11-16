import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatDate,
  formatDateHuman,
  parseDate,
  startOfWeek,
  today,
} from '../src/core/dates.js';

describe('parseDate', () => {
  it('parses YYYY-MM-DD as a local date (no UTC shift)', () => {
    const d = parseDate('2026-11-13');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(13);
    expect(d.getHours()).toBe(0);
  });

  it('rejects invalid input', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate('13-11-2026')).toBeNull();
    expect(parseDate('2026-02-31')).toBeNull();
    expect(parseDate('2026-13-01')).toBeNull();
  });

  it('round-trips with formatDate', () => {
    expect(formatDate(parseDate('2024-02-29'))).toBe('2024-02-29');
  });
});

describe('today', () => {
  it('uses local calendar date', () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('addDays / daysBetween', () => {
  it('crosses month and year boundaries', () => {
    expect(formatDate(addDays(parseDate('2026-12-30'), 3))).toBe('2027-01-02');
    expect(daysBetween(parseDate('2026-12-30'), parseDate('2027-01-02'))).toBe(3);
  });

  it('is negative when the second date is earlier', () => {
    expect(daysBetween(parseDate('2026-11-13'), parseDate('2026-11-06'))).toBe(-7);
  });

  it('ignores time of day', () => {
    expect(daysBetween(new Date(2026, 10, 13, 23, 0), new Date(2026, 10, 14, 1, 0))).toBe(1);
  });
});

describe('startOfWeek', () => {
  it('returns Monday for every day of the week (Monday–Sunday)', () => {
    // 2026-11-09 is a Monday, 2026-11-15 is a Sunday.
    for (let i = 0; i < 7; i++) {
      const day = addDays(parseDate('2026-11-09'), i);
      expect(formatDate(startOfWeek(day))).toBe('2026-11-09');
    }
  });

  it('moves Sunday back to the previous Monday', () => {
    expect(formatDate(startOfWeek(parseDate('2026-11-08')))).toBe('2026-11-02');
  });
});

describe('formatDateHuman', () => {
  it('formats in Indonesian', () => {
    expect(formatDateHuman('2026-08-17')).toBe('17 Agu 2026');
    expect(formatDateHuman('nope')).toBe('');
  });
});
