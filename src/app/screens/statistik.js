// Statistik & Target.
import { h, stepper } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { parseDate } from '../../core/dates.js';
import { screenHeader } from '../layout.js';
import { state, updateSetting } from '../store.js';
import { statusBadgeClass } from '../schema.js';
import { MIN_FOR_STATS, MIN_PER_SOURCE, computeStats } from '../stats.js';
import { TARGET_MAX, TARGET_MIN, countThisWeek, streak, weeklyProgress } from '../target.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function renderStatistik(layout) {
  const now = new Date();
  const stats = computeStats(state.data, now);

  const body =
    stats.total < MIN_FOR_STATS
      ? [notEnough(stats.total)]
      : [summaryTiles(stats), weeklySection(stats.weekly), funnelSection(stats.funnel), sourcesSection(stats.sources)];

  layout.show('/statistik', [
    screenHeader('Statistik'),
    h('div', { class: 'screen-body' }, body, targetSection(now)),
  ]);
}

function notEnough(total) {
  const missing = MIN_FOR_STATS - total;
  return h(
    'section',
    { class: 'card stack' },
    icon('chart', { size: 40 }),
    h('h2', {}, `Tambah ${missing} lamaran lagi untuk melihat statistikmu`),
    h(
      'div',
      {
        class: 'progress',
        role: 'progressbar',
        'aria-label': 'Lamaran tercatat',
        'aria-valuemin': '0',
        'aria-valuemax': String(MIN_FOR_STATS),
        'aria-valuenow': String(total),
      },
      h('span', { class: 'progress__bar', style: `width:${Math.round((total / MIN_FOR_STATS) * 100)}%` }),
    ),
    h('p', { class: 'muted small' }, `${total} dari ${MIN_FOR_STATS} lamaran sudah tercatat.`),
  );
}

const percent = (x) => `${Math.round(x * 100)}%`;
const oneDecimal = (x) => x.toLocaleString('id-ID', { maximumFractionDigits: 1 });

function summaryTiles({ response, reply }) {
  return h(
    'section',
    { class: 'stat-tiles', 'aria-label': 'Ringkasan' },
    h(
      'div',
      { class: 'card stat-tile' },
      h('p', { class: 'stat-tile__label' }, 'Tingkat respons'),
      h('p', { class: 'stat-tile__value' }, percent(response.rate)),
      h('p', { class: 'small muted' }, `${response.responded} dari ${response.counted} lamaran direspons`),
    ),
    h(
      'div',
      { class: 'card stat-tile' },
      h('p', { class: 'stat-tile__label' }, 'Rata-rata waktu balasan'),
      h('p', { class: 'stat-tile__value' }, reply.average == null ? '–' : `${oneDecimal(reply.average)} hari`),
      h('p', { class: 'small muted' }, reply.n ? `Dari ${reply.n} lamaran yang sudah dibalas` : 'Belum ada lamaran yang dibalas'),
    ),
  );
}

function shortDate(ymd) {
  const d = parseDate(ymd);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '';
}

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

/** Bar with 4px rounded top corners, anchored to the baseline. */
function barPath(x, y, w, hgt) {
  const r = Math.min(4, w / 2, hgt);
  return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
}

function weeklySection(weekly) {
  const target = state.settings.target_mingguan;
  const W = 320;
  const H = 180;
  const pad = { top: 20, right: 8, bottom: 26, left: 8 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = Math.max(target, ...weekly.map((w) => w.count), 1);
  const y = (v) => pad.top + plotH - (v / max) * plotH;
  const slot = plotW / weekly.length;
  const barW = Math.min(24, slot - 8);

  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', 'aria-hidden': 'true', focusable: 'false' });
  // Baseline.
  chart.append(svg('line', { x1: pad.left, x2: W - pad.right, y1: pad.top + plotH, y2: pad.top + plotH, class: 'chart__axis' }));

  weekly.forEach((w, i) => {
    const cx = pad.left + slot * i + slot / 2;
    const current = i === weekly.length - 1;
    const group = svg('g', { class: 'chart__bar' });
    group.append(svg('title', {}, `Minggu ${shortDate(w.start)}: ${w.count} lamaran`));
    // Invisible hit area larger than the bar, for hover.
    group.append(svg('rect', { x: cx - slot / 2, y: pad.top, width: slot, height: plotH, fill: 'transparent' }));
    if (w.count > 0) {
      const top = y(w.count);
      group.append(svg('path', { d: barPath(cx - barW / 2, top, barW, pad.top + plotH - top), class: 'chart__fill' }));
    }
    // Selective direct label: only the current week.
    if (current) {
      group.append(svg('text', { x: cx, y: (w.count > 0 ? y(w.count) : pad.top + plotH) - 6, class: 'chart__value', 'text-anchor': 'middle' }, String(w.count)));
    }
    group.append(
      svg('text', { x: cx, y: H - 8, class: current ? 'chart__label chart__label--current' : 'chart__label', 'text-anchor': 'middle' }, current ? 'Ini' : shortDate(w.start)),
    );
    chart.append(group);
  });

  // Target line on top of the bars.
  const ty = y(target);
  chart.append(svg('line', { x1: pad.left, x2: W - pad.right, y1: ty, y2: ty, class: 'chart__target' }));

  const table = h(
    'table',
    { class: 'visually-hidden' },
    h('caption', {}, `Lamaran per minggu, target ${target}`),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Minggu mulai'), h('th', { scope: 'col' }, 'Lamaran'))),
    h('tbody', {}, weekly.map((w) => h('tr', {}, h('td', {}, shortDate(w.start)), h('td', {}, String(w.count))))),
  );

  return h(
    'section',
    { class: 'card stack' },
    h('h2', {}, 'Lamaran per minggu'),
    h('p', { class: 'small muted' }, h('span', { class: 'legend-dash', 'aria-hidden': 'true' }), ` Garis putus-putus = target ${target} lamaran per minggu`),
    chart,
    table,
  );
}

function funnelSection(rows) {
  const top = Math.max(rows[0]?.count || 0, 1);
  return h(
    'section',
    { class: 'card stack' },
    h('h2', {}, 'Funnel status'),
    h('p', { class: 'small muted' }, 'Berapa lamaran yang pernah sampai di tiap tahap.'),
    h(
      'ol',
      { class: 'funnel' },
      rows.map((r) =>
        h(
          'li',
          { class: 'funnel__row' },
          h('span', { class: `badge ${statusBadgeClass(r.status)}` }, r.status),
          h(
            'span',
            { class: 'funnel__track', 'aria-hidden': 'true' },
            h('span', { class: 'funnel__bar', style: `width:${(r.count / top) * 100}%` }),
          ),
          h('span', { class: 'funnel__count' }, String(r.count)),
        ),
      ),
    ),
  );
}

function sourcesSection(sources) {
  return h(
    'section',
    { class: 'card stack' },
    h('h2', {}, 'Sumber terbaik'),
    sources.length
      ? h(
          'table',
          { class: 'table' },
          h(
            'thead',
            {},
            h('tr', {}, h('th', { scope: 'col' }, 'Sumber'), h('th', { scope: 'col', class: 'num' }, 'Lamaran'), h('th', { scope: 'col', class: 'num' }, 'Respons')),
          ),
          h(
            'tbody',
            {},
            sources.map((s) =>
              h('tr', {}, h('td', {}, s.sumber), h('td', { class: 'num' }, String(s.total)), h('td', { class: 'num' }, percent(s.rate))),
            ),
          ),
        )
      : h('p', { class: 'muted small' }, `Belum ada sumber dengan minimal ${MIN_PER_SOURCE} lamaran.`),
  );
}

function targetSection(now) {
  const target = state.settings.target_mingguan;
  const count = countThisWeek(state.data.lamaran, now);
  const { message } = weeklyProgress(count, target);
  const weeks = streak(state.data.lamaran, target, now);
  return h(
    'section',
    { class: 'card stack' },
    h('h2', {}, 'Target'),
    stepper({
      id: 'target-mingguan',
      label: 'Target mingguan',
      value: target,
      min: TARGET_MIN,
      max: TARGET_MAX,
      unit: 'lamaran',
      onChange: (v) => updateSetting('target_mingguan', v),
    }),
    h('p', {}, `Minggu ini: ${count} dari ${target} lamaran. ${message}`),
    h(
      'p',
      { class: 'streak' },
      h('span', { class: 'streak__icon' }, icon('check', { size: 18 })),
      weeks ? `Streak ${weeks} minggu berturut-turut mencapai target` : 'Belum ada streak. Capai target minggu ini untuk memulai!',
    ),
  );
}
