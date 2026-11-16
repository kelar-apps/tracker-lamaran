// Write flow against an in-memory fake of the Sheets/Drive API: optimistic update,
// re-reading the id column before writing, cascade delete and revert on failure.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/core/ui.js', () => ({ toast: vi.fn() }));
// No license server in these tests (license flow: test/store-license.test.js).
vi.mock('../config.js', () => ({ LICENSE_URL: '', PRODUCT_ID: 'tracker-lamaran' }));
vi.mock('../src/core/auth.js', () => {
  class AuthError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }
  return {
    AuthError,
    ensureToken: vi.fn(() => Promise.resolve('tok')),
    fetchUserInfo: vi.fn(async () => ({ name: 'Sari', fullName: 'Sari', email: 'sari@example.com', picture: '' })),
    getValidToken: vi.fn(() => 'tok'),
    tokenExpiresIn: vi.fn(() => 0),
    invalidateToken: vi.fn(),
    signOut: vi.fn(),
  };
});

const { SHEETS } = await import('../src/app/schema.js');
const store = await import('../src/app/store.js');
const { toast } = await import('../src/core/ui.js');
const auth = await import('../src/core/auth.js');

// ---------- Fake spreadsheet ----------

let sheets;
const SHEET_IDS = { Lamaran: 0, Riwayat: 11, Jadwal: 22, Pengaturan: 33 };

function parseRange(range) {
  const m = /^'((?:[^']|'')+)'(?:!(.+))?$/.exec(range);
  return { sheet: m[1].replace(/''/g, "'"), part: m[2] || '' };
}

function colIndex(letters) {
  return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

function fakeFetch(failOn) {
  return vi.fn(async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    const ok = (json) => ({ ok: true, status: 200, json: async () => json });
    if (failOn && failOn(url, method)) return { ok: false, status: 500, json: async () => ({}) };

    if (url.hostname === 'www.googleapis.com') return ok({ files: [{ id: 'SID', name: 'x' }] });

    const path = decodeURIComponent(url.pathname);
    if (path.endsWith('/values:batchGet')) {
      const valueRanges = url.searchParams.getAll('ranges').map((r) => {
        const { sheet, part } = parseRange(r);
        const rows = sheets[sheet] || [];
        if (part === '1:1') return { values: rows[0] ? [rows[0]] : [] };
        if (/^[A-Z]+:[A-Z]+$/.test(part)) {
          const c = colIndex(part.split(':')[0]);
          return { values: [rows.map((row) => row[c] ?? '')] };
        }
        return { values: rows };
      });
      return ok({ valueRanges });
    }
    if (path.endsWith('/values:batchUpdate')) {
      for (const { range, values } of body.data) {
        const { sheet, part } = parseRange(range);
        const row = Number(/\d+/.exec(part)[0]);
        sheets[sheet][row - 1] = values[0];
      }
      return ok({});
    }
    if (path.endsWith(':append')) {
      const { sheet } = parseRange(path.split('/values/')[1].replace(/:append$/, '').replace(/!A1$/, ''));
      sheets[sheet].push(...body.values);
      return ok({});
    }
    if (path.endsWith(':batchUpdate')) {
      for (const r of body.requests) {
        const { sheetId, startIndex } = r.deleteDimension.range;
        const name = Object.keys(SHEET_IDS).find((k) => SHEET_IDS[k] === sheetId);
        sheets[name].splice(startIndex, 1);
      }
      return ok({});
    }
    if (url.searchParams.get('fields')?.includes('sheets.properties')) {
      return ok({ sheets: Object.keys(sheets).map((title) => ({ properties: { title, sheetId: SHEET_IDS[title], index: 0 } })) });
    }
    throw new Error(`unexpected request ${method} ${url}`);
  });
}

const row = (headers, obj) => headers.map((h) => obj[h] ?? '');
const L = (id, perusahaan) => ({ id, perusahaan, posisi: 'Staf', status: 'Dikirim', tanggal_melamar: '2026-11-01', diarsipkan: false });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  // Let background syncs from the previous test finish first.
  await new Promise((r) => setTimeout(r, 10));
  sheets = {
    Lamaran: [SHEETS.Lamaran, row(SHEETS.Lamaran, L('a', 'Alfa')), row(SHEETS.Lamaran, L('b', 'Beta'))],
    Riwayat: [SHEETS.Riwayat, ['r1', 'b', '2026-11-01', 'status', 'Dikirim', ''], ['r2', 'a', '', 'catatan', '', ''], ['r3', 'b', '', 'catatan', '', 'x']],
    Jadwal: [SHEETS.Jadwal, ['j1', 'b', 'Interview HR', '2026-11-20']],
    Pengaturan: [SHEETS.Pengaturan, ['target_mingguan', 10], ['hari_follow_up', 7], ['nama_panggilan', '']],
  };
  Object.assign(store.state, {
    phase: 'ready',
    online: true,
    connected: false,
    syncing: false,
    user: { name: 'Sari', email: 'sari@example.com' },
    spreadsheetId: 'SID',
    data: {
      lamaran: [L('a', 'Alfa'), L('b', 'Beta')],
      riwayat: [{ id: 'r1', lamaran_id: 'b' }, { id: 'r2', lamaran_id: 'a' }, { id: 'r3', lamaran_id: 'b' }],
      jadwal: [{ id: 'j1', lamaran_id: 'b' }],
    },
  });
  vi.mocked(toast).mockClear();
});

describe('store writes', () => {
  it('adds a lamaran optimistically and appends it with the Sheet header order', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    // The user moved the "posisi" column to the end in the Sheet.
    const moved = [...SHEETS.Lamaran.filter((h) => h !== 'posisi'), 'posisi'];
    sheets.Lamaran = [moved];
    const p = store.addLamaran({ ...L('c', 'Citra'), posisi: 'Kasir' });
    expect(store.state.data.lamaran.map((l) => l.id)).toContain('c'); // before any network
    expect(await p).toBe(true);
    const appended = sheets.Lamaran[1];
    expect(appended[moved.indexOf('posisi')]).toBe('Kasir');
    expect(appended[moved.indexOf('perusahaan')]).toBe('Citra');
  });

  it('updates the row found by re-reading the id column, not a cached position', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    // Someone inserted a row above in the Sheet; row numbers in any cache are now stale.
    sheets.Lamaran.splice(1, 0, row(SHEETS.Lamaran, L('z', 'Manual')));
    const after = { ...store.findLamaran('b'), status: 'Interview' };
    expect(await store.updateLamaranRow(after)).toBe(true);
    const status = SHEETS.Lamaran.indexOf('status');
    expect(sheets.Lamaran.map((r) => r[0])).toEqual(['id', 'z', 'a', 'b']);
    expect(sheets.Lamaran[3][status]).toBe('Interview');
    expect(sheets.Lamaran[2][status]).toBe('Dikirim');
  });

  it('reverts and tells the user when the row no longer exists in the Sheet', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    sheets.Lamaran = sheets.Lamaran.filter((r) => r[0] !== 'b');
    const before = store.findLamaran('b');
    const ok = await store.updateLamaranRow({ ...before, status: 'Tes' });
    expect(ok).toBe(false);
    expect(store.findLamaran('b').status).toBe('Dikirim');
    expect(vi.mocked(toast).mock.calls[0][0]).toMatch(/sudah berubah atau dihapus/);
  });

  it('deletes a lamaran with its Riwayat and Jadwal rows', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    expect(await store.deleteLamaran('b')).toBe(true);
    expect(store.state.data.lamaran.map((l) => l.id)).toEqual(['a']);
    expect(sheets.Lamaran.map((r) => r[0])).toEqual(['id', 'a']);
    expect(sheets.Riwayat.map((r) => r[0])).toEqual(['id', 'r2']);
    expect(sheets.Jadwal.map((r) => r[0])).toEqual(['id']);
  });

  it('reverts the optimistic change and shows "Gagal menyimpan, coba lagi" on an API error', async () => {
    vi.stubGlobal('fetch', fakeFetch((url, method) => method === 'POST'));
    const p = store.deleteLamaran('a');
    expect(store.findLamaran('a')).toBeNull();
    expect(await p).toBe(false);
    expect(store.findLamaran('a')).not.toBeNull();
    expect(store.state.data.riwayat.some((r) => r.id === 'r2')).toBe(true);
    expect(vi.mocked(toast)).toHaveBeenCalledWith('Gagal menyimpan, coba lagi');
  });

  it('does not write when the signed-in Google account is a different one', async () => {
    const fetch = fakeFetch();
    vi.stubGlobal('fetch', fetch);
    vi.mocked(auth.ensureToken).mockReturnValueOnce(Promise.resolve('tok-other'));
    vi.mocked(auth.fetchUserInfo).mockResolvedValueOnce({ name: 'X', email: 'lain@example.com' });
    const ok = await store.updateLamaranRow({ ...store.findLamaran('a'), status: 'Tes' });
    expect(ok).toBe(false);
    expect(sheets.Lamaran[1][SHEETS.Lamaran.indexOf('status')]).toBe('Dikirim');
    expect(store.findLamaran('a').status).toBe('Dikirim');
    await flush();
  });

  it('does nothing while offline', async () => {
    store.state.online = false;
    const fetch = fakeFetch();
    vi.stubGlobal('fetch', fetch);
    expect(await store.addLamaran(L('c', 'Citra'))).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(store.findLamaran('c')).toBeNull();
  });
});

describe('history and schedules', () => {
  it('a status change updates the row and appends a Riwayat row in one write', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    const rStatus = { id: 'r9', lamaran_id: 'a', tanggal: '2026-11-13T00:00:00.000Z', jenis: 'status', status_baru: 'Tes', catatan: '' };
    const p = store.updateLamaranRow({ ...store.findLamaran('a'), status: 'Tes' }, [rStatus]);
    expect(store.state.data.riwayat.some((r) => r.id === 'r9')).toBe(true);
    expect(await p).toBe(true);
    expect(sheets.Lamaran[1][SHEETS.Lamaran.indexOf('status')]).toBe('Tes');
    expect(sheets.Riwayat.at(-1)).toEqual(['r9', 'a', '2026-11-13T00:00:00.000Z', 'status', 'Tes', '']);
  });

  it('reverts both the row and the history row when the write fails', async () => {
    vi.stubGlobal('fetch', fakeFetch((url, method) => method === 'POST' || method === 'PUT'));
    const ok = await store.updateLamaranRow({ ...store.findLamaran('a'), status: 'Tes' }, [{ id: 'r9', lamaran_id: 'a' }]);
    expect(ok).toBe(false);
    expect(store.findLamaran('a').status).toBe('Dikirim');
    expect(store.state.data.riwayat.some((r) => r.id === 'r9')).toBe(false);
  });

  it('adds a note', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    expect(await store.addRiwayat({ id: 'n1', lamaran_id: 'a', tanggal: 'x', jenis: 'catatan', status_baru: '', catatan: '=1+1' })).toBe(true);
    expect(sheets.Riwayat.at(-1)).toEqual(['n1', 'a', 'x', 'catatan', '', '=1+1']);
  });

  it('adds, updates and deletes a schedule', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    const j2 = { id: 'j2', lamaran_id: 'a', jenis: 'Psikotes', tanggal: '2026-11-25', jam_mulai: '09:00', jam_selesai: '', mode: 'Online', lokasi_atau_link: '', catatan: '', selesai: false };
    expect(await store.addJadwal(j2)).toBe(true);
    expect(sheets.Jadwal.map((r) => r[0])).toEqual(['id', 'j1', 'j2']);

    store.state.data.jadwal = [...store.state.data.jadwal.filter((j) => j.id !== 'j2'), j2];
    expect(await store.updateJadwalRow({ ...j2, selesai: true })).toBe(true);
    expect(sheets.Jadwal[2][SHEETS.Jadwal.indexOf('selesai')]).toBe(true);

    expect(await store.deleteJadwal('j2')).toBe(true);
    expect(sheets.Jadwal.map((r) => r[0])).toEqual(['id', 'j1']);
    expect(store.findJadwal('j2')).toBeNull();
  });

  it('adding a lamaran can include its starting status in Riwayat', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    const r0 = { id: 'r0', lamaran_id: 'c', tanggal: 't', jenis: 'status', status_baru: 'Interview', catatan: 'Status awal saat dicatat' };
    expect(await store.addLamaran({ ...L('c', 'Citra'), status: 'Interview' }, [r0])).toBe(true);
    expect(sheets.Riwayat.at(-1)[0]).toBe('r0');
  });
});

describe('settings', () => {
  it('updates the existing Pengaturan row', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    store.state.settings = { target_mingguan: 10, hari_follow_up: 7, nama_panggilan: '' };
    const p = store.updateSetting('target_mingguan', 12);
    expect(store.state.settings.target_mingguan).toBe(12);
    expect(await p).toBe(true);
    expect(sheets.Pengaturan[1]).toEqual(['target_mingguan', 12]);
    expect(sheets.Pengaturan).toHaveLength(4);
  });

  it('merges rapid taps into one write with the last value', async () => {
    const fetch = fakeFetch();
    vi.stubGlobal('fetch', fetch);
    store.state.settings = { target_mingguan: 10, hari_follow_up: 7, nama_panggilan: '' };
    const first = store.updateSetting('hari_follow_up', 8);
    store.updateSetting('hari_follow_up', 9);
    store.updateSetting('hari_follow_up', 10);
    expect(store.state.settings.hari_follow_up).toBe(10);
    await first;
    expect(sheets.Pengaturan[2]).toEqual(['hari_follow_up', 10]);
    const writes = fetch.mock.calls.filter(([url, init]) => init?.method === 'POST' && String(url).includes('values:batchUpdate'));
    expect(writes).toHaveLength(1);
  });

  it('appends the row when the key is missing', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    sheets.Pengaturan = sheets.Pengaturan.filter((r) => r[0] !== 'nama_panggilan');
    expect(await store.updateSetting('nama_panggilan', 'Sari')).toBe(true);
    expect(sheets.Pengaturan.at(-1)).toEqual(['nama_panggilan', 'Sari']);
  });

  it('reverts the setting when the write fails', async () => {
    vi.stubGlobal('fetch', fakeFetch((url, method) => method === 'POST'));
    store.state.settings = { target_mingguan: 10, hari_follow_up: 7, nama_panggilan: '' };
    expect(await store.updateSetting('target_mingguan', 20)).toBe(false);
    expect(store.state.settings.target_mingguan).toBe(10);
  });
});
