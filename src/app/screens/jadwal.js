// Tab Jadwal: all schedules grouped into Hari ini, Minggu ini, Nanti, Sudah lewat.
import { h } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { screenHeader } from '../layout.js';
import { state } from '../store.js';
import { groupJadwal } from '../jadwal.js';
import { jadwalCard } from './jadwal-item.js';

export function renderJadwal(layout) {
  const lamaranById = new Map(state.data.lamaran.map((l) => [l.id, l]));
  const groups = groupJadwal(state.data.jadwal);

  const body = groups.length
    ? groups.map((g) =>
        h(
          'section',
          { class: 'stack', 'aria-labelledby': `grup-${g.key}` },
          h('h2', { id: `grup-${g.key}`, class: 'group-title' }, g.title, h('span', { class: 'muted small' }, ` (${g.items.length})`)),
          g.items.map((j) => jadwalCard(j, lamaranById.get(j.lamaran_id) || null)),
        ),
      )
    : h(
        'div',
        { class: 'card empty-state' },
        icon('calendar', { size: 48 }),
        h('p', {}, 'Belum ada jadwal interview atau tes.'),
        h('p', { class: 'small' }, 'Tambahkan dari halaman detail lamaran, lewat tombol "Tambah jadwal".'),
        h('a', { class: 'btn btn-secondary', href: '#/lamaran' }, 'Lihat lamaran'),
      );

  layout.show('/jadwal', [screenHeader('Jadwal'), h('div', { class: 'screen-body' }, body)]);
}
