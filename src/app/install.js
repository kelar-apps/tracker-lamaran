// "Pasang Kelar di HP-mu": Android banner, iOS bottom sheet, and the Pengaturan button.
import { h, openSheet, toast } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { canPromptInstall, isIos, isStandalone, promptInstall } from '../core/pwa.js';
import { shouldRemind } from '../core/remind.js';

const IOS_SHOWN_KEY = 'kelar.install.iosShownAt';
const SNOOZE_KEY = 'kelar.install.snoozedAt';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function getNumber(key) {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function setNow(key) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Can the app be installed from here (for the Pengaturan button)? */
export function installAvailable() {
  return !isStandalone();
}

/** Android/Chrome banner card for Beranda, or null. */
export function installBanner() {
  if (!canPromptInstall() || !shouldRemind(getNumber(SNOOZE_KEY), Date.now(), SNOOZE_MS)) return null;
  const card = h(
    'section',
    { class: 'card install-banner', 'aria-labelledby': 'pasang-judul' },
    h('span', { class: 'install-banner__icon' }, icon('download', { size: 22 })),
    h(
      'div',
      { class: 'install-banner__text' },
      h('h2', { id: 'pasang-judul' }, 'Pasang Kelar di HP-mu'),
      h('p', { class: 'small muted' }, 'Buka lebih cepat dari layar utama, dan tetap bisa dilihat saat offline.'),
    ),
    h(
      'div',
      { class: 'install-banner__actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary btn-sm',
          onClick: async () => {
            card.remove();
            if (await promptInstall()) toast('Kelar sedang dipasang');
          },
        },
        'Instal',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          onClick: () => {
            setNow(SNOOZE_KEY);
            card.remove();
          },
        },
        'Nanti',
      ),
    ),
  );
  return card;
}

let iosCheckedThisSession = false;

/** iOS Safari (not installed): show the instructions at most once every 3 days. */
export function maybeShowIosInstallSheet() {
  if (iosCheckedThisSession) return;
  iosCheckedThisSession = true;
  if (!isIos() || isStandalone() || !shouldRemind(getNumber(IOS_SHOWN_KEY))) return;
  setTimeout(() => {
    if (document.querySelector('dialog[open]')) return; // never on top of another dialog
    setNow(IOS_SHOWN_KEY);
    showIosSheet();
  }, 1500);
}

function step(n, text, iconName) {
  return h(
    'li',
    { class: 'install-step' },
    h('span', { class: 'install-step__n', 'aria-hidden': 'true' }, String(n)),
    h('span', { class: 'install-step__text' }, text),
    iconName && h('span', { class: 'install-step__icon' }, icon(iconName, { size: 22 })),
  );
}

function showIosSheet() {
  openSheet({
    title: 'Pasang Kelar di iPhone',
    body: () =>
      h(
        'div',
        { class: 'stack' },
        h(
          'div',
          { class: 'install-art', 'aria-hidden': 'true' },
          h('span', { class: 'install-art__box' }, icon('share', { size: 30 })),
          h('span', { class: 'install-art__arrow' }, icon('chevronRight', { size: 24 })),
          h('span', { class: 'install-art__box' }, icon('plusSquare', { size: 30 })),
        ),
        h(
          'ol',
          { class: 'install-steps' },
          step(1, 'Tap ikon Share di bar Safari', 'share'),
          step(2, 'Pilih "Add to Home Screen" (Tambahkan ke Layar Utama)', 'plusSquare'),
          step(3, 'Tap "Add" (Tambah) di kanan atas'),
        ),
        h('p', { class: 'small muted' }, 'Setelah itu, buka Kelar dari ikon di layar utama. Kamu perlu masuk sekali lagi di sana.'),
      ),
  });
}

function showGenericSheet() {
  openSheet({
    title: 'Pasang Kelar',
    body: () =>
      h(
        'div',
        { class: 'stack' },
        h(
          'ol',
          { class: 'install-steps' },
          step(1, 'Buka Kelar di Chrome', null),
          step(2, 'Tap menu ⋮ di kanan atas', 'more'),
          step(3, 'Pilih "Instal aplikasi" atau "Tambahkan ke layar utama"', 'plusSquare'),
        ),
        h('p', { class: 'small muted' }, 'Di laptop, cari ikon instal di ujung kanan address bar Chrome atau Edge.'),
      ),
  });
}

/** Pengaturan → "Instal aplikasi". Call from a tap. */
export async function openInstallHelp() {
  if (canPromptInstall()) {
    if (await promptInstall()) toast('Kelar sedang dipasang');
    return;
  }
  if (isIos()) showIosSheet();
  else showGenericSheet();
}
