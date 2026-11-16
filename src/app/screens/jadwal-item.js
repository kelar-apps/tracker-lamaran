// One schedule card, used in the Jadwal tab and in Detail Lamaran.
import { confirmDialog, h, openSheet } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { parseDate } from '../../core/dates.js';
import { deleteJadwal, state, updateJadwalRow } from '../store.js';
import { dateValue, safeHttpUrl } from '../lamaran.js';
import { calendarUrl, isDone, isPast, mapsUrl, relativeDayLabel, timeRangeLabel } from '../jadwal.js';
import { announce } from '../actions.js';

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** "Kamis, 20 Nov 2026" */
export function formatDayLong(value) {
  const d = parseDate(dateValue(value));
  if (!d) return 'Tanggal belum diisi';
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * @param {object} j  schedule row
 * @param {object|null} lamaran  the application it belongs to
 * @param {{ showCompany?: boolean }} options  show company/position (Jadwal tab)
 */
export function jadwalCard(j, lamaran, { showCompany = true } = {}) {
  const now = new Date();
  const done = isDone(j);
  const past = isPast(j, now);
  const when = [relativeDayLabel(j.tanggal, now), timeRangeLabel(j)].filter(Boolean).join(' · ');
  const place = String(j.lokasi_atau_link ?? '').trim();
  const placeUrl = safeHttpUrl(place);
  const calUrl = !done && !past ? calendarUrl(j, lamaran || {}) : null;
  const jenis = j.jenis || 'Jadwal';

  const doneToggle = h(
    'button',
    {
      type: 'button',
      class: 'done-toggle',
      'aria-pressed': String(done),
      'aria-label': done ? `${jenis}: sudah selesai. Ketuk untuk membatalkan` : `Tandai ${jenis} selesai`,
      disabled: !state.online,
      dataset: { write: '' },
      onClick: () =>
        announce(updateJadwalRow({ ...j, selesai: !done }), done ? 'Jadwal ditandai belum selesai' : 'Jadwal ditandai selesai'),
    },
    icon('check', { size: 18 }),
  );

  let placeRow = null;
  if (placeUrl) {
    placeRow = h(
      'a',
      { class: 'place-link', href: placeUrl, target: '_blank', rel: 'noopener noreferrer' },
      icon('video', { size: 18 }),
      h('span', { class: 'clamp-1' }, 'Buka link meeting'),
    );
  } else if (place) {
    const maps = mapsUrl(place);
    placeRow = h(
      'p',
      { class: 'place-text small' },
      icon('mapPin', { size: 18 }),
      h('span', {}, place),
      j.mode !== 'Online' && maps && h('a', { href: maps, target: '_blank', rel: 'noopener noreferrer' }, 'Buka di Maps'),
    );
  }

  return h(
    'article',
    { class: done ? 'card jadwal-card jadwal-card--done' : 'card jadwal-card' },
    h(
      'div',
      { class: 'jadwal-card__top' },
      doneToggle,
      h(
        'div',
        { class: 'jadwal-card__main' },
        h('p', { class: past && !done ? 'jadwal-card__when jadwal-card__when--past small' : 'jadwal-card__when small' }, when),
        h(
          'p',
          { class: 'jadwal-card__type' },
          jenis,
          j.mode && h('span', { class: 'tag' }, j.mode),
          done && h('span', { class: 'tag tag--done' }, 'Selesai'),
        ),
        showCompany &&
          (lamaran
            ? h(
                'a',
                { class: 'jadwal-card__company', href: `#/lamaran/detail?id=${encodeURIComponent(lamaran.id)}` },
                h('span', { class: 'clamp-1' }, [lamaran.perusahaan, lamaran.posisi].filter(Boolean).join(' · ')),
                icon('chevronRight', { size: 16 }),
              )
            : h('p', { class: 'muted small' }, 'Lamaran tidak ditemukan')),
      ),
      h(
        'button',
        { type: 'button', class: 'icon-btn', 'aria-label': `Menu jadwal ${jenis}`, onClick: () => openJadwalMenu(j) },
        icon('more'),
      ),
    ),
    (placeRow || j.catatan) &&
      h('div', { class: 'jadwal-card__body' }, placeRow, j.catatan && h('p', { class: 'jadwal-card__note small muted' }, j.catatan)),
    calUrl &&
      h(
        'a',
        { class: 'btn btn-secondary btn-sm btn-block', href: calUrl, target: '_blank', rel: 'noopener noreferrer' },
        icon('calendar', { size: 18 }),
        'Tambah ke Google Calendar',
      ),
  );
}

function openJadwalMenu(j) {
  openSheet({
    title: j.jenis || 'Jadwal',
    body: (close) =>
      h(
        'ul',
        { class: 'sheet-list' },
        h(
          'li',
          {},
          h(
            'a',
            { class: 'sheet-item', href: `#/jadwal/edit?id=${encodeURIComponent(j.id)}`, onClick: () => close() },
            icon('edit', { size: 20 }),
            'Edit',
          ),
        ),
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              class: 'sheet-item sheet-item--danger',
              disabled: !state.online,
              dataset: { write: '' },
              onClick: () => {
                close();
                confirmDialog({
                  title: 'Hapus jadwal ini?',
                  message: 'Jadwal ini akan dihapus dari Google Sheet-mu. Ini tidak bisa dibatalkan.',
                  confirmLabel: 'Hapus',
                  danger: true,
                  onConfirm: () => {
                    if (!state.online) return;
                    announce(deleteJadwal(j.id), 'Jadwal dihapus');
                  },
                });
              },
            },
            icon('trash', { size: 20 }),
            'Hapus',
          ),
        ),
      ),
  });
}
