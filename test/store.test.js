import { describe, expect, it } from 'vitest';
import { missingSettingKeys, parseCache, parseSettings } from '../src/app/store.js';
import { isTokenValid } from '../src/core/auth.js';

describe('parseSettings', () => {
  it('uses defaults when empty', () => {
    expect(parseSettings([])).toEqual({ target_mingguan: 10, hari_follow_up: 7, nama_panggilan: '' });
  });

  it('parses and clamps values typed in the sheet', () => {
    const s = parseSettings([
      { key: 'target_mingguan', value: '80' },
      { key: 'hari_follow_up', value: 1 },
      { key: 'nama_panggilan', value: '  Rani ' },
    ]);
    expect(s).toEqual({ target_mingguan: 50, hari_follow_up: 3, nama_panggilan: 'Rani' });
  });

  it('falls back on garbage', () => {
    expect(parseSettings([{ key: 'target_mingguan', value: 'banyak' }]).target_mingguan).toBe(10);
  });
});

describe('missingSettingKeys', () => {
  it('lists keys without a row', () => {
    expect(missingSettingKeys([{ key: 'target_mingguan', value: 5 }])).toEqual(['hari_follow_up', 'nama_panggilan']);
    expect(missingSettingKeys([])).toHaveLength(3);
  });
});

describe('parseCache', () => {
  it('rejects missing, broken or old caches', () => {
    expect(parseCache(null)).toBeNull();
    expect(parseCache('{oops')).toBeNull();
    expect(parseCache(JSON.stringify({ version: 0, user: { email: 'a@b.c' }, spreadsheetId: 'x' }))).toBeNull();
    expect(parseCache(JSON.stringify({ version: 1, spreadsheetId: 'x' }))).toBeNull();
  });

  it('accepts a valid cache', () => {
    const raw = JSON.stringify({ version: 1, user: { email: 'a@b.c' }, spreadsheetId: 'x', data: {} });
    expect(parseCache(raw)?.spreadsheetId).toBe('x');
  });

  it('never contains an access token field', () => {
    // Guard against accidentally persisting tokens: the cache shape has no token key.
    const raw = JSON.stringify({ version: 1, user: { email: 'a@b.c' }, spreadsheetId: 'x' });
    expect(Object.keys(parseCache(raw))).not.toContain('token');
  });
});

describe('isTokenValid', () => {
  it('treats tokens about to expire as invalid', () => {
    const now = 1_000_000;
    expect(isTokenValid(null, now)).toBe(false);
    expect(isTokenValid({ value: 't', expiresAt: now + 30_000 }, now)).toBe(false);
    expect(isTokenValid({ value: 't', expiresAt: now + 10 * 60_000 }, now)).toBe(true);
  });
});
