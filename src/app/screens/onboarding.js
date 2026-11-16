import { h } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { isIosStandalone } from '../../core/auth.js';
import { connect, errorMessage, state } from '../store.js';
import { skeleton } from '../layout.js';

const BENEFITS = [
  'Semua lamaran tercatat rapi di satu tempat',
  'Pengingat follow-up, biar nggak ada yang terlewat',
  'Statistik dan target mingguan, biar makin semangat',
];

export function renderOnboarding(layout) {
  // Signed in, first setup running (find/create the spreadsheet, load data).
  if (state.connected && state.syncing) {
    layout.show(null, skeleton('Menyiapkan spreadsheet-mu…'), { chrome: false });
    return;
  }
  const button = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary btn-block',
      disabled: state.syncing || !state.online,
      onClick: () => connect(),
    },
    state.syncing ? 'Menunggu login Google…' : 'Masuk dengan Google',
  );

  let note = null;
  if (!state.online) {
    note = h('p', { class: 'onboarding__error', role: 'alert' }, 'Kamu sedang offline. Sambungkan internet untuk masuk.');
  } else if (state.error) {
    const msg =
      isIosStandalone() && (state.error === 'popup_blocked' || state.error === 'failed')
        ? 'Login dari aplikasi di Home Screen belum berhasil. Coba buka Kelar di Safari dulu untuk login pertama kali, ya.'
        : errorMessage(state.error);
    note = h('p', { class: 'onboarding__error', role: 'alert' }, msg);
  }

  layout.show(
    null,
    h(
      'section',
      { class: 'onboarding' },
      h(
        'div',
        { class: 'onboarding__hero' },
        h('h1', { class: 'logo' }, h('img', { src: `${import.meta.env.BASE_URL}brand/kelar-logo-putih.svg`, alt: 'Kelar Apps', width: 146, height: 60 })),
        h('p', { class: 'onboarding__tagline' }, 'Urusan harian, kelar.'),
        h('p', { class: 'onboarding__subtitle' }, 'Tracker Lamaran Kerja'),
      ),
      h(
        'ul',
        { class: 'onboarding__benefits' },
        BENEFITS.map((text) => h('li', {}, h('span', { class: 'tick' }, icon('check', { size: 16 })), h('span', {}, text))),
      ),
      h('div', { class: 'onboarding__actions' }, button, note, h(
          'p',
          { class: 'onboarding__fineprint' },
          'Datamu disimpan di Google Drive milikmu sendiri. ',
          h('a', { href: `${import.meta.env.BASE_URL}privasi.html` }, 'Kebijakan privasi'),
          ' · ',
          h('a', { href: `${import.meta.env.BASE_URL}tentang.html` }, 'Tentang Kelar'),
        )),
    ),
    { chrome: false },
  );
}
