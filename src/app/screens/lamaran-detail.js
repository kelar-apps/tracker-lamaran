// Detail Lamaran: header with status (changed through a bottom sheet), job link,
// follow-up button, schedules, history timeline with notes, and a menu with
// Edit / Arsipkan / Hapus.
import { confirmDialog, h, openSheet } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { formatDateHuman } from '../../core/dates.js';
import { backButton, comingSoon, goBack, screenHeader } from '../layout.js';
import { addRiwayat, deleteLamaran, findLamaran, state, updateLamaranRow } from '../store.js';
import { STATUS_FLOW, STATUSES, statusBadgeClass } from '../schema.js';
import { NOTE_MAX, createRiwayat, formatDateTime, riwayatTitle, timelineFor, validateNote } from '../riwayat.js';
import { jadwalForDetail } from '../jadwal.js';
import { jadwalCard } from './jadwal-item.js';
import { followUpFor, reminderReason } from '../followup.js';
import { announce, copyFollowUpMessage, markFollowUp } from '../actions.js';
import { dateValue, formatRupiah, isTrue, safeHttpUrl, sentLabel, updateLamaran } from '../lamaran.js';

// Id of the application just deleted from this screen: while we navigate away,
// render nothing instead of flashing "tidak ditemukan".
let leavingId = null;

/** Contact text with emails and phone numbers turned into mailto:/tel: links. */
function contactNodes(text) {
  const re = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(\+?\d[\d\s-]{7,}\d)/g;
  const nodes = [];
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const href = m[1] ? `mailto:${m[1]}` : `tel:${m[2].replace(/[\s-]/g, '')}`;
    nodes.push(h('a', { href }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** @param {URLSearchParams} params  `?id=` */
export function renderLamaranDetail(layout, params) {
  const id = params?.get('id') || '';
  const l = findLamaran(id);

  if (!l && id === leavingId) {
    layout.show('/lamaran', [], { fab: false });
    return;
  }

  if (!l) {
    layout.show('/lamaran', [
      screenHeader('Detail lamaran', { leading: backButton('/lamaran') }),
      h('div', { class: 'screen-body' }, comingSoon('briefcase', 'Lamaran ini tidak ditemukan. Mungkin sudah dihapus.')),
    ], { fab: false });
    return;
  }

  const archived = isTrue(l.diarsipkan);
  const url = safeHttpUrl(l.link_lowongan);
  const tanggal = dateValue(l.tanggal_melamar);

  const menuBtn = h(
    'button',
    { type: 'button', class: 'icon-btn', 'aria-label': 'Menu lamaran', onClick: () => openMenu(l) },
    icon('more'),
  );

  const statusBtn = h(
    'button',
    {
      type: 'button',
      class: 'status-btn',
      'aria-label': `Status ${l.status || 'Dikirim'}. Ketuk untuk mengubah`,
      dataset: { write: '' },
      onClick: () => openStatusSheet(l),
    },
    h('span', { class: `badge ${statusBadgeClass(l.status)}` }, l.status || 'Dikirim'),
    h('span', { class: 'status-btn__hint' }, 'Ubah'),
    icon('chevronDown', { size: 18 }),
  );

  const head = h(
    'section',
    { class: 'card stack detail-head' },
    h('h2', { class: 'detail-head__company' }, l.perusahaan || '(Tanpa nama)'),
    h('p', { class: 'detail-head__role' }, l.posisi || ''),
    h('div', { class: 'detail-head__row' }, statusBtn, tanggal && h('span', { class: 'small muted' }, sentLabel(tanggal))),
    url &&
      h(
        'a',
        { class: 'btn btn-secondary', href: url, target: '_blank', rel: 'noopener noreferrer' },
        icon('external', { size: 20 }),
        'Buka lowongan',
      ),
  );

  const archivedNote =
    archived &&
    h(
      'div',
      { class: 'card notice' },
      icon('archive', { size: 20 }),
      h('p', {}, 'Lamaran ini diarsipkan, jadi tidak tampil di daftar utama.'),
      h(
        'button',
        { type: 'button', class: 'btn btn-secondary', dataset: { write: '' }, onClick: () => setArchived(l, false) },
        'Keluarkan dari arsip',
      ),
    );

  // [label, value, { wide }]: wide rows (long text) span the full width.
  const rows = [
    ['Tanggal melamar', formatDateHuman(tanggal)],
    ['Sumber', l.sumber],
    ['Lokasi', l.lokasi],
    ['Tipe kerja', l.tipe_kerja],
    ['Gaji diminta', formatRupiah(l.gaji_diminta)],
    ['Kontak HR', l.kontak_hr, { wide: true, contact: true }],
    // An invalid link is shown as plain text, never as a clickable link.
    ['Link lowongan', !url ? l.link_lowongan : '', { wide: true }],
    ['Catatan', l.catatan, { wide: true }],
  ].filter(([, v]) => String(v ?? '').trim() !== '');

  const info =
    rows.length > 0 &&
    h(
      'section',
      { class: 'card stack', 'aria-labelledby': 'info-lowongan' },
      h('h2', { id: 'info-lowongan', class: 'card-title' }, 'Info lowongan'),
      h(
        'dl',
        { class: 'info-list' },
        rows.map(([k, v, opt = {}]) =>
          h(
            'div',
            { class: opt.wide ? 'info-list__row info-list__row--wide' : 'info-list__row' },
            h('dt', {}, k),
            h('dd', {}, opt.contact ? contactNodes(String(v)) : String(v)),
          ),
        ),
      ),
    );

  layout.show('/lamaran', [
    screenHeader('Detail lamaran', { leading: backButton('/lamaran'), actions: [menuBtn] }),
    h('div', { class: 'screen-body' }, archivedNote, head, followUpCard(l), jadwalSection(l), info, timelineSection(l)),
  ], { fab: false });
}

function openStatusSheet(l) {
  openSheet({
    title: 'Ubah status',
    body: (close) =>
      h(
        'ul',
        { class: 'sheet-list' },
        STATUSES.map((status) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'sheet-item',
                'aria-current': status === l.status ? 'true' : null,
                disabled: !state.online,
                dataset: { write: '' },
                onClick: () => {
                  close();
                  if (status === l.status) return;
                  // Runs synchronously inside the tap (may open the Google popup).
                  announce(
                    updateLamaranRow(updateLamaran(l, { status }), [
                      createRiwayat({ lamaranId: l.id, jenis: 'status', statusBaru: status }),
                    ]),
                    `Status diubah ke ${status}`,
                  );
                },
              },
              h('span', { class: `badge ${statusBadgeClass(status)}` }, status),
              status === l.status && h('span', { class: 'sheet-item__check' }, icon('check', { size: 20 }), h('span', { class: 'visually-hidden' }, '(sekarang)')),
            ),
          ),
        ),
      ),
  });
}

function setArchived(l, archived) {
  announce(
    updateLamaranRow(updateLamaran(l, { diarsipkan: archived })),
    archived ? 'Lamaran diarsipkan' : 'Lamaran dikeluarkan dari arsip',
  );
}

function openMenu(l) {
  const archived = isTrue(l.diarsipkan);
  openSheet({
    title: l.perusahaan || 'Lamaran',
    body: (close) =>
      h(
        'ul',
        { class: 'sheet-list' },
        h(
          'li',
          {},
          h(
            'a',
            { class: 'sheet-item', href: `#/lamaran/edit?id=${encodeURIComponent(l.id)}`, onClick: () => close() },
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
              class: 'sheet-item',
              disabled: !state.online,
              dataset: { write: '' },
              onClick: () => {
                close();
                setArchived(l, !archived);
              },
            },
            icon('archive', { size: 20 }),
            archived ? 'Keluarkan dari arsip' : 'Arsipkan',
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
                confirmDelete(l);
              },
            },
            icon('trash', { size: 20 }),
            'Hapus',
          ),
        ),
      ),
  });
}

function confirmDelete(l) {
  confirmDialog({
    title: 'Hapus lamaran ini?',
    message: `Lamaran di ${l.perusahaan || 'perusahaan ini'} beserta riwayat dan jadwalnya akan dihapus dari Google Sheet-mu. Ini tidak bisa dibatalkan.`,
    confirmLabel: 'Hapus',
    danger: true,
    onConfirm: () => {
      if (!state.online) return;
      leavingId = l.id;
      announce(deleteLamaran(l.id), 'Lamaran dihapus');
      goBack('/lamaran');
    },
  });
}

/** Follow-up only makes sense while waiting for an answer (not Diterima/Ditolak/Mundur). */
function followUpCard(l) {
  if (isTrue(l.diarsipkan) || !STATUS_FLOW.includes(l.status || 'Dikirim') || l.status === 'Diterima') return null;
  const last = dateValue(l.terakhir_follow_up);
  const reminder = followUpFor(l, {
    riwayat: state.data.riwayat,
    jadwal: state.data.jadwal,
    hariFollowUp: state.settings.hari_follow_up,
  });
  return h(
    'section',
    { class: reminder ? 'card followup followup--due' : 'card followup' },
    h(
      'div',
      { class: 'followup__text' },
      h('h2', {}, reminder ? 'Waktunya follow-up' : 'Follow-up'),
      h(
        'p',
        { class: 'small muted' },
        reminder
          ? reminderReason(reminder)
          : last
            ? `Terakhir follow-up ${formatDateHuman(last)}`
            : 'Belum pernah follow-up',
      ),
    ),
    h(
      'div',
      { class: 'followup__actions' },
      reminder &&
        h(
          'button',
          { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => copyFollowUpMessage(reminder) },
          icon('copy', { size: 18 }),
          'Salin pesan follow-up',
        ),
      h(
        'button',
        { type: 'button', class: 'btn btn-secondary btn-sm', dataset: { write: '' }, onClick: () => markFollowUp(l) },
        icon('check', { size: 18 }),
        'Sudah follow-up',
      ),
    ),
  );
}

function jadwalSection(l) {
  const items = jadwalForDetail(state.data.jadwal, l.id);
  return h(
    'section',
    { class: 'stack' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', {}, 'Jadwal'),
      h(
        'a',
        { class: 'btn btn-ghost btn-sm', href: `#/jadwal/baru?lamaran=${encodeURIComponent(l.id)}` },
        icon('plus', { size: 18 }),
        'Tambah jadwal',
      ),
    ),
    items.length
      ? items.map((j) => jadwalCard(j, l, { showCompany: false }))
      : h('p', { class: 'muted small' }, 'Belum ada jadwal interview atau tes.'),
  );
}

function timelineSection(l) {
  const entries = timelineFor(state.data.riwayat, l.id);
  const tanggal = dateValue(l.tanggal_melamar);
  return h(
    'section',
    { class: 'stack' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', {}, 'Riwayat'),
      h(
        'button',
        { type: 'button', class: 'btn btn-ghost btn-sm', dataset: { write: '' }, onClick: () => openNoteSheet(l) },
        icon('plus', { size: 18 }),
        'Tambah catatan',
      ),
    ),
    h(
      'ol',
      { class: 'card timeline' },
      entries.map((r) =>
        h(
          'li',
          { class: `timeline__item timeline__item--${r.jenis || 'catatan'}` },
          r.jenis === 'status' && r.status_baru
            ? h('p', { class: 'timeline__title' }, 'Status diubah ke ', h('span', { class: `badge ${statusBadgeClass(r.status_baru)}` }, r.status_baru))
            : h('p', { class: 'timeline__title' }, riwayatTitle(r)),
          h('p', { class: 'small muted' }, formatDateTime(r.tanggal)),
          r.catatan && h('p', { class: 'timeline__note' }, r.catatan),
        ),
      ),
      // Starting point, from the application itself (not a row in Riwayat).
      h(
        'li',
        { class: 'timeline__item timeline__item--start' },
        h('p', { class: 'timeline__title' }, 'Lamaran dikirim'),
        h('p', { class: 'small muted' }, tanggal ? formatDateHuman(tanggal) : '-'),
      ),
    ),
  );
}

function openNoteSheet(l) {
  openSheet({
    title: 'Tambah catatan',
    body: (close) => {
      const textarea = h('textarea', {
        id: 'catatan-baru',
        class: 'textarea',
        maxlength: NOTE_MAX,
        'aria-describedby': 'catatan-baru-error',
        placeholder: 'Contoh: HR bilang hasil diumumkan minggu depan',
      });
      const error = h('p', { class: 'field-error', id: 'catatan-baru-error', hidden: true });
      textarea.addEventListener('input', () => {
        error.hidden = true;
        textarea.removeAttribute('aria-invalid');
      });
      return h(
        'form',
        {
          class: 'stack',
          novalidate: true,
          onSubmit: (e) => {
            e.preventDefault();
            if (!state.online) return;
            const { error: message, value } = validateNote(textarea.value);
            if (message) {
              error.textContent = message;
              error.hidden = false;
              textarea.setAttribute('aria-invalid', 'true');
              textarea.focus();
              return;
            }
            close();
            announce(addRiwayat(createRiwayat({ lamaranId: l.id, jenis: 'catatan', catatan: value })), 'Catatan tersimpan');
          },
        },
        h('div', { class: 'field' }, h('label', { for: 'catatan-baru' }, 'Catatan'), textarea, error),
        h('button', { type: 'submit', class: 'btn btn-primary btn-block', disabled: !state.online, dataset: { write: '' } }, 'Simpan catatan'),
      );
    },
  });
}
