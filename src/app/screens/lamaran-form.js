// Tambah / Edit Lamaran. Required fields on top, optional ones in "Detail tambahan".
import { confirmDialog, h } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { today } from '../../core/dates.js';
import { backButton, comingSoon, goBack, screenHeader } from '../layout.js';
import { addLamaran, findLamaran, state, updateLamaranRow } from '../store.js';
import { SOURCES, STATUSES, WORK_TYPES } from '../schema.js';
import { createRiwayat } from '../riwayat.js';
import { announce } from '../actions.js';
import { LIMITS, createLamaran, dateValue, updateLamaran, validateLamaran } from '../lamaran.js';

const OPTIONAL_FIELDS = ['sumber', 'link_lowongan', 'lokasi', 'tipe_kerja', 'gaji_diminta', 'kontak_hr', 'catatan'];

/** @param {URLSearchParams} params  `?id=` = edit an existing application */
export function renderLamaranForm(layout, params) {
  const id = params?.get('id') || '';
  const existing = id ? findLamaran(id) : null;
  const editing = Boolean(id);
  const fallback = editing ? `/lamaran/detail?id=${encodeURIComponent(id)}` : '/lamaran';

  if (editing && !existing) {
    layout.show(null, [
      screenHeader('Edit lamaran', { leading: backButton('/lamaran') }),
      h('div', { class: 'screen-body' }, comingSoon('briefcase', 'Lamaran ini tidak ditemukan. Mungkin sudah dihapus.')),
    ], { chrome: false });
    return null;
  }

  const initial = existing
    ? { ...existing, gaji_diminta: existing.gaji_diminta === '' ? '' : String(existing.gaji_diminta ?? ''), tanggal_melamar: dateValue(existing.tanggal_melamar) }
    : { tanggal_melamar: today(), status: 'Dikirim' };

  const inputs = {};
  const errorEls = {};

  /** Label + control + error line, wired with aria-describedby. */
  function field(name, label, control, { hint, required = false } = {}) {
    control.id = `f-${name}`;
    control.name = name;
    inputs[name] = control;
    const errorId = `f-${name}-error`;
    const hintId = hint ? `f-${name}-hint` : null;
    errorEls[name] = h('p', { class: 'field-error', id: errorId, hidden: true });
    control.setAttribute('aria-describedby', [hintId, errorId].filter(Boolean).join(' '));
    control.addEventListener('input', () => setError(name, ''));
    if (required) control.setAttribute('aria-required', 'true');
    return h(
      'div',
      { class: 'field' },
      h('label', { for: control.id }, label, required && h('span', { class: 'required-mark' }, '(wajib)')),
      hint && h('p', { class: 'field-hint', id: hintId }, hint),
      control,
      errorEls[name],
    );
  }

  const text = (name, attrs = {}) =>
    h('input', { type: 'text', class: 'input', value: initial[name] ?? '', maxlength: LIMITS[name], ...attrs });

  const select = (name, options, placeholder) =>
    h(
      'select',
      { class: 'select' },
      placeholder && h('option', { value: '' }, placeholder),
      options.map((o) => h('option', { value: o, selected: initial[name] === o }, o)),
    );

  const details = h(
    'details',
    { class: 'card form-more', open: editing && OPTIONAL_FIELDS.some((k) => String(initial[k] ?? '') !== '') },
    h('summary', {}, h('span', {}, 'Detail tambahan'), icon('chevronDown', { size: 20 })),
    h(
      'div',
      { class: 'form-more__body' },
      field('tanggal_melamar', 'Tanggal melamar', h('input', { type: 'date', class: 'input', value: initial.tanggal_melamar })),
      !editing && field('status', 'Status', select('status', STATUSES)),
      field('sumber', 'Sumber lowongan', select('sumber', SOURCES, 'Pilih sumber')),
      field('link_lowongan', 'Link lowongan', text('link_lowongan', { type: 'url', inputmode: 'url', placeholder: 'https://…' })),
      field('lokasi', 'Lokasi', text('lokasi', { placeholder: 'Contoh: Jakarta Selatan' })),
      field('tipe_kerja', 'Tipe kerja', select('tipe_kerja', WORK_TYPES, 'Pilih tipe kerja')),
      field('gaji_diminta', 'Gaji yang diminta', text('gaji_diminta', { inputmode: 'numeric', placeholder: 'Contoh: 8000000' }), {
        hint: 'Dalam rupiah per bulan. Boleh dikosongkan.',
      }),
      field('kontak_hr', 'Kontak HR', text('kontak_hr', { placeholder: 'Nama, email, atau nomor' })),
      field('catatan', 'Catatan', h('textarea', { class: 'textarea', maxlength: LIMITS.catatan }, initial.catatan ?? '')),
    ),
  );

  function setError(name, message) {
    const el = errorEls[name];
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
    if (message) inputs[name].setAttribute('aria-invalid', 'true');
    else inputs[name].removeAttribute('aria-invalid');
  }

  // Typed values, to warn before leaving with unsaved changes.
  const snapshot = () => JSON.stringify(Object.values(inputs).map((el) => el.value));
  let initialSnapshot = '';
  let submitted = false;

  function leave() {
    if (submitted || snapshot() === initialSnapshot) {
      goBack(fallback);
      return;
    }
    confirmDialog({
      title: 'Buang perubahan?',
      message: 'Isian yang belum disimpan akan hilang.',
      confirmLabel: 'Buang',
      cancelLabel: 'Lanjut mengisi',
      danger: true,
      onConfirm: () => goBack(fallback),
    });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!state.online || submitted) return;
    const raw = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
    const { errors, value } = validateLamaran(raw);

    for (const name of Object.keys(inputs)) setError(name, errors[name] || '');
    const firstInvalid = Object.keys(inputs).find((k) => errors[k]);
    if (firstInvalid) {
      if (details.contains(inputs[firstInvalid])) details.open = true;
      inputs[firstInvalid].focus();
      return;
    }

    // Everything below runs synchronously inside the tap (may open the Google popup).
    submitted = true; // a second tap must not save twice
    if (editing) {
      // Status changes go through the Detail screen, which also records the history.
      const { status: _ignored, ...changes } = value;
      const unchanged = Object.entries(changes).every(([k, v]) => String(existing[k] ?? '') === String(v ?? ''));
      if (!unchanged) announce(updateLamaranRow(updateLamaran(existing, changes)), 'Perubahan tersimpan');
    } else {
      const row = createLamaran(value);
      // A starting status other than Dikirim is recorded in the history, so the
      // highest stage reached is known even after the status changes later.
      const history =
        row.status !== 'Dikirim' ? [createRiwayat({ lamaranId: row.id, jenis: 'status', statusBaru: row.status, catatan: 'Status awal saat dicatat' })] : [];
      announce(addLamaran(row, history), 'Lamaran tersimpan');
    }
    goBack(fallback);
  }

  const form = h(
    'form',
    { class: 'screen-body lamaran-form', novalidate: true, onSubmit },
    h(
      'div',
      { class: 'card stack' },
      field('perusahaan', 'Nama perusahaan', text('perusahaan', { autocomplete: 'organization', placeholder: 'Contoh: PT Maju Jaya' }), { required: true }),
      field('posisi', 'Posisi', text('posisi', { autocomplete: 'organization-title', placeholder: 'Contoh: Staf Admin' }), { required: true }),
    ),
    details,
    h(
      'div',
      { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-block', onClick: leave }, 'Batal'),
      h('button', { type: 'submit', class: 'btn btn-primary btn-block', dataset: { write: '' } }, 'Simpan'),
    ),
  );

  layout.show(
    null,
    [screenHeader(editing ? 'Edit lamaran' : 'Tambah lamaran', { leading: backButton(fallback, 'Kembali', { onBack: leave }) }), form],
    { chrome: false },
  );
  initialSnapshot = snapshot();
  if (!editing) inputs.perusahaan.focus();

  // Keep what the user typed when a background sync finishes.
  return { update() {} };
}
