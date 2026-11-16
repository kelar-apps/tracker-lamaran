// User actions shared by several screens.
import { h, openSheet, toast } from '../core/ui.js';
import { today } from '../core/dates.js';
import { hasSession, state, updateLamaranRow } from './store.js';
import { updateLamaran } from './lamaran.js';
import { createRiwayat } from './riwayat.js';
import { followUpMessage } from './followup.js';

/**
 * Success toast for a write. When it runs right away the toast is shown at once
 * (optimistic). When Google login is needed first, it waits for the result, so the
 * user never sees "tersimpan" followed by "gagal".
 */
export function announce(promise, message) {
  if (hasSession()) toast(message);
  else promise.then((ok) => ok && toast(message));
  return promise;
}

/** Record "Sudah follow-up". Call from a tap (may open the Google popup). */
export function markFollowUp(lamaran) {
  announce(
    updateLamaranRow(updateLamaran(lamaran, { terakhir_follow_up: today() }), [
      createRiwayat({ lamaranId: lamaran.id, jenis: 'follow_up' }),
    ]),
    'Follow-up dicatat',
  );
}

/** The name used in follow-up messages. */
function senderName() {
  return state.user?.fullName || state.settings.nama_panggilan || state.user?.name || '';
}

/** Copy the follow-up message for a reminder. Shows it in a sheet if copying is blocked. */
export async function copyFollowUpMessage(reminder) {
  const text = followUpMessage(reminder, senderName());
  try {
    await navigator.clipboard.writeText(text);
    toast('Pesan follow-up disalin');
  } catch {
    showTextToCopy(text);
  }
}

function showTextToCopy(text) {
  openSheet({
    title: 'Salin pesan follow-up',
    body: () => {
      const area = h('textarea', { id: 'pesan-follow-up', class: 'textarea', readonly: true, rows: 7 }, text);
      setTimeout(() => {
        area.focus();
        area.select();
      }, 50);
      return h(
        'div',
        { class: 'field' },
        h('label', { for: 'pesan-follow-up' }, 'Tekan lama teks di bawah, lalu pilih Salin.'),
        area,
      );
    },
  });
}
