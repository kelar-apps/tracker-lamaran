// Follow-up reminders: the card used on Beranda and the "Lihat semua" screen.
import { h } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { backButton, screenHeader } from '../layout.js';
import { state } from '../store.js';
import { statusBadgeClass } from '../schema.js';
import { followUps, reminderReason } from '../followup.js';
import { copyFollowUpMessage, markFollowUp } from '../actions.js';

/** Due reminders for the current data and settings. */
export function currentFollowUps(now = new Date()) {
  const { lamaran, riwayat, jadwal } = state.data;
  return followUps({ lamaran, riwayat, jadwal, hariFollowUp: state.settings.hari_follow_up, now });
}

export function reminderCard(reminder) {
  const l = reminder.lamaran;
  return h(
    'article',
    { class: 'card reminder' },
    h(
      'a',
      { class: 'reminder__head', href: `#/lamaran/detail?id=${encodeURIComponent(l.id)}` },
      h('span', { class: 'reminder__bell' }, icon('bell', { size: 20 })),
      h(
        'span',
        { class: 'reminder__text' },
        h('span', { class: 'reminder__company' }, l.perusahaan || '(Tanpa nama)'),
        h('span', { class: 'small muted' }, [l.posisi, reminderReason(reminder)].filter(Boolean).join(' · ')),
      ),
      h('span', { class: `badge ${statusBadgeClass(l.status)}` }, l.status || 'Dikirim'),
    ),
    h(
      'div',
      { class: 'reminder__actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary btn-sm',
          'aria-label': `Salin pesan follow-up untuk ${l.perusahaan || 'lamaran ini'}`,
          onClick: () => copyFollowUpMessage(reminder),
        },
        icon('copy', { size: 18 }),
        'Salin pesan',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary btn-sm',
          'aria-label': `Tandai sudah follow-up untuk ${l.perusahaan || 'lamaran ini'}`,
          dataset: { write: '' },
          onClick: () => markFollowUp(l),
        },
        icon('check', { size: 18 }),
        'Sudah follow-up',
      ),
    ),
  );
}

export function renderFollowUp(layout) {
  const list = currentFollowUps();
  layout.show('/beranda', [
    screenHeader('Perlu di-follow-up', { leading: backButton('/beranda') }),
    h(
      'div',
      { class: 'screen-body' },
      h(
        'p',
        { class: 'muted small' },
        `Pengingat muncul setelah ${state.settings.hari_follow_up} hari tanpa kabar.`,
      ),
      list.length
        ? list.map(reminderCard)
        : h(
            'div',
            { class: 'card empty-state' },
            icon('check', { size: 48 }),
            h('p', {}, 'Semua aman. Belum ada lamaran yang perlu di-follow-up.'),
          ),
    ),
  ], { fab: false });
}
