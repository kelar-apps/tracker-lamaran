import { afterEach, describe, expect, it, vi } from 'vitest';
import { LICENSE_TTL_MS, RECHECK_AFTER_MS, licenseStatus, verifyLicense } from '../src/core/license.js';

describe('verifyLicense', () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (body, { ok = true, json = true } = {}) =>
    vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => (json ? body : JSON.parse('<html>')) }));

  it('POSTs text/plain JSON (no CORS preflight) and follows redirects', async () => {
    const fetch = respond({ allowed: true, email: 'Sari@Example.com' });
    vi.stubGlobal('fetch', fetch);
    const result = await verifyLicense({ url: 'https://script.google.com/x/exec', accessToken: 'tok', product: 'tracker-lamaran' });
    expect(result).toEqual({ allowed: true, email: 'sari@example.com' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://script.google.com/x/exec');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toMatch(/^text\/plain/);
    expect(init.redirect).toBe('follow');
    expect(JSON.parse(init.body)).toEqual({ action: 'verify', accessToken: 'tok', product: 'tracker-lamaran' });
  });

  it('returns a "no"', async () => {
    vi.stubGlobal('fetch', respond({ allowed: false, email: 'x@y.z' }));
    expect((await verifyLicense({ url: 'u', accessToken: 't', product: 'p' })).allowed).toBe(false);
  });

  it('server errors without "allowed" are "could not check", not "no"', async () => {
    vi.stubGlobal('fetch', respond({ error: 'server' }));
    await expect(verifyLicense({ url: 'u', accessToken: 't', product: 'p' })).rejects.toMatchObject({ code: 'bad_response' });
    vi.stubGlobal('fetch', respond(null, { json: false }));
    await expect(verifyLicense({ url: 'u', accessToken: 't', product: 'p' })).rejects.toMatchObject({ code: 'bad_response' });
    vi.stubGlobal('fetch', respond({}, { ok: false }));
    await expect(verifyLicense({ url: 'u', accessToken: 't', product: 'p' })).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('network failure and missing URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(verifyLicense({ url: 'u', accessToken: 't', product: 'p' })).rejects.toMatchObject({ code: 'network' });
    await expect(verifyLicense({ url: '', accessToken: 't', product: 'p' })).rejects.toMatchObject({ code: 'not_configured' });
  });
});

describe('licenseStatus', () => {
  const NOW = Date.UTC(2026, 10, 13, 3);
  const entry = (ageMs, email = 'sari@example.com') => ({ allowed: true, email, checkedAt: NOW - ageMs });

  it('valid < 1 day, stale 1–7 days, expired after 7 days', () => {
    expect(licenseStatus(entry(0), { email: 'sari@example.com', now: NOW })).toBe('valid');
    expect(licenseStatus(entry(RECHECK_AFTER_MS + 1), { email: 'sari@example.com', now: NOW })).toBe('stale');
    expect(licenseStatus(entry(LICENSE_TTL_MS), { email: 'sari@example.com', now: NOW })).toBe('stale');
    expect(licenseStatus(entry(LICENSE_TTL_MS + 1), { email: 'sari@example.com', now: NOW })).toBe('expired');
  });

  it('only for the same email, only "allowed: true"', () => {
    expect(licenseStatus(entry(0), { email: 'Sari@Example.com', now: NOW })).toBe('valid');
    expect(licenseStatus(entry(0), { email: 'lain@example.com', now: NOW })).toBe('none');
    expect(licenseStatus({ ...entry(0), allowed: false }, { email: 'sari@example.com', now: NOW })).toBe('none');
    expect(licenseStatus(null, { email: 'sari@example.com', now: NOW })).toBe('none');
  });

  it('a timestamp far in the future (clock changed) is not trusted', () => {
    expect(licenseStatus(entry(-60 * 60 * 1000), { email: 'sari@example.com', now: NOW })).toBe('expired');
    expect(licenseStatus({ allowed: true, email: 'sari@example.com', checkedAt: 'abc' }, { email: 'sari@example.com', now: NOW })).toBe('expired');
  });
});
