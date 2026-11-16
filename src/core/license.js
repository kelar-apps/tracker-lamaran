// License check against the Kelar "Lisensi" Apps Script web app, with a local cache.
// Shared by all Kelar apps (the product id tells them apart).
//
// - POST with Content-Type text/plain so the browser sends a "simple request"
//   (no CORS preflight, which Apps Script cannot answer). fetch follows the 302
//   redirect to googleusercontent.com by default.
// - Only `allowed: true` is cached, for 7 days, together with the email.
// - The cache is re-checked in the background when it is older than 1 day.

export const LICENSE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RECHECK_AFTER_MS = 24 * 60 * 60 * 1000;

export class LicenseError extends Error {
  /** @param {'network'|'bad_response'|'not_configured'} code */
  constructor(code) {
    super(code);
    this.name = 'LicenseError';
    this.code = code;
  }
}

/**
 * Ask the license server whether the signed-in user may use `product`.
 * The access token is sent so the server can verify who the user is.
 * @returns {Promise<{ allowed: boolean, email: string }>}
 */
export async function verifyLicense({ url, accessToken, product }) {
  if (!url) throw new LicenseError('not_configured');
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'verify', accessToken, product }),
      redirect: 'follow',
    });
  } catch {
    throw new LicenseError('network');
  }
  if (!res.ok) throw new LicenseError('bad_response');
  let data;
  try {
    data = await res.json();
  } catch {
    throw new LicenseError('bad_response');
  }
  if (!data || typeof data.allowed !== 'boolean') throw new LicenseError('bad_response');
  return { allowed: data.allowed, email: String(data.email || '').trim().toLowerCase() };
}

/**
 * State of a cached license for `email`:
 * 'valid' (< 1 day), 'stale' (1–7 days: usable, re-check in background),
 * 'expired' (> 7 days or from the future) or 'none' (missing / other email).
 */
export function licenseStatus(entry, { email, now = Date.now() } = {}) {
  if (!entry || entry.allowed !== true || !email || entry.email !== String(email).toLowerCase()) return 'none';
  const age = now - Number(entry.checkedAt);
  if (!Number.isFinite(age) || age < -5 * 60 * 1000) return 'expired'; // clock moved back a lot
  if (age > LICENSE_TTL_MS) return 'expired';
  if (age > RECHECK_AFTER_MS) return 'stale';
  return 'valid';
}

const storageKey = (product) => `kelar.license.${product}`;

export function readLicense(product) {
  try {
    const raw = localStorage.getItem(storageKey(product));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLicense(product, email, now = Date.now()) {
  try {
    localStorage.setItem(storageKey(product), JSON.stringify({ allowed: true, email: String(email).toLowerCase(), checkedAt: now }));
  } catch {
    /* storage blocked: the license is simply checked again next time */
  }
}

export function clearLicense(product) {
  try {
    localStorage.removeItem(storageKey(product));
  } catch {
    /* ignore */
  }
}
