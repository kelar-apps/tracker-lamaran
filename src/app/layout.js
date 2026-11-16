// App shell: screen container, bottom navigation, floating "+" button, offline
// banner and the sync chip shown in every screen header.
import { h, mount } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { connect, state } from './store.js';

export const TABS = [
  { path: '/beranda', label: 'Beranda', icon: 'home' },
  { path: '/lamaran', label: 'Lamaran', icon: 'briefcase' },
  { path: '/jadwal', label: 'Jadwal', icon: 'calendar' },
  { path: '/statistik', label: 'Statistik', icon: 'chart' },
];

/** Tabs that show the floating "+" button. */
const FAB_TABS = new Set(['/beranda', '/lamaran']);

export function createLayout(root, { onAdd } = {}) {
  const banner = h(
    'div',
    { class: 'offline-banner', role: 'status', hidden: true },
    icon('cloudOff', { size: 18 }),
    'Kamu sedang offline, data hanya bisa dilihat',
  );
  const screen = h('main', { class: 'app-shell', id: 'screen', tabindex: '-1' });

  const links = TABS.map((tab) =>
    h('a', { href: `#${tab.path}`, dataset: { path: tab.path } }, icon(tab.icon), h('span', {}, tab.label)),
  );
  const nav = h('nav', { class: 'bottom-nav', 'aria-label': 'Navigasi utama' }, h('ul', {}, links.map((a) => h('li', {}, a))));

  const fab = h(
    'button',
    // data-write: disabled while offline (nothing can be saved then).
    { type: 'button', class: 'fab', 'aria-label': 'Tambah lamaran', dataset: { write: '' }, onClick: () => onAdd?.() },
    icon('plus', { size: 28 }),
  );

  mount(root, banner, screen, nav, fab);

  /** Update the parts that depend on connection state, without re-rendering the screen. */
  function refreshChrome() {
    banner.hidden = state.online || state.phase !== 'ready';
    for (const slot of document.querySelectorAll('[data-sync-slot]')) mount(slot, syncChip());
    // Buttons that write to the Sheet are disabled while offline.
    for (const btn of document.querySelectorAll('[data-write]')) btn.disabled = !state.online;
  }

  return {
    /**
     * Render a screen. `activePath` highlights a tab (null = none).
     * Pass `chrome: false` to hide the bottom nav and "+" (onboarding, forms).
     */
    show(activePath, content, { chrome = true, fab: showFab = true } = {}) {
      for (const a of links) {
        if (a.dataset.path === activePath) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      }
      nav.hidden = !chrome;
      fab.hidden = !chrome || !showFab || !FAB_TABS.has(activePath);
      screen.classList.toggle('app-shell--bare', !chrome);
      // Lets CSS place toasts and leave room for the "+" button.
      document.body.toggleAttribute('data-bare', !chrome);
      document.body.toggleAttribute('data-fab', !fab.hidden);
      mount(screen, content);
      refreshChrome();
      // Tab title follows the screen heading, e.g. "Lamaran — Kelar".
      const heading = screen.querySelector('h1')?.textContent?.trim();
      document.title = heading && heading !== 'Kelar' ? heading + ' — Kelar' : 'Kelar — Tracker Lamaran';
    },
    /** After navigating: top of the page (or the saved position), focus on the screen. */
    afterNavigate({ restoreY } = {}) {
      window.scrollTo(0, restoreY || 0);
      screen.focus({ preventScroll: true });
    },
    refreshChrome,
  };
}

/**
 * Standard screen header: title row (back button, title, icon actions) and, under
 * it, the sync chip when there is something to say (offline, syncing, tap to sync).
 */
export function screenHeader(title, { brand = false, actions = [], leading = null, subtitle = null } = {}) {
  const list = [actions].flat().filter(Boolean);
  return h(
    'header',
    { class: brand ? 'screen-header screen-header--brand' : 'screen-header' },
    h(
      'div',
      { class: 'screen-header__row' },
      h('div', { class: 'screen-header__title' }, leading, h('h1', {}, title)),
      list.length > 0 && h('div', { class: 'screen-header__actions' }, list),
    ),
    subtitle && h('p', { class: 'screen-header__subtitle' }, subtitle),
    h('div', { class: leading ? 'sync-slot sync-slot--indent' : 'sync-slot', dataset: { syncSlot: '' } }),
  );
}

/** Small status chip: offline / syncing / tap to sync. Hidden when connected. */
export function syncChip() {
  if (!state.online) {
    return h('span', { class: 'chip chip--muted' }, icon('cloudOff', { size: 16 }), 'Offline');
  }
  if (state.syncing) {
    return h('span', { class: 'chip', role: 'status' }, icon('refresh', { size: 16 }), 'Menyinkronkan…');
  }
  if (!state.connected) {
    return h(
      'button',
      { type: 'button', class: 'chip chip--action', onClick: () => connect() },
      icon('refresh', { size: 16 }),
      'Ketuk untuk sinkronkan',
    );
  }
  return null;
}

/**
 * Back button for sub-screens. Goes back in history when we came from inside the app.
 * `onBack` replaces the default (e.g. a form asking "Buang perubahan?" first).
 */
export function backButton(fallback, label = 'Kembali', { onBack } = {}) {
  return h(
    'button',
    { type: 'button', class: 'icon-btn icon-btn--back', 'aria-label': label, onClick: () => (onBack ? onBack() : goBack(fallback)) },
    icon('back'),
  );
}

// Each history entry created inside the app gets a depth. depth > 0 means the
// previous entry is also one of our screens, so history.back() is safe.
let depth = Number(history.state?.depth) || 0;
let replacing = false;
history.replaceState({ ...history.state, depth }, '');
window.addEventListener('hashchange', () => {
  if (history.state?.depth != null) depth = history.state.depth; // back/forward
  else if (!replacing) depth++; // new entry
  replacing = false;
  history.replaceState({ ...history.state, depth }, '');
});

/** history.back() when there is an in-app page to return to, otherwise go to `fallback`. */
export function goBack(fallback) {
  if (depth > 0) {
    history.back();
  } else {
    replacing = true;
    location.replace(`#${fallback}`);
  }
}

/** Placeholder blocks shown while data is loading for the first time. */
export function skeleton(message) {
  const block = (cls) => h('div', { class: 'skeleton ' + cls, 'aria-hidden': 'true' });
  return h(
    'div',
    { class: 'skeleton-screen', role: 'status', 'aria-live': 'polite' },
    block('skeleton--header'),
    h('p', { class: 'skeleton-screen__message' }, message),
    block('skeleton--card'),
    h('div', { class: 'skeleton-row' }, block('skeleton--tile'), block('skeleton--tile'), block('skeleton--tile')),
    block('skeleton--card'),
    block('skeleton--line'),
    block('skeleton--line skeleton--short'),
  );
}

/** Temporary content for screens that are built in later phases. */
export function comingSoon(iconName, message) {
  return h('div', { class: 'card empty-state' }, icon(iconName, { size: 48 }), h('p', {}, message));
}
