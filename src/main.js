// Poppins is bundled (latin subset) so it is precached and works offline.
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import './core/theme.css';
import { onInstallChange, setupPwa } from './core/pwa.js';
import { CLIENT_ID, missingConfig } from '../config.js';
import { preloadGis } from './core/auth.js';
import { createRouter } from './core/router.js';
import { h, toast } from './core/ui.js';
import { createLayout } from './app/layout.js';
import { bootFromCache, errorMessage, state, subscribe, watchOnline, watchVisibility } from './app/store.js';
import { renderOnboarding } from './app/screens/onboarding.js';
import { renderAkses } from './app/screens/akses.js';
import { renderBeranda } from './app/screens/beranda.js';
import { renderLamaran } from './app/screens/lamaran.js';
import { renderLamaranForm } from './app/screens/lamaran-form.js';
import { renderLamaranDetail } from './app/screens/lamaran-detail.js';
import { renderJadwal } from './app/screens/jadwal.js';
import { renderJadwalForm } from './app/screens/jadwal-form.js';
import { renderStatistik } from './app/screens/statistik.js';
import { renderPengaturan } from './app/screens/pengaturan.js';
import { renderFollowUp } from './app/screens/follow-up.js';

const root = document.getElementById('app');

const layout = createLayout(root, {
  onAdd: () => {
    location.hash = '#/lamaran/baru';
  },
});

// The screen currently shown. A screen may return { update() } to refresh itself
// in place on state changes (keeps focus and typed text), otherwise it is re-rendered.
let screen = null;
let screenPhase = null;

/** Screens that need data render onboarding (never signed in) or the license screen (locked). */
function guarded(render) {
  return (params) => {
    screenPhase = state.phase;
    if (state.phase === 'onboarding') screen = renderOnboarding(layout);
    else if (state.phase === 'locked') screen = renderAkses(layout);
    else screen = render(layout, params) || null;
  };
}

const router = createRouter(
  {
    '/beranda': guarded(renderBeranda),
    '/lamaran': guarded(renderLamaran),
    '/lamaran/baru': guarded(renderLamaranForm),
    '/lamaran/edit': guarded(renderLamaranForm),
    '/lamaran/detail': guarded(renderLamaranDetail),
    '/jadwal': guarded(renderJadwal),
    '/jadwal/baru': guarded(renderJadwalForm),
    '/jadwal/edit': guarded(renderJadwalForm),
    '/statistik': guarded(renderStatistik),
    '/pengaturan': guarded(renderPengaturan),
    '/follow-up': guarded(renderFollowUp),
  },
  '/beranda',
);

// Remember each history entry's scroll position, so "back" returns to the same spot
// (e.g. the same place in a long list). New screens start at the top.
let scrollTimer;
window.addEventListener(
  'scroll',
  () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => history.replaceState({ ...history.state, scrollY: window.scrollY }, ''), 150);
  },
  { passive: true },
);
// Registered after the router, so it runs once the new screen is rendered.
window.addEventListener('hashchange', () => {
  clearTimeout(scrollTimer);
  layout.afterNavigate({ restoreY: history.state?.scrollY });
});

// 1. Render immediately from cache (or onboarding). No network needed.
bootFromCache();
watchOnline();
watchVisibility();
router.start();

// 2. Load Google Identity Services in the background. The token is only requested
//    on a user tap (popups opened without a gesture are blocked).
preloadGis(CLIENT_ID);
window.addEventListener('online', () => preloadGis(CLIENT_ID));

// 3. Service worker + install prompts.
setupPwa({
  onNeedRefresh: (reload) => toast('Versi baru tersedia', { action: 'Muat ulang', onAction: reload, duration: 0 }),
});
onInstallChange(() => {
  const { path } = router.current();
  if (path === '/beranda' || path === '/pengaturan') rerenderKeepingFocus();
});

/**
 * Full re-render, then put keyboard focus back on the same control (matched by id
 * or aria-label), e.g. the "+" of a stepper after a tap.
 */
function rerenderKeepingFocus() {
  const active = document.activeElement;
  const screenEl = document.getElementById('screen');
  const key =
    active && active !== document.body && screenEl?.contains(active)
      ? { id: active.id, label: active.getAttribute('aria-label'), tag: active.tagName }
      : null;
  router.start();
  if (!key) return;
  let target = key.id ? document.getElementById(key.id) : null;
  if (!target && key.label) {
    target = [...screenEl.querySelectorAll(key.tag)].find((el) => el.getAttribute('aria-label') === key.label) || null;
  }
  target?.focus({ preventScroll: true });
}

// Re-render the current screen when state changes; announce new errors once.
let lastError = null;
subscribe(() => {
  layout.refreshChrome();
  if (screen?.update && screenPhase === state.phase) screen.update();
  else rerenderKeepingFocus();
  if (state.error && state.error !== lastError && state.phase === 'ready') {
    toast(errorMessage(state.error));
  }
  lastError = state.error;
});

if (import.meta.env.DEV) {
  const missing = missingConfig();
  if (missing.length) {
    root.prepend(
      h(
        'div',
        { class: 'dev-notice', style: 'max-width:480px;margin:8px auto' },
        `Mode dev: ${missing.join(', ')} belum diisi di .env (lihat SETUP.md).`,
      ),
    );
  }
}
