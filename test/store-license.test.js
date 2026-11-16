// License flow in the store: first login, denied, server unreachable, and opening
// from cache with a valid / stale / expired license cache.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const LICENSE_URL = 'https://license.test/exec';

vi.mock('../src/core/ui.js', () => ({ toast: vi.fn() }));
vi.mock('../config.js', () => ({ LICENSE_URL: 'https://license.test/exec', PRODUCT_ID: 'tracker-lamaran' }));
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
    fetchUserInfo: vi.fn(async () => ({ name: 'Sari', fullName: 'Sari Dewi', email: 'sari@example.com', picture: '' })),
    getValidToken: vi.fn(() => 'tok'),
    tokenExpiresIn: vi.fn(() => 0),
    invalidateToken: vi.fn(),
    signOut: vi.fn(),
  };
});

const { SHEETS } = await import('../src/app/schema.js');
const store = await import('../src/app/store.js');
const { RECHECK_AFTER_MS, LICENSE_TTL_MS } = await import('../src/core/license.js');

// ---------- Fakes ----------

let storage;
function fakeStorage() {
  storage = new Map();
  return {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
}

let license; // what the license server answers: object, or 'down'
function fakeFetch() {
  return vi.fn(async (input) => {
    const url = new URL(String(input));
    const ok = (json) => ({ ok: true, status: 200, json: async () => json });
    if (url.href === LICENSE_URL) {
      if (license === 'down') throw new TypeError('Failed to fetch');
      return ok(license);
    }
    if (url.hostname === 'www.googleapis.com') return ok({ files: [{ id: 'SID', name: 'x' }] });
    const path = decodeURIComponent(url.pathname);
    if (path.endsWith('/values:batchGet')) {
      const names = url.searchParams.getAll('ranges').map((r) => /^'([^']+)'/.exec(r)[1]);
      return ok({
        valueRanges: names.map((n) =>
          n === 'Pengaturan'
            ? { values: [SHEETS.Pengaturan, ['target_mingguan', 5], ['hari_follow_up', 7], ['nama_panggilan', '']] }
            : { values: [SHEETS[n]] },
        ),
      });
    }
    if (url.searchParams.get('fields')?.includes('sheets.properties')) {
      return ok({ sheets: Object.keys(SHEETS).map((title, i) => ({ properties: { title, sheetId: i, index: i } })) });
    }
    throw new Error(`unexpected request ${url}`);
  });
}

const licenseKey = 'kelar.license.tracker-lamaran';
const cacheBlob = () =>
  JSON.stringify({
    version: 1,
    user: { name: 'Sari', email: 'sari@example.com' },
    spreadsheetId: 'SID',
    headers: {},
    settings: {},
    data: { lamaran: [], riwayat: [], jadwal: [] },
    syncedAt: null,
  });

let fetch;
beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
  fetch = fakeFetch();
  vi.stubGlobal('fetch', fetch);
  license = { allowed: true, email: 'sari@example.com' };
  Object.assign(store.state, { phase: 'onboarding', license: null, user: null, spreadsheetId: '', online: true, syncing: false, error: null });
});

const calledLicense = () => fetch.mock.calls.filter(([u]) => String(u) === LICENSE_URL).length;
const calledDrive = () => fetch.mock.calls.filter(([u]) => String(u).includes('www.googleapis.com')).length;

describe('first login', () => {
  it('allowed: caches the license for this email, then sets up the spreadsheet', async () => {
    expect(await store.connect()).toBe(true);
    expect(store.state.phase).toBe('ready');
    expect(calledLicense()).toBe(1);
    expect(calledDrive()).toBe(1);
    expect(JSON.parse(storage.get(licenseKey))).toMatchObject({ allowed: true, email: 'sari@example.com' });
  });

  it('denied: locked with "denied", nothing created in Drive', async () => {
    license = { allowed: false, email: 'sari@example.com' };
    expect(await store.connect()).toBe(false);
    expect(store.state.phase).toBe('locked');
    expect(store.state.license).toMatchObject({ status: 'denied', email: 'sari@example.com' });
    expect(calledDrive()).toBe(0);
    expect(storage.has(licenseKey)).toBe(false);
  });

  it('server unreachable: locked with "error" (not "denied")', async () => {
    license = 'down';
    expect(await store.connect()).toBe(false);
    expect(store.state.license).toMatchObject({ status: 'error', code: 'network' });
  });

  it('server error answer: locked with "error"', async () => {
    license = { error: 'server' };
    await store.connect();
    expect(store.state.license).toMatchObject({ status: 'error', code: 'bad_response' });
  });

  it('after a denial, "Cek lagi" unlocks once the purchase is recorded', async () => {
    license = { allowed: false, email: 'sari@example.com' };
    await store.connect();
    license = { allowed: true, email: 'sari@example.com' };
    expect(await store.connect()).toBe(true);
    expect(store.state.phase).toBe('ready');
    expect(store.state.license).toBeNull();
  });
});

describe('opening from cache', () => {
  const saveEntry = (ageMs, email = 'sari@example.com') =>
    storage.set(licenseKey, JSON.stringify({ allowed: true, email, checkedAt: Date.now() - ageMs }));

  it('valid license cache: ready, no network', () => {
    storage.set('kelar.tracker.cache', cacheBlob());
    saveEntry(60 * 1000);
    expect(store.bootFromCache()).toBe(true);
    expect(store.state.phase).toBe('ready');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('expired license cache: locked "recheck" until the user signs in', () => {
    storage.set('kelar.tracker.cache', cacheBlob());
    saveEntry(LICENSE_TTL_MS + 1000);
    store.bootFromCache();
    expect(store.state.phase).toBe('locked');
    expect(store.state.license).toMatchObject({ status: 'recheck', email: 'sari@example.com' });
  });

  it('license cache of another email does not count', () => {
    storage.set('kelar.tracker.cache', cacheBlob());
    saveEntry(0, 'lain@example.com');
    store.bootFromCache();
    expect(store.state.phase).toBe('locked');
  });

  it('stale cache (> 1 day): usable, re-checked in the background', async () => {
    storage.set('kelar.tracker.cache', cacheBlob());
    saveEntry(RECHECK_AFTER_MS + 1000);
    store.bootFromCache();
    expect(store.state.phase).toBe('ready');
    expect(await store.connect()).toBe(true);
    expect(calledLicense()).toBe(1);
    expect(JSON.parse(storage.get(licenseKey)).checkedAt).toBeGreaterThan(Date.now() - 5000);
  });

  it('stale cache and server unreachable: keeps working', async () => {
    storage.set('kelar.tracker.cache', cacheBlob());
    saveEntry(RECHECK_AFTER_MS + 1000);
    store.bootFromCache();
    license = 'down';
    expect(await store.connect()).toBe(true);
    expect(store.state.phase).toBe('ready');
  });
});

describe('sign out', () => {
  it('removes the license cache too', async () => {
    await store.connect();
    store.signOut();
    expect(storage.has(licenseKey)).toBe(false);
    expect(store.state.phase).toBe('onboarding');
  });
});
