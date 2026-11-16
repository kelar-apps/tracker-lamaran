// Google Identity Services (GIS) token client.
// - One token client for identity + Drive access (scopes below).
// - The access token lives in memory only (never localStorage/sessionStorage).
// - requestAccessToken opens a popup, so it MUST run synchronously inside a user
//   gesture (click handler). Call `preloadGis()` at startup so the client is ready.

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = ['openid', 'email', 'profile', DRIVE_FILE_SCOPE].join(' ');

/** Refresh a little before Google's expiry to avoid failing mid-request. */
const EXPIRY_MARGIN_MS = 60 * 1000;

export class AuthError extends Error {
  /** @param {'popup_closed'|'popup_blocked'|'scope_denied'|'gis_unavailable'|'expired'|'failed'} code */
  constructor(code, message) {
    super(message || code);
    this.name = 'AuthError';
    this.code = code;
  }
}

let gisPromise = null;
let tokenClient = null;
let clientId = '';
let token = null; // { value, expiresAt }
let pending = null; // { resolve, reject } for the in-flight request

/** Load the GIS script once. Resolves false (not throws) when offline or blocked. */
export function preloadGis(id) {
  clientId = id;
  if (!gisPromise) {
    gisPromise = new Promise((resolve) => {
      if (window.google?.accounts?.oauth2) return resolve(true);
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        gisPromise = null; // allow a retry later (e.g. when back online)
        resolve(false);
      };
      document.head.append(script);
    }).then((ok) => {
      if (ok) initClient();
      return ok;
    });
  }
  return gisPromise;
}

export function isGisReady() {
  return Boolean(tokenClient);
}

function initClient() {
  if (tokenClient || !clientId) return;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    include_granted_scopes: true,
    callback: handleTokenResponse,
    error_callback: (err) => {
      const code =
        err?.type === 'popup_closed' ? 'popup_closed' : err?.type === 'popup_failed_to_open' ? 'popup_blocked' : 'failed';
      settle(new AuthError(code, err?.message));
    },
  });
}

function handleTokenResponse(response) {
  if (response.error) {
    settle(new AuthError(response.error === 'access_denied' ? 'popup_closed' : 'failed', response.error_description));
    return;
  }
  if (!window.google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_FILE_SCOPE)) {
    settle(new AuthError('scope_denied'));
    return;
  }
  token = { value: response.access_token, expiresAt: Date.now() + Number(response.expires_in) * 1000 };
  settle(null, token.value);
}

function settle(error, value) {
  const p = pending;
  pending = null;
  if (!p) return;
  if (error) p.reject(error);
  else p.resolve(value);
}

/** Current access token if still valid, otherwise null. Never opens a popup. */
export function getValidToken(now = Date.now()) {
  return isTokenValid(token, now) ? token.value : null;
}

/** Milliseconds until the current token stops being usable (0 when there is none). */
export function tokenExpiresIn(now = Date.now()) {
  return token ? Math.max(0, token.expiresAt - EXPIRY_MARGIN_MS - now) : 0;
}

export function isTokenValid(t, now = Date.now()) {
  return Boolean(t && t.value && t.expiresAt - EXPIRY_MARGIN_MS > now);
}

/**
 * Get a valid access token, opening the Google popup if needed.
 * Call this directly from a click handler, before any `await`.
 * @param {{ hint?: string, forceConsent?: boolean, selectAccount?: boolean }} options
 *   hint = email to preselect; selectAccount = always show the account chooser
 */
export function ensureToken({ hint, forceConsent = false, selectAccount = false } = {}) {
  const valid = getValidToken();
  if (valid && !forceConsent && !selectAccount) return Promise.resolve(valid);
  if (!tokenClient) return Promise.reject(new AuthError('gis_unavailable'));
  if (pending) pending.reject(new AuthError('popup_closed')); // superseded
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    // prompt '' = no consent screen if already granted. Still needs a user gesture.
    const prompt = forceConsent ? 'consent' : selectAccount ? 'select_account' : '';
    tokenClient.requestAccessToken(selectAccount ? { prompt } : { prompt, hint });
  });
}

/** Forget the in-memory token (e.g. after a 401). */
export function invalidateToken() {
  token = null;
}

/** Revoke access and forget the token. */
export function signOut() {
  const value = token?.value;
  token = null;
  if (value && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(value, () => {});
  }
}

/** { name, email, picture } of the signed-in user. */
export async function fetchUserInfo(accessToken) {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) {
    invalidateToken();
    throw new AuthError('expired');
  }
  if (!res.ok) throw new Error(`userinfo ${res.status}`);
  const info = await res.json();
  return { name: info.given_name || info.name || '', fullName: info.name || '', email: (info.email || '').toLowerCase(), picture: info.picture || '' };
}

/** iPhone/iPad running as an installed home-screen app. */
export function isIosStandalone() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && (window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches);
}
