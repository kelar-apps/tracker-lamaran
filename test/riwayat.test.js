import { describe, expect, it } from 'vitest';
import { createRiwayat, formatDateTime, riwayatTitle, timelineFor, validateNote } from '../src/app/riwayat.js';

describe('riwayat', () => {
  it('createRiwayat fills id and ISO timestamp', () => {
    const now = new Date('2026-11-13T07:05:00.000Z');
    const r = createRiwayat({ lamaranId: 'L1', jenis: 'status', statusBaru: 'Tes' }, { now, id: 'R1' });
    expect(r).toEqual({ id: 'R1', lamaran_id: 'L1', tanggal: '2026-11-13T07:05:00.000Z', jenis: 'status', status_baru: 'Tes', catatan: '' });
  });

  it('timelineFor: one application, newest first', () => {
    const list = [
      { id: '1', lamaran_id: 'A', tanggal: '2026-11-01T10:00:00.000Z' },
      { id: '2', lamaran_id: 'B', tanggal: '2026-11-05T10:00:00.000Z' },
      { id: '3', lamaran_id: 'A', tanggal: '2026-11-09T10:00:00.000Z' },
    ];
    expect(timelineFor(list, 'A').map((r) => r.id)).toEqual(['3', '1']);
  });

  it('titles', () => {
    expect(riwayatTitle({ jenis: 'status', status_baru: 'Interview' })).toBe('Status diubah ke Interview');
    expect(riwayatTitle({ jenis: 'follow_up' })).toBe('Sudah follow-up');
    expect(riwayatTitle({ jenis: 'catatan' })).toBe('Catatan');
    expect(riwayatTitle({ jenis: 'aneh' })).toBe('Catatan');
  });

  it('validateNote', () => {
    expect(validateNote('   ').error).toBe('Catatan belum diisi');
    expect(validateNote('x'.repeat(2001)).error).toMatch(/Maksimal/);
    expect(validateNote('  Sudah dihubungi HR ')).toEqual({ error: '', value: 'Sudah dihubungi HR' });
  });

  it('formatDateTime uses local time', () => {
    expect(formatDateTime(new Date(2026, 10, 13, 14, 5).toISOString())).toBe('13 Nov 2026, 14.05');
    expect(formatDateTime('bukan tanggal')).toBe('');
  });
});
