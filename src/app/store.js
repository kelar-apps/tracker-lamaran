// App state, local cache and sync with the user's spreadsheet.
//
// Startup flow (see prompt section 6):
//  1. bootFromCache(): if a cache exists, the app renders immediately in read mode.
//  2. GIS loads in the background; no token yet -> header shows "Ketuk untuk sinkronkan".
//  3. connect() runs from a tap (first write or the sync chip): gets a token, finds or
//     creates the spreadsheet, repairs its structure, then loads all data.

import { AuthError, ensureToken, fetchUserInfo, invalidateToken, getValidToken, signOut as authSignOut, tokenExpiresIn } from '../core/auth.js';
import {
  ApiError,
  appendRows,
  createSpreadsheet,
  deleteRows,
  ensureStructure,
  findRowNumbers,
  findSpreadsheet,
  getSheetIds,
  objectToRow,
  readColumns,
  readHeaderRows,
  readSheets,
  rowRange,
  rowsToObjects,
  updateRanges,
} from '../core/sheets.js';
import { toast } from '../core/ui.js';
import { LicenseError, clearLicense, licenseStatus, readLicense, saveLicense, verifyLicense } from '../core/license.js';
import { LICENSE_URL, PRODUCT_ID } from '../../config.js';
import { APP_PROPERTY, DEFAULT_SETTINGS, SHEETS, SPREADSHEET_TITLE } from './schema.js';

const CACHE_KEY = 'kelar.tracker.cache';
const SPREADSHEET_ID_KEY = 'kelar.tracker.spreadsheetId';
const CACHE_VERSION = 1;

const SHEET_NAMES = Object.keys(SHEETS);

const listeners = new Set();

export const state = {
  /**
   * 'onboarding' (no cache) | 'ready' (data available, maybe from cache)
   * | 'locked' (license not confirmed; see `license`)
   */
  phase: 'onboarding',
  /**
   * Why the app is locked: { status: 'recheck' | 'denied' | 'error', email, code? }
   * recheck = the 7-day license cache ran out; denied = not a buyer; error = could not check.
   */
  license: null,
  /** true while a valid access token is in memory */
  connected: false,
  syncing: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  user: null, // { name, fullName, email, picture }
  spreadsheetId: '',
  headers: {}, // sheet name -> header row
  settings: { ...DEFAULT_SETTINGS },
  data: { lamaran: [], riwayat: [], jadwal: [] },
  syncedAt: null,
  /** last error code shown to the user, or null */
  error: null,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

// ---------- Local storage (wrapped: may throw in private mode) ----------

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked: the app still works online */
  }
}

/** Parse and validate the cache blob; returns null when unusable. */
export function parseCache(raw) {
  if (!raw) return null;
  let cache;
  try {
    cache = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!cache || cache.version !== CACHE_VERSION || !cache.user?.email || !cache.spreadsheetId) return null;
  return cache;
}

function saveCache() {
  const { user, spreadsheetId, headers, settings, data, syncedAt } = state;
  storageSet(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, user, spreadsheetId, headers, settings, data, syncedAt }));
  storageSet(SPREADSHEET_ID_KEY, spreadsheetId);
}

function clearCache() {
  storageSet(CACHE_KEY, null);
  storageSet(SPREADSHEET_ID_KEY, null);
}

// ---------- Settings ----------

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Pengaturan rows [{ key, value }] -> typed settings with defaults and limits. */
export function parseSettings(rows) {
  const map = Object.fromEntries((rows || []).map((r) => [String(r.key).trim(), r.value]));
  return {
    target_mingguan: clampInt(map.target_mingguan, 1, 50, DEFAULT_SETTINGS.target_mingguan),
    hari_follow_up: clampInt(map.hari_follow_up, 3, 30, DEFAULT_SETTINGS.hari_follow_up),
    nama_panggilan: String(map.nama_panggilan ?? '').trim().slice(0, 40),
  };
}

/** Setting keys that are missing from the sheet and need a default row. */
export function missingSettingKeys(rows) {
  const present = new Set((rows || []).map((r) => String(r.key).trim()));
  return Object.keys(DEFAULT_SETTINGS).filter((k) => !present.has(k));
}

// ---------- Startup ----------

/** Render from cache if possible. Returns true when cached data was loaded. */
export function bootFromCache() {
  const cache = parseCache(storageGet(CACHE_KEY));
  if (!cache) return false;
  // The app opens from cache only while the license cache (7 days) is still valid.
  const status = licenseStatus(readLicense(PRODUCT_ID), { email: cache.user.email });
  const licensed = !licenseRequired() || status === 'valid' || status === 'stale';
  set({
    phase: licensed ? 'ready' : 'locked',
    license: licensed ? null : { status: 'recheck', email: cache.user.email },
    user: cache.user,
    spreadsheetId: cache.spreadsheetId,
    headers: cache.headers || {},
    settings: { ...DEFAULT_SETTINGS, ...cache.settings },
    data: { lamaran: [], riwayat: [], jadwal: [], ...cache.data },
    syncedAt: cache.syncedAt || null,
  });
  return true;
}

export function watchOnline() {
  window.addEventListener('online', () => set({ online: true }));
  window.addEventListener('offline', () => set({ online: false }));
}

/** Refresh in the background when the user comes back to the app (no popup). */
const RESYNC_AFTER_MS = 2 * 60 * 1000;
export function watchVisibility() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || state.phase !== 'ready') return;
    // The token may have expired while the app was in the background.
    if (state.connected && !getValidToken()) set({ connected: false });
    const last = Date.parse(state.syncedAt || '') || 0;
    if (Date.now() - last > RESYNC_AFTER_MS) sync();
  });
}

let expiryTimer = null;
/** Mark the session as disconnected when the token expires, so the sync chip shows again. */
function watchTokenExpiry() {
  clearTimeout(expiryTimer);
  const ms = tokenExpiresIn();
  if (ms > 0) expiryTimer = setTimeout(() => set({ connected: Boolean(getValidToken()) }), ms + 1000);
}

/** true when a write can run right now without opening the Google popup. */
export function hasSession() {
  return Boolean(getValidToken());
}

// ---------- Connect & sync ----------

/**
 * Get a token and sync everything. MUST be called directly from a click handler:
 * the Google popup is opened synchronously before the first await.
 */
export function connect() {
  const tokenPromise = ensureToken({ hint: state.user?.email });
  set({ syncing: true, error: null });
  return finishConnect(tokenPromise);
}

/**
 * "Ganti akun Google": forget this account locally, then open Google's account
 * chooser. MUST be called directly from a click handler.
 */
export function switchAccount() {
  resetLocal();
  const tokenPromise = ensureToken({ selectAccount: true });
  set({ syncing: true, error: null });
  return finishConnect(tokenPromise);
}

// ---------- License ----------

/**
 * In development the license check is skipped while VITE_LICENSE_URL is empty, so
 * the app can be tried before the Apps Script is deployed. A production build
 * always requires it.
 */
export function licenseRequired() {
  return Boolean(LICENSE_URL) || !import.meta.env.DEV;
}

function lock(status, email, code) {
  set({ phase: 'locked', license: { status, email, code } });
}

/**
 * Make sure this account may use the app. Blocks only when there is no usable
 * cache; a cache older than 1 day is re-checked in the background.
 * @returns {Promise<boolean>} false = the app is now locked
 */
async function ensureLicense(accessToken, email) {
  if (!licenseRequired()) return true;
  const status = licenseStatus(readLicense(PRODUCT_ID), { email });
  if (status === 'valid') return true;
  if (status === 'stale') {
    checkLicense(accessToken, email).catch(() => {}); // keep using the app if this fails
    return true;
  }
  try {
    return await checkLicense(accessToken, email);
  } catch (err) {
    console.warn('[kelar] license check failed', err?.code || err);
    lock('error', email, err instanceof LicenseError ? err.code : 'network');
    return false;
  }
}

/** Ask the server; cache a yes, lock on a no. Throws LicenseError when it cannot tell. */
async function checkLicense(accessToken, email) {
  const result = await verifyLicense({ url: LICENSE_URL, accessToken, product: PRODUCT_ID });
  if (result.allowed) {
    saveLicense(PRODUCT_ID, email);
    return true;
  }
  clearLicense(PRODUCT_ID);
  lock('denied', result.email || email);
  return false;
}

async function finishConnect(tokenPromise) {
  try {
    const accessToken = await tokenPromise;
    set({ connected: true });
    watchTokenExpiry();
    const user = await fetchUserInfo(accessToken);

    if (state.user && state.user.email !== user.email) {
      // Different Google account: never mix data between accounts.
      clearCache();
      set({ data: { lamaran: [], riwayat: [], jadwal: [] }, settings: { ...DEFAULT_SETTINGS }, spreadsheetId: '' });
    }
    set({ user });

    // License first: nothing is created in the user's Drive for a locked account.
    if (!(await ensureLicense(accessToken, user.email))) return false;

    let file = await findSpreadsheet(accessToken, APP_PROPERTY);
    let fresh = false;
    if (!file) {
      file = await createSpreadsheet(accessToken, { title: SPREADSHEET_TITLE, appProperty: APP_PROPERTY });
      fresh = true;
    }
    const headers = await ensureStructure(accessToken, file.id, SHEETS, { fresh });
    if (file.id !== state.spreadsheetId) sheetIds = null;
    set({ spreadsheetId: file.id, headers });
    structureReady = true;
    sessionToken = accessToken;

    await loadAll(accessToken);
    set({ phase: 'ready', license: null });
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    set({ syncing: false });
  }
}

/** Re-read all sheets in the background. No popup; does nothing without a token. */
export async function sync() {
  const accessToken = getValidToken();
  if (!accessToken || !state.spreadsheetId || state.syncing || !state.online) return false;
  set({ syncing: true, error: null });
  try {
    await loadAll(accessToken);
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    set({ syncing: false });
  }
}

async function loadAll(accessToken) {
  const seq = writeSeq;
  const raw = await readSheets(accessToken, state.spreadsheetId, SHEET_NAMES);
  const settingRows = rowsToObjects(raw.Pengaturan, { keyColumn: 'key' });

  const missing = missingSettingKeys(settingRows);
  if (missing.length) {
    await appendRows(
      accessToken,
      state.spreadsheetId,
      'Pengaturan',
      missing.map((k) => [k, DEFAULT_SETTINGS[k]]),
    );
  }

  // A local change started while we were reading: keep the optimistic data.
  // The sync that runs after that write finishes brings everything up to date.
  if (pendingWrites > 0 || seq !== writeSeq) return;

  set({
    settings: parseSettings(settingRows),
    data: {
      lamaran: rowsToObjects(raw.Lamaran, { keyColumn: 'id' }),
      riwayat: rowsToObjects(raw.Riwayat, { keyColumn: 'id' }),
      jadwal: rowsToObjects(raw.Jadwal, { keyColumn: 'id' }),
    },
    syncedAt: new Date().toISOString(),
  });
  saveCache();
}

function handleError(err) {
  let code = 'failed';
  if (err instanceof AuthError) {
    code = err.code;
  } else if (err instanceof ApiError) {
    if (err.status === 401) {
      invalidateToken();
      code = 'expired';
    } else if (err.status === 0) code = 'network';
    else if (err.status === 403) code = 'forbidden';
  }
  if (code === 'expired' || code === 'popup_closed' || code === 'popup_blocked' || code === 'scope_denied') {
    set({ connected: Boolean(getValidToken()) });
  }
  console.warn('[kelar] sync error', code, err);
  set({ error: code });
}

// ---------- Writes (optimistic) ----------
//
// Every write follows the same steps:
//  1. ensureToken() runs synchronously inside the tap (may open the Google popup).
//  2. The change is applied to local state right away (optimistic UI).
//  3. Writes run one after another. Each one re-reads the header row and the id
//     column from the Sheet right before writing, so row numbers are never stale.
//  4. On failure the change is reverted and a toast is shown.
//  5. After the last pending write, a background sync refreshes everything.

const WRITE_FAILED = 'Gagal menyimpan, coba lagi';

class WriteError extends Error {
  /** @param {'not_found'|'account_mismatch'|'stale'|'locked'} code */
  constructor(code) {
    super(code);
    this.name = 'WriteError';
    this.code = code;
  }
}

let writeSeq = 0;
let pendingWrites = 0;
let queue = Promise.resolve();
let sessionToken = null; // token whose account and spreadsheet were verified
let structureReady = false; // ensureStructure ran in this session
let sheetIds = null; // sheet title -> sheetId, for deleteDimension

/** true when writes are possible right now (online, signed in once). */
export function canWrite() {
  return state.online && state.phase === 'ready' && Boolean(state.spreadsheetId);
}

/**
 * First write after opening the app from cache: confirm the account and the
 * spreadsheet before touching anything.
 */
async function prepareSession(accessToken) {
  if (accessToken === sessionToken) return;
  const user = await fetchUserInfo(accessToken);
  if (state.user && state.user.email !== user.email) {
    const err = new WriteError('account_mismatch');
    err.token = accessToken;
    throw err;
  }
  set({ user, connected: true });
  watchTokenExpiry();
  if (!(await ensureLicense(accessToken, user.email))) throw new WriteError('locked');
  if (!structureReady) {
    const file = await findSpreadsheet(accessToken, APP_PROPERTY);
    if (!file || file.id !== state.spreadsheetId) {
      const err = new WriteError('stale');
      err.token = accessToken;
      throw err;
    }
    set({ headers: await ensureStructure(accessToken, file.id, SHEETS) });
    structureReady = true;
  }
  sessionToken = accessToken;
}

/** Current header rows; repairs the structure if the user removed a column. */
async function freshHeaders(accessToken, names) {
  const headers = await readHeaderRows(accessToken, state.spreadsheetId, names);
  const broken = names.some((n) => SHEETS[n].some((col) => !headers[n].includes(col)));
  if (!broken) return headers;
  const repaired = await ensureStructure(accessToken, state.spreadsheetId, SHEETS);
  set({ headers: repaired });
  return repaired;
}

/** 1-based row numbers of `key` in `column` of each sheet, read fresh from the Sheet. */
async function locateRows(accessToken, headers, targets) {
  const columns = await readColumns(
    accessToken,
    state.spreadsheetId,
    targets.map(({ sheet, column }) => ({ sheet, column: headers[sheet].indexOf(column) + 1 })),
  );
  return targets.map((t, i) => findRowNumbers(columns[i], t.key));
}

/**
 * @param {{ apply, revert, perform, target?: 'data'|'settings' }} write
 *   apply/revert map state[target] to its new value.
 */
function runWrite({ apply, revert, perform, target = 'data' }) {
  if (!canWrite()) return Promise.resolve(false);
  // Must happen before any await: the popup needs the user's tap.
  const tokenPromise = ensureToken({ hint: state.user?.email });
  tokenPromise.catch(() => {}); // handled inside the task below

  writeSeq++;
  pendingWrites++;
  set({ [target]: apply(state[target]) });
  saveCache();

  const task = async () => {
    let accessToken = null;
    try {
      accessToken = await tokenPromise;
      await prepareSession(accessToken);
      await perform(accessToken);
      return true;
    } catch (err) {
      set({ [target]: revert(state[target]) });
      saveCache();
      onWriteError(err);
      return false;
    } finally {
      pendingWrites--;
    }
  };

  const result = queue.then(task);
  queue = result;
  result.then((ok) => {
    if (ok && pendingWrites === 0) sync();
  });
  return result;
}

function onWriteError(err) {
  console.warn('[kelar] write failed', err);
  if (err instanceof WriteError) {
    if (err.code === 'locked') return; // the "Akses belum aktif" screen explains it
    if (err.code === 'not_found') {
      toast('Data ini sudah berubah atau dihapus di Sheet. Data dimuat ulang.');
      sync();
      return;
    }
    // Different account or a different spreadsheet: reload everything for the
    // account that is actually signed in. Nothing was written.
    toast(
      err.code === 'account_mismatch'
        ? 'Kamu masuk dengan akun Google lain, jadi perubahan tadi tidak disimpan.'
        : 'Spreadsheet-mu berubah, jadi perubahan tadi tidak disimpan. Data dimuat ulang.',
    );
    sessionToken = null;
    structureReady = false;
    set({ syncing: true });
    finishConnect(Promise.resolve(err.token));
    return;
  }
  if (err instanceof ApiError && err.status === 401) invalidateToken();
  if (err instanceof AuthError || (err instanceof ApiError && err.status === 401)) {
    set({ connected: Boolean(getValidToken()) });
    toast(`${WRITE_FAILED}. Kamu perlu masuk ke Google untuk menyimpan.`);
    return;
  }
  toast(WRITE_FAILED);
  // Part of the write may have reached the Sheet: show what is really there.
  sync();
}

const byId = (id) => (item) => item.id === id;

/** Replace (by id) or append `row` in data[key]. */
function upsert(data, key, row) {
  const list = data[key];
  return { ...data, [key]: list.some(byId(row.id)) ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row] };
}

/** Remove rows with these ids from data[key]. */
function removeIds(data, key, ids) {
  const set = new Set(ids);
  return { ...data, [key]: data[key].filter((x) => !set.has(x.id)) };
}

/** Append objects to a sheet following its current header order. */
async function appendObjects(accessToken, headers, sheet, rows) {
  if (!rows.length) return;
  await appendRows(accessToken, state.spreadsheetId, sheet, rows.map((r) => objectToRow(headers[sheet], r)));
}

/** Overwrite the row whose id matches, found by re-reading the id column. */
async function updateObject(accessToken, headers, sheet, row) {
  const [rows] = await locateRows(accessToken, headers, [{ sheet, column: 'id', key: row.id }]);
  if (!rows.length) throw new WriteError('not_found');
  await updateRanges(accessToken, state.spreadsheetId, [
    { range: rowRange(sheet, rows[0], headers[sheet].length), values: [objectToRow(headers[sheet], row)] },
  ]);
}

export function findLamaran(id) {
  return state.data.lamaran.find(byId(id)) || null;
}

export function findJadwal(id) {
  return state.data.jadwal.find(byId(id)) || null;
}

/**
 * Add a new application (a full row built by createLamaran), plus optional
 * history rows (e.g. the starting status). Call from a tap.
 */
export function addLamaran(row, newRiwayat = []) {
  return runWrite({
    apply: (d) => newRiwayat.reduce((acc, r) => upsert(acc, 'riwayat', r), upsert(d, 'lamaran', row)),
    revert: (d) => removeIds(removeIds(d, 'lamaran', [row.id]), 'riwayat', newRiwayat.map((r) => r.id)),
    perform: async (accessToken) => {
      const headers = await freshHeaders(accessToken, ['Lamaran', 'Riwayat']);
      await appendObjects(accessToken, headers, 'Lamaran', [row]);
      await appendObjects(accessToken, headers, 'Riwayat', newRiwayat);
    },
  });
}

/**
 * Replace an existing application with `after` (same id) and append history rows
 * in the same write (status change, follow-up). Call from a tap.
 */
export function updateLamaranRow(after, newRiwayat = []) {
  const before = findLamaran(after.id);
  if (!before) return Promise.resolve(false);
  return runWrite({
    apply: (d) => newRiwayat.reduce((acc, r) => upsert(acc, 'riwayat', r), upsert(d, 'lamaran', after)),
    revert: (d) => removeIds(upsert(d, 'lamaran', before), 'riwayat', newRiwayat.map((r) => r.id)),
    perform: async (accessToken) => {
      const headers = await freshHeaders(accessToken, newRiwayat.length ? ['Lamaran', 'Riwayat'] : ['Lamaran']);
      await updateObject(accessToken, headers, 'Lamaran', after);
      await appendObjects(accessToken, headers, 'Riwayat', newRiwayat);
    },
  });
}

/** Add one history row (a note). Call from a tap. */
export function addRiwayat(row) {
  return runWrite({
    apply: (d) => upsert(d, 'riwayat', row),
    revert: (d) => removeIds(d, 'riwayat', [row.id]),
    perform: async (accessToken) => {
      const headers = await freshHeaders(accessToken, ['Riwayat']);
      await appendObjects(accessToken, headers, 'Riwayat', [row]);
    },
  });
}

/** Add a schedule. Call from a tap. */
export function addJadwal(row) {
  return runWrite({
    apply: (d) => upsert(d, 'jadwal', row),
    revert: (d) => removeIds(d, 'jadwal', [row.id]),
    perform: async (accessToken) => {
      const headers = await freshHeaders(accessToken, ['Jadwal']);
      await appendObjects(accessToken, headers, 'Jadwal', [row]);
    },
  });
}

/** Replace a schedule (edit, mark as done). Call from a tap. */
export function updateJadwalRow(after) {
  const before = findJadwal(after.id);
  if (!before) return Promise.resolve(false);
  return runWrite({
    apply: (d) => upsert(d, 'jadwal', after),
    revert: (d) => upsert(d, 'jadwal', before),
    perform: async (accessToken) => {
      const headers = await freshHeaders(accessToken, ['Jadwal']);
      await updateObject(accessToken, headers, 'Jadwal', after);
    },
  });
}

/** Delete a schedule. Call from a tap. */
export function deleteJadwal(id) {
  const before = findJadwal(id);
  if (!before) return Promise.resolve(false);
  return runWrite({
    apply: (d) => removeIds(d, 'jadwal', [id]),
    revert: (d) => upsert(d, 'jadwal', before),
    perform: async (accessToken) => {
      const headers = await freshHeaders(accessToken, ['Jadwal']);
      const [rows] = await locateRows(accessToken, headers, [{ sheet: 'Jadwal', column: 'id', key: id }]);
      if (!sheetIds) sheetIds = await getSheetIds(accessToken, state.spreadsheetId);
      await deleteRows(accessToken, state.spreadsheetId, rows.map((row) => ({ sheetId: sheetIds.Jadwal, row })));
    },
  });
}

// Settings: rapid taps on a stepper are merged into one write per key. While a
// write for a key is waiting in the queue, a new value only updates what it will write.
const settingQueued = new Map(); // key -> latest value not yet written

/** Save one Pengaturan value (row with this key; appended if missing). Call from a tap. */
export function updateSetting(key, value) {
  if (!canWrite()) return Promise.resolve(false);
  if (settingQueued.has(key)) {
    settingQueued.set(key, value);
    set({ settings: { ...state.settings, [key]: value } });
    saveCache();
    return Promise.resolve(true);
  }
  const before = state.settings[key];
  settingQueued.set(key, value);
  return runWrite({
    target: 'settings',
    apply: (s) => ({ ...s, [key]: value }),
    revert: (s) => {
      settingQueued.delete(key);
      return { ...s, [key]: before };
    },
    perform: async (accessToken) => {
      const latest = settingQueued.get(key);
      settingQueued.delete(key);
      const headers = await freshHeaders(accessToken, ['Pengaturan']);
      const [rows] = await locateRows(accessToken, headers, [{ sheet: 'Pengaturan', column: 'key', key }]);
      const row = { key, value: latest };
      if (rows.length) {
        await updateRanges(accessToken, state.spreadsheetId, [
          { range: rowRange('Pengaturan', rows[0], headers.Pengaturan.length), values: [objectToRow(headers.Pengaturan, row)] },
        ]);
      } else {
        await appendObjects(accessToken, headers, 'Pengaturan', [row]);
      }
    },
  });
}

/** Delete an application together with its Riwayat and Jadwal rows. Call from a tap. */
export function deleteLamaran(id) {
  const lamaran = findLamaran(id);
  if (!lamaran) return Promise.resolve(false);
  const riwayat = state.data.riwayat.filter((r) => r.lamaran_id === id);
  const jadwal = state.data.jadwal.filter((j) => j.lamaran_id === id);
  return runWrite({
    apply: (d) => ({
      lamaran: d.lamaran.filter((l) => l.id !== id),
      riwayat: d.riwayat.filter((r) => r.lamaran_id !== id),
      jadwal: d.jadwal.filter((j) => j.lamaran_id !== id),
    }),
    revert: (d) => ({
      lamaran: [...d.lamaran, lamaran],
      riwayat: [...d.riwayat, ...riwayat],
      jadwal: [...d.jadwal, ...jadwal],
    }),
    perform: async (accessToken) => {
      const sheets = ['Lamaran', 'Riwayat', 'Jadwal'];
      const headers = await freshHeaders(accessToken, sheets);
      const found = await locateRows(accessToken, headers, [
        { sheet: 'Lamaran', column: 'id', key: id },
        { sheet: 'Riwayat', column: 'lamaran_id', key: id },
        { sheet: 'Jadwal', column: 'lamaran_id', key: id },
      ]);
      if (!sheetIds) sheetIds = await getSheetIds(accessToken, state.spreadsheetId);
      // Already gone from the Sheet (deleted on another device): nothing to do.
      const deletions = sheets.flatMap((sheet, i) => found[i].map((row) => ({ sheetId: sheetIds[sheet], row })));
      await deleteRows(accessToken, state.spreadsheetId, deletions);
    },
  });
}

/** Sign out: revoke the token and remove all local data for this account. */
export function signOut() {
  resetLocal();
}

/** Revoke the token and forget everything stored locally for this account. */
function resetLocal() {
  authSignOut();
  clearCache();
  clearLicense(PRODUCT_ID);
  sessionToken = null;
  structureReady = false;
  sheetIds = null;
  set({
    phase: 'onboarding',
    license: null,
    connected: false,
    user: null,
    spreadsheetId: '',
    headers: {},
    settings: { ...DEFAULT_SETTINGS },
    data: { lamaran: [], riwayat: [], jadwal: [] },
    syncedAt: null,
    error: null,
  });
}

/** Friendly Indonesian message for an error code. */
export function errorMessage(code) {
  switch (code) {
    case 'popup_closed':
      return 'Login dibatalkan. Coba lagi kalau sudah siap.';
    case 'popup_blocked':
      return 'Jendela login Google tidak bisa dibuka. Izinkan pop-up untuk situs ini, lalu coba lagi.';
    case 'scope_denied':
      return 'Kelar butuh izin untuk membuat dan mengelola spreadsheet-nya sendiri di Drive kamu. Centang izin itu saat login, ya.';
    case 'gis_unavailable':
      return 'Layanan login Google belum termuat. Cek koneksimu, lalu coba lagi.';
    case 'expired':
      return 'Sesi login habis. Ketuk untuk sinkronkan lagi.';
    case 'network':
      return 'Koneksi bermasalah. Coba lagi sebentar lagi.';
    case 'forbidden':
      return 'Google menolak akses ke spreadsheet. Coba keluar lalu masuk lagi.';
    default:
      return 'Ada yang tidak beres. Coba lagi, ya.';
  }
}
