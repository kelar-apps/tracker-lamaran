// Daftar Lamaran: search and status chips always visible; source, sort and the
// archived toggle live in a "Filter" bottom sheet so the results start high up.
import { h, mount, openSheet } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { screenHeader } from '../layout.js';
import { state } from '../store.js';
import { SOURCES, STATUSES, statusBadgeClass } from '../schema.js';
import { SORTS, filterLamaran, isTrue, parseStatusParam, sentLabel } from '../lamaran.js';
import { currentFollowUps } from './follow-up.js';

const DEFAULT_FILTERS = { q: '', statuses: [], sumber: '', sort: 'terbaru', showArchived: false };

// Kept between visits so going to a detail and back keeps the same filters.
let filters = { ...DEFAULT_FILTERS };

/** Filters inside the sheet that differ from the default (for the badge on the button). */
function sheetFilterCount() {
  return (filters.sumber ? 1 : 0) + (filters.showArchived ? 1 : 0) + (filters.sort !== 'terbaru' ? 1 : 0);
}

function hasActiveFilters() {
  return Boolean(filters.q.trim() || filters.statuses.length || sheetFilterCount());
}

/** @param {URLSearchParams} params  `?status=Interview,Tes` preselects status chips (from Beranda). */
export function renderLamaran(layout, params) {
  if (params?.has('status')) {
    filters = { ...DEFAULT_FILTERS, statuses: parseStatusParam(params.get('status')) };
    // Drop the query so a later re-render does not reset the filters again.
    history.replaceState(history.state, '', '#/lamaran');
  }

  const results = h('div', { class: 'stack' });
  const summary = h('div', { class: 'list-summary' });

  const search = h('input', {
    type: 'search',
    id: 'cari-lamaran',
    class: 'input search__input',
    placeholder: 'Cari perusahaan atau posisi',
    autocomplete: 'off',
    enterkeyhint: 'search',
    value: filters.q,
    onInput: (e) => {
      filters.q = e.target.value;
      renderResults();
    },
  });

  const chipButtons = STATUSES.map((status) =>
    h(
      'button',
      {
        type: 'button',
        class: 'chip chip--toggle',
        'aria-pressed': String(filters.statuses.includes(status)),
        onClick: (e) => {
          const on = !filters.statuses.includes(status);
          filters.statuses = on ? [...filters.statuses, status] : filters.statuses.filter((s) => s !== status);
          e.currentTarget.setAttribute('aria-pressed', String(on));
          renderResults();
        },
      },
      status,
    ),
  );

  const filterCount = h('span', { class: 'filter-btn__count' });
  const filterBtn = h(
    'button',
    { type: 'button', class: 'btn btn-secondary filter-btn', onClick: openFilterSheet },
    icon('filter', { size: 20 }),
    h('span', {}, 'Filter'),
    filterCount,
  );

  function refreshFilterButton() {
    const n = sheetFilterCount();
    filterCount.textContent = n ? String(n) : '';
    filterCount.hidden = !n;
    filterBtn.setAttribute('aria-label', n ? `Filter dan urutan, ${n} aktif` : 'Filter dan urutan');
  }

  function openFilterSheet() {
    openSheet({
      title: 'Filter & urutan',
      body: (close) => {
        const sumber = h(
          'select',
          {
            id: 'filter-sumber',
            class: 'select',
            onChange: (e) => {
              filters.sumber = e.target.value;
              renderResults();
            },
          },
          h('option', { value: '' }, 'Semua sumber'),
          SOURCES.map((s) => h('option', { value: s, selected: filters.sumber === s }, s)),
        );
        const sortGroup = h(
          'div',
          { class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'urutan-label' },
          SORTS.map((s) =>
            h(
              'button',
              {
                type: 'button',
                role: 'radio',
                class: 'segmented__item',
                'aria-checked': String(filters.sort === s.value),
                onClick: (e) => {
                  filters.sort = s.value;
                  for (const b of sortGroup.children) b.setAttribute('aria-checked', String(b === e.currentTarget));
                  renderResults();
                },
              },
              s.label,
            ),
          ),
        );
        const archived = h('input', {
          type: 'checkbox',
          id: 'tampil-arsip',
          checked: filters.showArchived,
          onChange: (e) => {
            filters.showArchived = e.target.checked;
            renderResults();
          },
        });
        return h(
          'div',
          { class: 'stack sheet-form' },
          h('div', { class: 'field' }, h('span', { id: 'urutan-label', class: 'field-label' }, 'Urutkan'), sortGroup),
          h('div', { class: 'field' }, h('label', { for: 'filter-sumber' }, 'Sumber lowongan'), sumber),
          h('label', { class: 'check', for: 'tampil-arsip' }, archived, h('span', {}, 'Tampilkan yang diarsipkan')),
          h(
            'div',
            { class: 'sheet-actions' },
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-ghost',
                onClick: () => {
                  filters = { ...filters, sumber: '', sort: 'terbaru', showArchived: false };
                  close();
                  renderResults();
                },
              },
              'Atur ulang',
            ),
            h('button', { type: 'button', class: 'btn btn-primary', onClick: close }, 'Lihat hasil'),
          ),
        );
      },
    });
  }

  function resetFilters() {
    filters = { ...DEFAULT_FILTERS };
    search.value = '';
    for (const b of chipButtons) b.setAttribute('aria-pressed', 'false');
    renderResults();
    search.focus();
  }

  function renderResults() {
    refreshFilterButton();
    const all = state.data.lamaran;
    const list = filterLamaran(all, filters);

    if (!all.length) {
      mount(summary);
      mount(
        results,
        h(
          'div',
          { class: 'card empty-state' },
          icon('briefcase', { size: 48 }),
          h('p', {}, 'Belum ada lamaran. Yuk catat lamaran pertamamu!'),
          h('a', { class: 'btn btn-primary', href: '#/lamaran/baru' }, icon('plus', { size: 20 }), 'Tambah lamaran'),
        ),
      );
      return;
    }

    const sortLabel = SORTS.find((s) => s.value === filters.sort)?.label || '';
    mount(
      summary,
      h('p', { class: 'muted small', 'aria-live': 'polite' }, `${list.length} lamaran · ${sortLabel}`),
      hasActiveFilters() && h('button', { type: 'button', class: 'link-btn', onClick: resetFilters }, 'Hapus semua filter'),
    );

    if (!list.length) {
      mount(
        results,
        h(
          'div',
          { class: 'card empty-state' },
          icon('search', { size: 40 }),
          h('p', {}, 'Tidak ada lamaran yang cocok.'),
          hasActiveFilters() && h('button', { type: 'button', class: 'btn btn-secondary', onClick: resetFilters }, 'Hapus filter'),
        ),
      );
      return;
    }

    const now = new Date();
    const due = new Set(currentFollowUps(now).map((r) => r.lamaran.id));
    mount(results, h('ul', { class: 'card-list' }, list.map((l) => h('li', {}, lamaranCard(l, now, due.has(l.id))))));
  }

  layout.show('/lamaran', [
    screenHeader('Lamaran'),
    h(
      'div',
      { class: 'screen-body' },
      h(
        'div',
        { class: 'filters stack' },
        h(
          'div',
          { class: 'search-row' },
          h(
            'div',
            { class: 'search' },
            h('label', { for: 'cari-lamaran', class: 'visually-hidden' }, 'Cari perusahaan atau posisi'),
            h('span', { class: 'search__icon' }, icon('search', { size: 20 })),
            search,
          ),
          filterBtn,
        ),
        h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filter status' }, chipButtons),
      ),
      summary,
      results,
    ),
  ]);
  renderResults();

  // Background syncs refresh only the results, so typing in the search box is not interrupted.
  return { update: renderResults };
}

function lamaranCard(l, now, needsFollowUp) {
  const archived = isTrue(l.diarsipkan);
  return h(
    'a',
    { class: 'card lamaran-card', href: `#/lamaran/detail?id=${encodeURIComponent(l.id)}` },
    h(
      'div',
      { class: 'lamaran-card__main' },
      h('p', { class: 'lamaran-card__company' }, l.perusahaan || '(Tanpa nama)'),
      h('p', { class: 'lamaran-card__role muted clamp-2' }, l.posisi || ''),
      h(
        'p',
        { class: 'lamaran-card__meta small muted' },
        sentLabel(l.tanggal_melamar, now),
        l.sumber && h('span', { 'aria-hidden': 'true' }, '·'),
        l.sumber && h('span', {}, l.sumber),
        archived && h('span', { class: 'tag' }, 'Diarsipkan'),
      ),
    ),
    h(
      'span',
      { class: 'lamaran-card__side' },
      h('span', { class: `badge ${statusBadgeClass(l.status)}` }, l.status || 'Dikirim'),
      needsFollowUp &&
        h(
          'span',
          { class: 'lamaran-card__bell', title: 'Perlu di-follow-up' },
          icon('bell', { size: 18 }),
          h('span', { class: 'visually-hidden' }, 'Perlu di-follow-up'),
        ),
    ),
  );
}
