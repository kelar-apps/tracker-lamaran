// Tambah / Edit Jadwal for one application.
import { confirmDialog, h } from '../../core/ui.js';
import { announce } from '../actions.js';
import { backButton, comingSoon, goBack, screenHeader } from '../layout.js';
import { addJadwal, findJadwal, findLamaran, state, updateJadwalRow } from '../store.js';
import { SCHEDULE_MODES, SCHEDULE_TYPES } from '../schema.js';
import { dateValue } from '../lamaran.js';
import { JADWAL_LIMITS, createJadwal, timeValue, validateJadwal } from '../jadwal.js';

/**
 * @param {URLSearchParams} params  `?lamaran=` (new) or `?id=` (edit)
 */
export function renderJadwalForm(layout, params) {
  const id = params?.get('id') || '';
  const existing = id ? findJadwal(id) : null;
  const lamaranId = existing ? existing.lamaran_id : params?.get('lamaran') || '';
  const lamaran = findLamaran(lamaranId);
  const editing = Boolean(id);
  const fallback = lamaran ? `/lamaran/detail?id=${encodeURIComponent(lamaran.id)}` : '/jadwal';
  const title = editing ? 'Edit jadwal' : 'Tambah jadwal';

  if ((editing && !existing) || (!editing && !lamaran)) {
    layout.show(null, [
      screenHeader(title, { leading: backButton('/jadwal') }),
      h('div', { class: 'screen-body' }, comingSoon('calendar', editing ? 'Jadwal ini tidak ditemukan. Mungkin sudah dihapus.' : 'Lamaran untuk jadwal ini tidak ditemukan.')),
    ], { chrome: false });
    return null;
  }

  const initial = existing
    ? { ...existing, tanggal: dateValue(existing.tanggal), jam_mulai: timeValue(existing.jam_mulai), jam_selesai: timeValue(existing.jam_selesai) }
    : { jenis: SCHEDULE_TYPES[0], mode: 'Online' };

  const inputs = {};
  const errorEls = {};

  function field(name, label, control, { required = false } = {}) {
    control.id = `j-${name}`;
    control.name = name;
    inputs[name] = control;
    errorEls[name] = h('p', { class: 'field-error', id: `j-${name}-error`, hidden: true });
    control.setAttribute('aria-describedby', `j-${name}-error`);
    control.addEventListener('input', () => setError(name, ''));
    if (required) control.setAttribute('aria-required', 'true');
    return h(
      'div',
      { class: 'field' },
      h('label', { for: control.id }, label, required && h('span', { class: 'required-mark' }, '(wajib)')),
      control,
      errorEls[name],
    );
  }

  function setError(name, message) {
    errorEls[name].textContent = message;
    errorEls[name].hidden = !message;
    if (message) inputs[name].setAttribute('aria-invalid', 'true');
    else inputs[name].removeAttribute('aria-invalid');
  }

  const select = (name, options) =>
    h('select', { class: 'select' }, options.map((o) => h('option', { value: o, selected: initial[name] === o }, o)));

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
    const { errors, value } = validateJadwal(raw);
    for (const name of Object.keys(inputs)) setError(name, errors[name] || '');
    const firstInvalid = Object.keys(inputs).find((k) => errors[k]);
    if (firstInvalid) {
      inputs[firstInvalid].focus();
      return;
    }
    // Runs synchronously inside the tap (may open the Google popup).
    submitted = true;
    announce(editing ? updateJadwalRow({ ...existing, ...value }) : addJadwal(createJadwal(lamaran.id, value)), 'Jadwal tersimpan');
    goBack(fallback);
  }

  const form = h(
    'form',
    { class: 'screen-body', novalidate: true, onSubmit },
    lamaran && h('p', { class: 'form-context' }, 'Untuk ', h('strong', {}, lamaran.perusahaan || 'lamaran ini'), lamaran.posisi ? ` · ${lamaran.posisi}` : ''),
    h(
      'div',
      { class: 'card stack' },
      field('jenis', 'Jenis', select('jenis', SCHEDULE_TYPES)),
      field('tanggal', 'Tanggal', h('input', { type: 'date', class: 'input', value: initial.tanggal || '' }), { required: true }),
      h(
        'div',
        { class: 'filters__row' },
        field('jam_mulai', 'Jam mulai', h('input', { type: 'time', class: 'input', value: initial.jam_mulai || '' })),
        field('jam_selesai', 'Jam selesai', h('input', { type: 'time', class: 'input', value: initial.jam_selesai || '' })),
      ),
      h('p', { class: 'field-hint' }, 'Jam boleh dikosongkan. Kalau jam selesai kosong, durasinya dianggap 1 jam.'),
      field('mode', 'Mode', select('mode', SCHEDULE_MODES)),
      field(
        'lokasi_atau_link',
        'Lokasi atau link meeting',
        h('input', {
          type: 'text',
          class: 'input',
          maxlength: JADWAL_LIMITS.lokasi_atau_link,
          placeholder: 'Alamat kantor atau link Zoom/Meet',
          value: initial.lokasi_atau_link ?? '',
        }),
      ),
      field('catatan', 'Catatan', h('textarea', { class: 'textarea', maxlength: JADWAL_LIMITS.catatan }, initial.catatan ?? '')),
    ),
    h(
      'div',
      { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-block', onClick: leave }, 'Batal'),
      h('button', { type: 'submit', class: 'btn btn-primary btn-block', dataset: { write: '' } }, 'Simpan'),
    ),
  );

  // The location hint follows the mode: a meeting link online, an address offline.
  const updatePlaceholder = () => {
    inputs.lokasi_atau_link.placeholder = inputs.mode.value === 'Online' ? 'Link Zoom / Google Meet' : 'Alamat kantor';
  };
  inputs.mode.addEventListener('change', updatePlaceholder);
  updatePlaceholder();

  layout.show(null, [screenHeader(title, { leading: backButton(fallback, 'Kembali', { onBack: leave }) }), form], { chrome: false });
  initialSnapshot = snapshot();
  return { update() {} };
}
