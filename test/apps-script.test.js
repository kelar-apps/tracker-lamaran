// Runs apps-script/Code.gs in a sandbox with fake Apps Script services.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

const CODE = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const CLIENT_ID = 'client-123.apps.googleusercontent.com';

/** Sheets stores "'text" as plain text without the apostrophe. */
const cellValue = (v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v);

function fakeSheet(rows) {
  const data = rows.map((r) => [...r]);
  return {
    data,
    getLastRow: () => data.length,
    getDataRange: () => ({ getValues: () => (data.length ? data.map((r) => [...r]) : [['']]) }),
    appendRow: (row) => data.push(row.map(cellValue)),
    getRange: (r, c) => ({
      setValue: (v) => {
        while (data[r - 1].length < c) data[r - 1].push('');
        data[r - 1][c - 1] = cellValue(v);
      },
    }),
    setFrozenRows: () => {},
  };
}

function setup({ rows, props = {}, tokens = {} }) {
  const sheet = fakeSheet(rows);
  const cache = new Map();
  const properties = { CLIENT_ID, SHEET_ID: 'sheet-1', ...props };
  const context = vm.createContext({
    console: { error: () => {}, log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => properties[k] ?? null }) },
    UrlFetchApp: {
      fetch: (url) => {
        const token = decodeURIComponent(url.split('access_token=')[1]);
        const info = tokens[token];
        return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || {}) };
      },
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, v),
        removeAll: (keys) => keys.forEach((k) => cache.delete(k)),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    ContentService: {
      MimeType: { JSON: 'json', TEXT: 'text' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
  });
  vm.runInContext(CODE, context);
  const post = (body) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  return { sheet, cache, post, properties, context };
}

const tokenFor = (email) => ({
  aud: CLIENT_ID,
  email,
  email_verified: 'true',
  exp: String(Math.floor(Date.now() / 1000) + 3600),
  scope: 'openid https://www.googleapis.com/auth/userinfo.email',
});

const HEADER = ['email', 'produk', 'tanggal', 'ref_id', 'status'];
const ADMIN = 'admin@kelar.id';

describe('Code.gs', () => {
  let env;
  beforeEach(() => {
    env = setup({
      rows: [
        HEADER,
        ['budi@gmail.com', 'tracker-lamaran', '2026-11-10', 'LYNK-1', 'aktif'],
        ['sari@gmail.com', 'tracker-lamaran', '2026-11-11', '', 'nonaktif'],
      ],
      props: { ADMIN_EMAILS: `${ADMIN}, Bos@Kelar.id` },
      tokens: { 'tok-admin': tokenFor(ADMIN), 'tok-budi': tokenFor('budi@gmail.com'), 'tok-boss': tokenFor('bos@kelar.id') },
    });
  });

  describe('verify (unchanged for the apps)', () => {
    it('answers allowed for an active buyer and false otherwise', () => {
      expect(env.post({ action: 'verify', accessToken: 'tok-budi', product: 'tracker-lamaran' })).toEqual({
        allowed: true,
        email: 'budi@gmail.com',
      });
      expect(env.post({ action: 'verify', accessToken: 'tok-admin', product: 'tracker-lamaran' }).allowed).toBe(false);
    });

    it('rejects bad tokens and bad requests without an allowed field', () => {
      expect(env.post({ action: 'verify', accessToken: 'nope', product: 'tracker-lamaran' })).toEqual({ error: 'invalid_token' });
      expect(env.post({ action: 'verify', accessToken: 'tok-budi', product: 'Bad Product!' })).toEqual({ error: 'bad_request' });
      expect(env.post({ action: 'hack' })).toEqual({ error: 'unknown_action' });
    });
  });

  describe('admin access', () => {
    it('only lets ADMIN_EMAILS in (case-insensitive, comma or space separated)', () => {
      expect(env.post({ action: 'admin.list', accessToken: 'tok-budi' })).toEqual({ error: 'forbidden', email: 'budi@gmail.com' });
      expect(env.post({ action: 'admin.list', accessToken: 'nope' })).toEqual({ error: 'invalid_token' });
      expect(env.post({ action: 'admin.list', accessToken: 'tok-boss' }).admin).toBe('bos@kelar.id');
    });

    it('is closed when ADMIN_EMAILS is not set', () => {
      env.properties.ADMIN_EMAILS = '';
      expect(env.post({ action: 'admin.list', accessToken: 'tok-admin' })).toEqual({ error: 'admin_not_configured' });
    });

    it('a buyer cannot add themselves', () => {
      expect(env.post({ action: 'admin.upsert', accessToken: 'tok-budi', email: 'x@y.com', product: 'tracker-lamaran' }).error).toBe(
        'forbidden',
      );
      expect(env.sheet.data).toHaveLength(3);
    });
  });

  describe('admin.list', () => {
    it('returns every buyer row', () => {
      const res = env.post({ action: 'admin.list', accessToken: 'tok-admin' });
      expect(res.buyers).toEqual([
        { email: 'budi@gmail.com', produk: 'tracker-lamaran', tanggal: '2026-11-10', ref_id: 'LYNK-1', status: 'aktif' },
        { email: 'sari@gmail.com', produk: 'tracker-lamaran', tanggal: '2026-11-11', ref_id: '', status: 'nonaktif' },
      ]);
    });
  });

  describe('admin.upsert', () => {
    const upsert = (email, extra = {}) =>
      env.post({ action: 'admin.upsert', accessToken: 'tok-admin', email, product: 'tracker-lamaran', ...extra });

    it('adds a new buyer, normalising the email', () => {
      const res = upsert('  Rina@Gmail.com ', { refId: 'LYNK-9' });
      expect(res.result).toBe('added');
      expect(res.buyer).toMatchObject({ email: 'rina@gmail.com', produk: 'tracker-lamaran', ref_id: 'LYNK-9', status: 'aktif' });
      expect(res.buyer.tanggal).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      const row = env.sheet.data[3];
      expect([row[0], row[1], row[3], row[4]]).toEqual(['rina@gmail.com', 'tracker-lamaran', 'LYNK-9', 'aktif']);
    });

    it('never duplicates: an active buyer stays, an inactive one is re-activated', () => {
      expect(upsert('budi@gmail.com').result).toBe('already_active');
      expect(upsert('SARI@gmail.com', { refId: 'LYNK-2' }).result).toBe('reactivated');
      expect(env.sheet.data).toHaveLength(3);
      expect(env.sheet.data[2]).toEqual(['sari@gmail.com', 'tracker-lamaran', '2026-11-11', 'LYNK-2', 'aktif']);
    });

    it('applies right away: clears a cached "not allowed" answer', () => {
      env.post({ action: 'verify', accessToken: 'tok-admin', product: 'tracker-lamaran' }); // caches "0" for admin@kelar.id
      upsert(ADMIN);
      expect(env.post({ action: 'verify', accessToken: 'tok-admin', product: 'tracker-lamaran' }).allowed).toBe(true);
    });

    it('stores formula-looking text as plain text', () => {
      upsert('=cmd@evil.com', { refId: '=HYPERLINK("x")' });
      // The fake sheet strips the leading apostrophe exactly like Sheets does.
      expect(env.sheet.data[3][0]).toBe('=cmd@evil.com');
    });

    it('validates input', () => {
      expect(upsert('bukan-email').error).toBe('invalid_email');
      expect(env.post({ action: 'admin.upsert', accessToken: 'tok-admin', email: 'a@b.co', product: 'Semua Produk' }).error).toBe(
        'invalid_product',
      );
      expect(upsert('a@b.co', { refId: 'x'.repeat(101) }).error).toBe('invalid_ref');
    });

    it('follows the sheet column order', () => {
      env = setup({
        rows: [['status', 'email', 'catatan', 'produk']],
        props: { ADMIN_EMAILS: ADMIN },
        tokens: { 'tok-admin': tokenFor(ADMIN) },
      });
      env.post({ action: 'admin.upsert', accessToken: 'tok-admin', email: 'a@b.co', product: 'tracker-lamaran' });
      expect(env.sheet.data[1]).toEqual(['aktif', 'a@b.co', '', 'tracker-lamaran']);
    });
  });

  describe('admin.setStatus', () => {
    const setStatus = (email, status) =>
      env.post({ action: 'admin.setStatus', accessToken: 'tok-admin', email, product: 'tracker-lamaran', status });

    it('deactivates and the buyer loses access at once', () => {
      expect(env.post({ action: 'verify', accessToken: 'tok-budi', product: 'tracker-lamaran' }).allowed).toBe(true);
      expect(setStatus('budi@gmail.com', 'nonaktif')).toMatchObject({ result: 'updated', buyer: { status: 'nonaktif' } });
      expect(env.sheet.data[1][4]).toBe('nonaktif');
      expect(env.post({ action: 'verify', accessToken: 'tok-budi', product: 'tracker-lamaran' }).allowed).toBe(false);
    });

    it('rejects unknown rows and statuses', () => {
      expect(setStatus('siapa@gmail.com', 'aktif').error).toBe('not_found');
      expect(setStatus('budi@gmail.com', 'refund').error).toBe('invalid_status');
    });
  });

  it('addBuyer (editor / webhook) uses the same no-duplicate logic', () => {
    expect(env.context.addBuyer('budi@gmail.com', 'tracker-lamaran', '').result).toBe('already_active');
    expect(env.context.addBuyer('baru@gmail.com', 'tracker-lamaran', 'W-1').result).toBe('added');
    expect(env.sheet.data).toHaveLength(4);
  });
});
