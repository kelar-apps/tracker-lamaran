import { confirmDialog, h, stepper } from '../../core/ui.js';
import { announce } from '../actions.js';
import { formatDateTime } from '../riwayat.js';
import { icon } from '../../core/icons.js';
import { spreadsheetUrl } from '../../core/sheets.js';
import { APP_VERSION } from '../../../config.js';
import { backButton, screenHeader } from '../layout.js';
import { connect, signOut, state, updateSetting } from '../store.js';
import { TARGET_MAX, TARGET_MIN } from '../target.js';
import { installAvailable, openInstallHelp } from '../install.js';

const NAME_MAX = 40;

export function renderPengaturan(layout) {
  const back = backButton('/beranda', 'Kembali ke Beranda');

  const nameInput = h('input', {
    type: 'text',
    id: 'nama-panggilan',
    class: 'input',
    maxlength: NAME_MAX,
    autocomplete: 'nickname',
    placeholder: state.user?.name || 'Nama panggilanmu',
    value: state.settings.nama_panggilan || '',
  });
  const preferences = h(
    'div',
    { class: 'card stack' },
    h('h2', {}, 'Preferensi'),
    h(
      'form',
      {
        class: 'field',
        novalidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          if (!state.online) return;
          const value = nameInput.value.trim().slice(0, NAME_MAX);
          if (value === (state.settings.nama_panggilan || '')) return;
          announce(updateSetting('nama_panggilan', value), 'Nama panggilan tersimpan');
        },
      },
      h('label', { for: 'nama-panggilan' }, 'Nama panggilan'),
      h('p', { class: 'field-hint' }, 'Dipakai untuk sapaan di Beranda. Kosongkan untuk memakai nama akun Google.'),
      h('div', { class: 'inline-form' }, nameInput, h('button', { type: 'submit', class: 'btn btn-secondary', dataset: { write: '' } }, 'Simpan')),
    ),
    stepper({
      id: 'set-target',
      label: 'Target mingguan',
      value: state.settings.target_mingguan,
      min: TARGET_MIN,
      max: TARGET_MAX,
      unit: 'lamaran',
      onChange: (v) => updateSetting('target_mingguan', v),
    }),
    stepper({
      id: 'set-follow-up',
      label: 'Ingatkan follow-up setelah',
      value: state.settings.hari_follow_up,
      min: 3,
      max: 30,
      unit: 'hari',
      onChange: (v) => updateSetting('hari_follow_up', v),
    }),
  );

  const syncText = h('p', { class: 'small muted', 'aria-live': 'polite' });
  const syncBtn = h(
    'button',
    { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => connect() },
    icon('refresh', { size: 18 }),
    'Sinkronkan sekarang',
  );
  function refreshSyncInfo() {
    syncText.textContent = state.syncing
      ? 'Menyinkronkan…'
      : state.syncedAt
        ? `Terakhir disinkronkan ${formatDateTime(state.syncedAt)}`
        : 'Belum pernah disinkronkan di perangkat ini';
    syncBtn.disabled = state.syncing || !state.online;
  }
  refreshSyncInfo();

  const account = h(
    'div',
    { class: 'card stack' },
    h('h2', {}, 'Akun'),
    h('p', {}, state.user?.fullName || state.user?.name || ''),
    h('p', { class: 'muted' }, state.user?.email || ''),
    h('div', { class: 'sync-info' }, syncText, syncBtn),
    state.spreadsheetId &&
      h(
        'a',
        { class: 'btn btn-secondary', href: spreadsheetUrl(state.spreadsheetId), target: '_blank', rel: 'noopener noreferrer' },
        icon('sheet', { size: 20 }),
        'Buka Google Sheet saya',
      ),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-ghost',
        onClick: () =>
          confirmDialog({
            title: 'Keluar dari Kelar?',
            message: 'Data di Google Sheet-mu tetap aman. Kamu bisa masuk lagi kapan saja.',
            confirmLabel: 'Keluar',
            onConfirm: () => {
              signOut();
              location.hash = '#/beranda';
            },
          }),
      },
      icon('logout', { size: 20 }),
      'Keluar',
    ),
  );

  layout.show(null, [
    screenHeader('Pengaturan', { leading: back }),
    h(
      'div',
      { class: 'screen-body' },
      preferences,
      installAvailable() &&
        h(
          'div',
          { class: 'card stack' },
          h('h2', {}, 'Aplikasi'),
          h('p', { class: 'small muted' }, 'Pasang Kelar di layar utama HP-mu supaya bisa dibuka seperti aplikasi biasa.'),
          h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => openInstallHelp() }, icon('download', { size: 20 }), 'Instal aplikasi'),
        ),
      account,
      h(
        'p',
        { class: 'muted small center' },
        `Versi ${APP_VERSION} · `,
        h('a', { href: `${import.meta.env.BASE_URL}privasi.html` }, 'Kebijakan privasi'),
        ' · ',
        h('a', { href: `${import.meta.env.BASE_URL}tentang.html` }, 'Tentang'),
      ),
    ),
  ]);
  // Keep what the user is typing when a background sync finishes.
  return { update: refreshSyncInfo };
}
