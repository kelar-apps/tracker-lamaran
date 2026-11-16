// App configuration, read from Vite env variables at build time.
// None of these values are secret: they end up in the public bundle.
const env = import.meta.env;

export const CLIENT_ID = env.VITE_GOOGLE_CLIENT_ID || '';
/** Values copied unchanged from .env.example count as not filled in. */
const real = (value) => (value && !/XXXXXXXX/.test(value) ? value : '');

export const LICENSE_URL = real(env.VITE_LICENSE_URL);
export const PRODUCT_ID = env.VITE_PRODUCT_ID || 'tracker-lamaran';
export const BUY_URL = env.VITE_BUY_URL || '';
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** Names of required settings that are still empty, for a setup warning in dev. */
export function missingConfig() {
  return Object.entries({
    VITE_GOOGLE_CLIENT_ID: CLIENT_ID,
    VITE_LICENSE_URL: LICENSE_URL,
    VITE_BUY_URL: BUY_URL,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);
}
