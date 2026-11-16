import { describe, expect, it } from 'vitest';
import { followUpFor, followUpMessage, followUps, greetingName, reminderReason } from '../src/app/followup.js';

// Friday 13 Nov 2026, 10:00 local.
const NOW = new Date(2026, 10, 13, 10, 0);
const iso = (y, m, d, h = 10) => new Date(y, m - 1, d, h).toISOString(); // local datetime -> ISO

const L = (over = {}) => ({
  id: 'L1',
  perusahaan: 'PT Maju',
  posisi: 'Staf Admin',
  status: 'Dikirim',
  tanggal_melamar: '2026-11-06',
  terakhir_follow_up: '',
  diarsipkan: false,
  kontak_hr: '',
  ...over,
});
const opts = (over = {}) => ({ riwayat: [], jadwal: [], hariFollowUp: 7, now: NOW, ...over });

describe('followUpFor — Dikirim / Diproses', () => {
  it('due exactly hari_follow_up days after applying', () => {
    const r = followUpFor(L(), opts());
    expect(r).toMatchObject({ days: 7, anchor: '2026-11-06', anchorKind: 'melamar', jadwal: null });
  });

  it('not due one day earlier', () => {
    expect(followUpFor(L({ tanggal_melamar: '2026-11-07' }), opts())).toBeNull();
  });

  it('counts from the latest status change in Riwayat', () => {
    const riwayat = [{ lamaran_id: 'L1', jenis: 'status', status_baru: 'Diproses', tanggal: iso(2026, 11, 10) }];
    expect(followUpFor(L({ status: 'Diproses' }), opts({ riwayat }))).toBeNull();
    const r = followUpFor(L({ status: 'Diproses', tanggal_melamar: '2026-10-01' }), opts({ riwayat, now: new Date(2026, 10, 17) }));
    expect(r).toMatchObject({ days: 7, anchorKind: 'status' });
  });

  it('counts from the last follow-up (column or Riwayat row)', () => {
    expect(followUpFor(L({ tanggal_melamar: '2026-10-01', terakhir_follow_up: '2026-11-10' }), opts())).toBeNull();
    const riwayat = [{ lamaran_id: 'L1', jenis: 'follow_up', tanggal: iso(2026, 11, 12) }];
    expect(followUpFor(L({ tanggal_melamar: '2026-10-01' }), opts({ riwayat }))).toBeNull();
  });

  it('ignores other applications and notes', () => {
    const riwayat = [
      { lamaran_id: 'L2', jenis: 'status', tanggal: iso(2026, 11, 12) },
      { lamaran_id: 'L1', jenis: 'catatan', tanggal: iso(2026, 11, 12) },
    ];
    expect(followUpFor(L(), opts({ riwayat }))).not.toBeNull();
  });

  it('respects the hari_follow_up setting', () => {
    expect(followUpFor(L({ tanggal_melamar: '2026-11-10' }), opts({ hariFollowUp: 3 }))).not.toBeNull();
    expect(followUpFor(L(), opts({ hariFollowUp: 14 }))).toBeNull();
  });
});

describe('followUpFor — Tes / Interview', () => {
  const jadwal = (tanggal, jenis = 'Interview HR', lamaran_id = 'L1') => ({ id: tanggal, lamaran_id, jenis, tanggal });

  it('due >= N days after the last schedule, using that schedule', () => {
    const r = followUpFor(L({ status: 'Interview', tanggal_melamar: '2026-10-01' }), opts({ jadwal: [jadwal('2026-10-20', 'Psikotes'), jadwal('2026-11-06')] }));
    expect(r).toMatchObject({ days: 7, anchorKind: 'jadwal' });
    expect(r.jadwal.tanggal).toBe('2026-11-06');
  });

  it('not due while the last schedule is in the future', () => {
    expect(followUpFor(L({ status: 'Tes', tanggal_melamar: '2026-10-01' }), opts({ jadwal: [jadwal('2026-10-05'), jadwal('2026-11-20')] }))).toBeNull();
  });

  it('not due when the status changed after the schedule', () => {
    const riwayat = [{ lamaran_id: 'L1', jenis: 'status', tanggal: iso(2026, 11, 10) }];
    expect(followUpFor(L({ status: 'Interview', tanggal_melamar: '2026-10-01' }), opts({ riwayat, jadwal: [jadwal('2026-11-01')] }))).toBeNull();
  });

  it('not due when followed up after the schedule', () => {
    const l = L({ status: 'Interview', tanggal_melamar: '2026-10-01', terakhir_follow_up: '2026-11-09' });
    expect(followUpFor(l, opts({ jadwal: [jadwal('2026-11-01')] }))).toBeNull();
  });

  it('without schedules works like Dikirim', () => {
    expect(followUpFor(L({ status: 'Tes' }), opts())).toMatchObject({ anchorKind: 'melamar', jadwal: null });
  });
});

describe('followUpFor — never', () => {
  for (const status of ['Offering', 'Diterima', 'Ditolak', 'Mundur']) {
    it(status, () => {
      expect(followUpFor(L({ status, tanggal_melamar: '2026-01-01' }), opts())).toBeNull();
    });
  }
  it('archived', () => {
    expect(followUpFor(L({ diarsipkan: true, tanggal_melamar: '2026-01-01' }), opts())).toBeNull();
    expect(followUpFor(L({ diarsipkan: 'TRUE', tanggal_melamar: '2026-01-01' }), opts())).toBeNull();
  });
  it('no valid date at all', () => {
    expect(followUpFor(L({ tanggal_melamar: '' }), opts())).toBeNull();
  });
});

describe('followUps list', () => {
  it('most overdue first', () => {
    const list = followUps({
      lamaran: [L({ id: 'a', tanggal_melamar: '2026-11-05' }), L({ id: 'b', tanggal_melamar: '2026-10-01' }), L({ id: 'c', tanggal_melamar: '2026-11-12' })],
      now: NOW,
    });
    expect(list.map((r) => r.lamaran.id)).toEqual(['b', 'a']);
  });

  it('reminderReason', () => {
    expect(reminderReason({ days: 9, anchorKind: 'melamar' })).toBe('9 hari sejak lamaran dikirim');
    expect(reminderReason({ days: 7, anchorKind: 'jadwal', jadwal: { jenis: 'Psikotes' } })).toBe('7 hari sejak Psikotes');
  });
});

describe('messages', () => {
  it('greetingName picks a name from free text', () => {
    expect(greetingName('')).toBe('Tim Rekrutmen');
    expect(greetingName('Bu Rina — rina@maju.co.id')).toBe('Rina');
    expect(greetingName('Pak Budi Santoso, 0812-3456-7890')).toBe('Budi Santoso');
    expect(greetingName('hr@maju.co.id')).toBe('Tim Rekrutmen');
    expect(greetingName('081234567890')).toBe('Tim Rekrutmen');
    expect(greetingName('Sinta (HR)')).toBe('Sinta');
    expect(greetingName('Anna-Maria')).toBe('Anna-Maria');
  });

  it('template after applying', () => {
    const msg = followUpMessage({ lamaran: L({ kontak_hr: 'Bu Rina' }), jadwal: null }, 'Sari Dewi');
    expect(msg).toBe(
      'Selamat siang Bapak/Ibu Rina, saya Sari Dewi, pelamar posisi Staf Admin yang mengirim lamaran pada 6 November 2026. ' +
        'Saya ingin menanyakan perkembangan proses seleksinya. Terima kasih atas waktunya.',
    );
  });

  it('template after a test/interview', () => {
    const msg = followUpMessage(
      { lamaran: L({ status: 'Interview' }), jadwal: { jenis: 'Interview User', tanggal: '2026-11-03' } },
      'Sari Dewi',
    );
    expect(msg).toBe(
      'Selamat siang Bapak/Ibu Tim Rekrutmen, saya Sari Dewi, kandidat posisi Staf Admin yang mengikuti Interview User pada 3 November 2026. ' +
        'Saya ingin menanyakan perkembangan proses seleksi selanjutnya. Terima kasih.',
    );
  });

  it('placeholder when the name is unknown', () => {
    expect(followUpMessage({ lamaran: L() }, '')).toContain('saya [nama kamu],');
  });
});
