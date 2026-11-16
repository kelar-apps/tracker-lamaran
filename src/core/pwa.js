// PWA helpers shared by Kelar apps: service worker registration with a
// "new version" callback, and the install prompts for Android (Chrome) and iOS.
import { registerSW } from 'virtual:pwa-register';

let deferredPrompt = null; // Chrome's beforeinstallprompt event
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn();
}

/** Call once at startup. `onNeedRefresh(reload)` runs when a new version is waiting. */
export function setupPwa({ onNeedRefresh } = {}) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own banner instead of Chrome's mini-infobar
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });

  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    onNeedRefresh() {
      onNeedRefresh?.(() => updateSW(true));
    },
  });
}

/** Re-render when install availability changes. */
export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Chrome/Android offered installation and we can show the native prompt. */
export function canPromptInstall() {
  return Boolean(deferredPrompt) && !isStandalone();
}

/** Show Chrome's install dialog. Call from a tap. Resolves true when accepted. */
export async function promptInstall() {
  const e = deferredPrompt;
  if (!e) return false;
  deferredPrompt = null;
  notify();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}
