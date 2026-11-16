// Checks that theme colors meet WCAG AA (4.5:1) for normal text.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STATUSES, statusBadgeClass } from '../src/app/schema.js';

const css = readFileSync(new URL('../src/core/theme.css', import.meta.url), 'utf8');

function token(name) {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`Token --${name} not found`);
  return m[1];
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('status badge contrast', () => {
  for (const status of STATUSES) {
    it(`${status} badge text is >= 4.5:1`, () => {
      const key = status.toLowerCase();
      expect(contrast(token(`status-${key}-fg`), token(`status-${key}-bg`))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('every status has a badge class defined in theme.css', () => {
    for (const status of STATUSES) {
      expect(css).toContain(`.${statusBadgeClass(status)}`);
    }
  });
});

describe('base text contrast', () => {
  it('text on background', () => {
    expect(contrast(token('color-text'), token('color-bg'))).toBeGreaterThanOrEqual(4.5);
  });
  it('muted text on background and on cards', () => {
    expect(contrast(token('color-text-muted'), token('color-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('color-text-muted'), token('color-surface'))).toBeGreaterThanOrEqual(4.5);
  });
  it('primary color as link/button text on white', () => {
    expect(contrast(token('color-primary'), token('color-surface'))).toBeGreaterThanOrEqual(4.5);
  });
  it('white text on every stop of the button gradient', () => {
    const stops = /--gradient-button:[^;]+/.exec(css)[0].match(/#[0-9a-fA-F]{6}/g);
    for (const stop of stops) expect(contrast('#ffffff', stop)).toBeGreaterThanOrEqual(4.5);
  });
  it('white text on danger button, chip and toggle chip', () => {
    expect(contrast('#ffffff', token('color-danger'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', token('color-primary'))).toBeGreaterThanOrEqual(4.5);
  });
  it('danger text on cards (delete menu item, field errors)', () => {
    expect(contrast(token('color-danger'), token('color-surface'))).toBeGreaterThanOrEqual(4.5);
  });
  it('primary text on the page background (done schedule card)', () => {
    expect(contrast(token('color-primary'), token('color-bg'))).toBeGreaterThanOrEqual(4.5);
  });
  it('white text on navy (offline banner, toast)', () => {
    expect(contrast('#ffffff', token('color-text'))).toBeGreaterThanOrEqual(4.5);
  });
});
