import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shouldRemind } from '../src/core/remind.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 13);

describe('shouldRemind (iOS install sheet: at most once per 3 days)', () => {
  it('first time', () => {
    expect(shouldRemind(null, NOW)).toBe(true);
    expect(shouldRemind(0, NOW)).toBe(true);
    expect(shouldRemind('abc', NOW)).toBe(true);
  });
  it('not again within 3 days', () => {
    expect(shouldRemind(NOW - 2 * DAY, NOW)).toBe(false);
    expect(shouldRemind(String(NOW - 3 * DAY + 1), NOW)).toBe(false);
  });
  it('again after 3 days', () => {
    expect(shouldRemind(NOW - 3 * DAY, NOW)).toBe(true);
  });
  it('custom interval (Android "Nanti" = 7 days)', () => {
    expect(shouldRemind(NOW - 5 * DAY, NOW, 7 * DAY)).toBe(false);
    expect(shouldRemind(NOW - 7 * DAY, NOW, 7 * DAY)).toBe(true);
  });
  it('a timestamp in the future (clock changed) allows it', () => {
    expect(shouldRemind(NOW + DAY, NOW)).toBe(true);
  });
});

// Checks the real build output when it exists (run `npm run build` first).
const dist = (f) => new URL(`../dist/${f}`, import.meta.url);
describe.runIf(existsSync(dist('sw.js')))('build output', () => {
  it('manifest matches the prompt', () => {
    const m = JSON.parse(readFileSync(dist('manifest.webmanifest'), 'utf8'));
    expect(m).toMatchObject({
      name: 'Kelar — Tracker Lamaran',
      short_name: 'Kelar Lamaran',
      display: 'standalone',
      theme_color: '#3D5BF0',
      background_color: '#F8F7FB',
    });
    const sizes = m.icons.map((i) => `${i.sizes} ${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '192x192 maskable', '512x512 maskable']));
    for (const icon of m.icons) expect(existsSync(dist(icon.src))).toBe(true);
  });

  it('service worker never caches Google requests', () => {
    const sw = readFileSync(dist('sw.js'), 'utf8');
    for (const host of ['googleapis.com', 'accounts.google.com', 'script.google.com', 'gstatic.com']) {
      expect(sw).not.toContain(host);
    }
    // Only the navigation fallback route; no runtime caching routes.
    expect(sw.match(/registerRoute\(/g)).toHaveLength(1);
  });

  it('fonts are bundled, not loaded from Google Fonts', () => {
    const html = readFileSync(dist('index.html'), 'utf8');
    expect(html).not.toContain('fonts.googleapis.com');
  });
});
