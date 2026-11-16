// Shown while the license is not confirmed:
// - denied:  "Akses belum aktif" (not a buyer yet)
// - recheck: the 7-day license cache ran out, sign in again to continue
// - error:   the license server could not be reached
import { h } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { BUY_URL } from '../../../config.js';
import { connect, errorMessage, signOut, state, switchAccount } from '../store.js';
import { safeHttpUrl } from '../lamaran.js';

export function renderAkses(layout) {
  const license = state.license || { status: 'recheck', email: state.user?.email || '' };
  const busy = state.syncing;
  const offline = !state.online;

  const retry = (label) =>
    h(
      'button',
      { type: 'button', class: 'btn btn-primary btn-block', disabled: busy || offline, onClick: () => connect() },
      busy ? 'Memeriksa akses…' : label,
    );

  const switchBtn = h(
    'button',
    { type: 'button', class: 'btn btn-secondary btn-block', disabled: busy || offline, onClick: () => switchAccount() },
    'Ganti akun Google',
  );

  const emailLine =
    license.email && h('p', { class: 'akses__email' }, h('span', { class: 'muted small' }, 'Kamu masuk sebagai'), h('strong', {}, license.email));

  let content;
  if (license.status === 'denied') {
    const buyUrl = safeHttpUrl(BUY_URL);
    content = [
      h('h1', {}, 'Akses belum aktif'),
      h('p', {}, 'Akun Google ini belum terdaftar sebagai pembeli Kelar — Tracker Lamaran.'),
      emailLine,
      h(
        'div',
        { class: 'stack' },
        buyUrl &&
          h('a', { class: 'btn btn-primary btn-block', href: buyUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Beli sekarang'),
        switchBtn,
        h(
          'button',
          { type: 'button', class: 'btn btn-ghost btn-block', disabled: busy || offline, onClick: () => connect() },
          busy ? 'Memeriksa akses…' : 'Sudah bayar? Cek lagi',
        ),
      ),
      h('p', { class: 'small muted' }, 'Sudah bayar tapi masih terkunci? Pastikan kamu login dengan email yang sama saat checkout.'),
    ];
  } else if (license.status === 'error') {
    content = [
      h('h1', {}, 'Akses belum bisa dicek'),
      h(
        'p',
        {},
        license.code === 'not_configured'
          ? 'Aplikasi ini belum selesai disiapkan (alamat server lisensi belum diisi). Hubungi penjual, ya.'
          : 'Server lisensi tidak bisa dihubungi. Cek koneksimu, lalu coba lagi.',
      ),
      emailLine,
      h('div', { class: 'stack' }, retry('Coba lagi'), switchBtn),
    ];
  } else {
    content = [
      h('h1', {}, 'Masuk lagi, yuk'),
      h('p', {}, 'Sudah lebih dari 7 hari sejak aksesmu terakhir dicek. Masuk sebentar dengan akun Google-mu untuk melanjutkan. Datamu tetap aman.'),
      emailLine,
      h('div', { class: 'stack' }, retry('Lanjutkan dengan Google'), switchBtn),
    ];
  }

  layout.show(
    null,
    h(
      'section',
      { class: 'akses' },
      h('div', { class: 'akses__icon' }, icon(license.status === 'error' ? 'cloudOff' : 'lock', { size: 32 })),
      content,
      offline && h('p', { class: 'onboarding__error', role: 'alert' }, 'Kamu sedang offline. Sambungkan internet untuk melanjutkan.'),
      state.error && !offline && h('p', { class: 'onboarding__error', role: 'alert' }, errorMessage(state.error)),
      h(
        'button',
        { type: 'button', class: 'btn btn-ghost btn-sm akses__logout', onClick: () => signOut() },
        icon('logout', { size: 18 }),
        'Keluar',
      ),
    ),
    { chrome: false },
  );
}
