// Beranda (dashboard): greeting, weekly target, status summary, follow-ups and
// upcoming schedules.
import { h } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { screenHeader } from '../layout.js';
import { state } from '../store.js';
import { STATUS_FLOW, statusBadgeClass } from '../schema.js';
import { isTrue } from '../lamaran.js';
import { countThisWeek, weeklyProgress } from '../target.js';
import { relativeDayLabel, timeRangeLabel, upcomingJadwal } from '../jadwal.js';
import { currentFollowUps, reminderCard } from './follow-up.js';
import { installBanner, maybeShowIosInstallSheet } from '../install.js';

/** Statuses shown as summary cards (Diterima has its own moment, not a pipeline count). */
const SUMMARY = STATUS_FLOW.filter((s) => s !== 'Diterima');

export function renderBeranda(layout) {
  const name = state.settings.nama_panggilan || state.user?.name || '';
  const settingsBtn = h('a', { href: '#/pengaturan', class: 'icon-btn', 'aria-label': 'Pengaturan' }, icon('settings'));
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
  const header = screenHeader(name ? `Halo, ${name}!` : 'Halo!', { brand: true, actions: [settingsBtn], subtitle: today });

  const { lamaran } = state.data;
  maybeShowIosInstallSheet();
  if (!lamaran.length) {
    layout.show('/beranda', [
      header,
      h(
        'div',
        { class: 'screen-body' },
        installBanner(),
        h(
          'div',
          { class: 'card empty-state' },
          icon('briefcase', { size: 56 }),
          h('h2', {}, 'Belum ada lamaran'),
          h('p', {}, 'Yuk catat lamaran pertamamu!'),
          h('a', { class: 'btn btn-primary', href: '#/lamaran/baru' }, icon('plus', { size: 20 }), 'Tambah lamaran'),
        ),
      ),
    ]);
    return;
  }

  const now = new Date();
  layout.show('/beranda', [
    header,
    h('div', { class: 'screen-body' }, installBanner(), targetCard(now), statusSummary(), followUpSection(now), upcomingSection(now)),
  ]);
}

function targetCard(now) {
  const count = countThisWeek(state.data.lamaran, now);
  const { ratio, message, goal } = weeklyProgress(count, state.settings.target_mingguan);
  const percent = Math.round(ratio * 100);
  return h(
    'section',
    { class: 'card stack target' },
    h('h2', {}, 'Target minggu ini'),
    h('p', { class: 'target__count' }, h('strong', {}, String(count)), ` dari ${goal} lamaran`),
    h(
      'div',
      {
        class: 'progress',
        role: 'progressbar',
        'aria-label': 'Progres target minggu ini',
        'aria-valuemin': '0',
        'aria-valuemax': String(goal),
        'aria-valuenow': String(Math.min(count, goal)),
      },
      h('span', { class: 'progress__bar', style: `width:${percent}%` }),
    ),
    h('p', { class: 'muted small' }, message),
  );
}

function statusSummary() {
  const active = state.data.lamaran.filter((l) => !isTrue(l.diarsipkan));
  const counts = Object.fromEntries(SUMMARY.map((s) => [s, 0]));
  for (const l of active) if (l.status in counts) counts[l.status]++;
  return h(
    'section',
    { class: 'stack', 'aria-labelledby': 'ringkasan-status' },
    h('h2', { id: 'ringkasan-status' }, 'Ringkasan status'),
    h(
      'ul',
      { class: 'status-grid' },
      SUMMARY.map((s) =>
        h(
          'li',
          {},
          h(
            'a',
            {
              class: 'card status-tile',
              href: `#/lamaran?status=${encodeURIComponent(s)}`,
              'aria-label': `${s}: ${counts[s]} lamaran. Lihat daftarnya`,
            },
            h('span', { class: 'status-tile__count' }, String(counts[s])),
            h('span', { class: `badge ${statusBadgeClass(s)}` }, s),
          ),
        ),
      ),
      // Sixth tile: every active application (completes the 3×2 grid).
      h(
        'li',
        {},
        h(
          'a',
          { class: 'card status-tile status-tile--all', href: '#/lamaran?status=', 'aria-label': `Semua aktif: ${active.length} lamaran. Lihat daftarnya` },
          h('span', { class: 'status-tile__count' }, String(active.length)),
          h('span', { class: 'status-tile__label' }, 'Semua aktif', icon('chevronRight', { size: 16 })),
        ),
      ),
    ),
  );
}

function followUpSection(now) {
  const list = currentFollowUps(now);
  return h(
    'section',
    { class: 'stack', 'aria-labelledby': 'perlu-follow-up' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { id: 'perlu-follow-up' }, 'Perlu di-follow-up'),
      list.length > 3 && h('a', { class: 'btn btn-ghost btn-sm', href: '#/follow-up' }, `Lihat semua (${list.length})`),
    ),
    list.length
      ? list.slice(0, 3).map(reminderCard)
      : h('p', { class: 'muted small' }, 'Belum ada yang perlu di-follow-up. Mantap!'),
  );
}

function upcomingSection(now) {
  const byId = new Map(state.data.lamaran.map((l) => [l.id, l]));
  const list = upcomingJadwal(state.data.jadwal, now, 7).slice(0, 2);
  return h(
    'section',
    { class: 'stack', 'aria-labelledby': 'jadwal-terdekat' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { id: 'jadwal-terdekat' }, 'Jadwal terdekat'),
      h('a', { class: 'btn btn-ghost btn-sm', href: '#/jadwal' }, 'Lihat semua'),
    ),
    list.length
      ? h(
          'ul',
          { class: 'card-list' },
          list.map((j) => {
            const l = byId.get(j.lamaran_id);
            return h(
              'li',
              {},
              h(
                'a',
                { class: 'card upcoming', href: l ? `#/lamaran/detail?id=${encodeURIComponent(l.id)}` : '#/jadwal' },
                h('span', { class: 'upcoming__icon' }, icon('calendar', { size: 22 })),
                h(
                  'span',
                  { class: 'upcoming__text' },
                  h('span', { class: 'upcoming__when small' }, [relativeDayLabel(j.tanggal, now), timeRangeLabel(j)].filter(Boolean).join(' · ')),
                  h('span', { class: 'upcoming__title' }, j.jenis || 'Jadwal'),
                  l && h('span', { class: 'small muted clamp-1' }, [l.perusahaan, l.posisi].filter(Boolean).join(' · ')),
                ),
                icon('chevronRight', { size: 20 }),
              ),
            );
          }),
        )
      : h('p', { class: 'muted small' }, 'Tidak ada jadwal dalam 7 hari ke depan.'),
  );
}
