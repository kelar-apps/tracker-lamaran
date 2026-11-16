// Thin wrapper around Google Sheets API v4 and Drive API v3, called from the browser
// with the user's access token (scope drive.file: only files this app created).
// All writes use valueInputOption=RAW so user text is never evaluated as a formula.

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

export class ApiError extends Error {
  constructor(status, message) {
    super(message || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(accessToken, url, { method = 'GET', query, body } = {}) {
  const u = new URL(url);
  for (const [key, value] of Object.entries(query || {})) {
    for (const v of [value].flat()) if (v != null) u.searchParams.append(key, String(v));
  }
  let res;
  try {
    res = await fetch(u, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (!res.ok) {
    let message;
    try {
      message = (await res.json())?.error?.message;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? null : res.json();
}

/** Quote a sheet name for A1 notation: Lamaran -> 'Lamaran'. */
export function quoteSheet(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

/** 1 -> A, 26 -> Z, 27 -> AA */
export function columnLetter(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function escapeQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Drive query that finds spreadsheets tagged with our appProperty. */
export function buildFindQuery({ key, value }) {
  return [
    `appProperties has { key='${escapeQuery(key)}' and value='${escapeQuery(value)}' }`,
    `mimeType='${SPREADSHEET_MIME}'`,
    'trashed=false',
  ].join(' and ');
}

/** Returns the oldest matching spreadsheet { id, name } or null. */
export async function findSpreadsheet(accessToken, appProperty) {
  const data = await request(accessToken, DRIVE_API, {
    query: {
      q: buildFindQuery(appProperty),
      fields: 'files(id,name)',
      orderBy: 'createdTime',
      pageSize: 10,
      spaces: 'drive',
    },
  });
  return data.files?.[0] || null;
}

/**
 * Create an empty spreadsheet in the user's Drive, tagged with appProperty in the
 * same request (so a later search always finds it even if setup is interrupted).
 */
export async function createSpreadsheet(accessToken, { title, appProperty }) {
  return request(accessToken, DRIVE_API, {
    method: 'POST',
    query: { fields: 'id,name' },
    body: { name: title, mimeType: SPREADSHEET_MIME, appProperties: { [appProperty.key]: appProperty.value } },
  });
}

/**
 * Make sure every sheet in `definition` exists and its header row contains all
 * required columns. Safe to run on every login; repairs partial setups and
 * sheets the user deleted. Existing columns are kept; missing ones are appended.
 * @param {Record<string, string[]>} definition  sheet name -> required headers
 * @param {{ fresh?: boolean }} options  fresh = spreadsheet was just created
 * @returns {Promise<Record<string, string[]>>}  actual header row per sheet
 */
export async function ensureStructure(accessToken, spreadsheetId, definition, { fresh = false } = {}) {
  const meta = await request(accessToken, `${SHEETS_API}/${spreadsheetId}`, {
    query: { fields: 'sheets.properties(sheetId,title,index)' },
  });
  const existing = (meta.sheets || []).map((s) => s.properties);
  const names = Object.keys(definition);
  const missing = names.filter((n) => !existing.some((s) => s.title === n));

  const requests = [];
  let toAdd = missing;
  // A new spreadsheet has one default sheet ("Sheet1", "Lembar1", ...): reuse it.
  if (fresh && missing.length && existing.length === 1 && !names.includes(existing[0].title)) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: existing[0].sheetId, title: missing[0], gridProperties: { frozenRowCount: 1 } },
        fields: 'title,gridProperties.frozenRowCount',
      },
    });
    toAdd = missing.slice(1);
  }
  for (const title of toAdd) {
    requests.push({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } });
  }
  if (requests.length) {
    await request(accessToken, `${SHEETS_API}/${spreadsheetId}:batchUpdate`, { method: 'POST', body: { requests } });
  }

  // Header rows.
  const headerRanges = names.map((n) => `${quoteSheet(n)}!1:1`);
  const current = await request(accessToken, `${SHEETS_API}/${spreadsheetId}/values:batchGet`, {
    query: { ranges: headerRanges, valueRenderOption: 'UNFORMATTED_VALUE' },
  });
  const headers = {};
  const writes = [];
  names.forEach((name, i) => {
    const row = (current.valueRanges?.[i]?.values?.[0] || []).map((v) => String(v).trim());
    const merged = mergeHeaders(row, definition[name]);
    headers[name] = merged;
    if (merged.length !== row.length) {
      writes.push({ range: `${quoteSheet(name)}!A1:${columnLetter(merged.length)}1`, values: [merged] });
    }
  });
  if (writes.length) {
    await request(accessToken, `${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: { valueInputOption: 'RAW', data: writes },
    });
  }
  return headers;
}

/** Keep the existing header row and append any required column that is missing. */
export function mergeHeaders(existingRow, required) {
  // Trailing empty cells are not part of the header.
  const row = [...existingRow];
  while (row.length && row[row.length - 1] === '') row.pop();
  const result = [...row];
  for (const col of required) if (!result.includes(col)) result.push(col);
  return result;
}

/**
 * Read whole sheets in one request.
 * @returns {Promise<Record<string, any[][]>>} sheet name -> rows (including header row)
 */
export async function readSheets(accessToken, spreadsheetId, names) {
  const data = await request(accessToken, `${SHEETS_API}/${spreadsheetId}/values:batchGet`, {
    query: {
      ranges: names.map(quoteSheet),
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    },
  });
  const out = {};
  names.forEach((name, i) => {
    out[name] = data.valueRanges?.[i]?.values || [];
  });
  return out;
}

/** Append rows at the bottom of a sheet (RAW, new rows inserted). */
export async function appendRows(accessToken, spreadsheetId, sheetName, rows) {
  return request(accessToken, `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(`${quoteSheet(sheetName)}!A1`)}:append`, {
    method: 'POST',
    query: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' },
    body: { values: rows },
  });
}

/** Overwrite ranges (RAW). data: [{ range, values }] */
export async function updateRanges(accessToken, spreadsheetId, data) {
  return request(accessToken, `${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: { valueInputOption: 'RAW', data },
  });
}

/**
 * Read the header row (row 1) of several sheets in one request.
 * @returns {Promise<Record<string, string[]>>}
 */
export async function readHeaderRows(accessToken, spreadsheetId, names) {
  const data = await request(accessToken, `${SHEETS_API}/${spreadsheetId}/values:batchGet`, {
    query: { ranges: names.map((n) => `${quoteSheet(n)}!1:1`), valueRenderOption: 'UNFORMATTED_VALUE' },
  });
  const out = {};
  names.forEach((name, i) => {
    out[name] = (data.valueRanges?.[i]?.values?.[0] || []).map((v) => String(v).trim());
  });
  return out;
}

/**
 * Read whole columns, e.g. the `id` column, right before a row is updated or deleted.
 * Row numbers from the cache can be stale (another device, manual edits).
 * @param {{ sheet: string, column: number }[]} targets  column is 1-based
 * @returns {Promise<any[][]>}  one array per target; index 0 = row 1 (the header)
 */
export async function readColumns(accessToken, spreadsheetId, targets) {
  if (!targets.length) return [];
  const data = await request(accessToken, `${SHEETS_API}/${spreadsheetId}/values:batchGet`, {
    query: {
      ranges: targets.map(({ sheet, column }) => `${quoteSheet(sheet)}!${columnLetter(column)}:${columnLetter(column)}`),
      majorDimension: 'COLUMNS',
      valueRenderOption: 'UNFORMATTED_VALUE',
    },
  });
  return targets.map((_, i) => data.valueRanges?.[i]?.values?.[0] || []);
}

/** Sheet title -> numeric sheetId (needed for deleteDimension). */
export async function getSheetIds(accessToken, spreadsheetId) {
  const meta = await request(accessToken, `${SHEETS_API}/${spreadsheetId}`, {
    query: { fields: 'sheets.properties(sheetId,title)' },
  });
  return Object.fromEntries((meta.sheets || []).map((s) => [s.properties.title, s.properties.sheetId]));
}

/**
 * Delete whole rows in one batchUpdate.
 * @param {{ sheetId: number, row: number }[]} deletions  row is 1-based
 */
export async function deleteRows(accessToken, spreadsheetId, deletions) {
  const requests = buildDeleteRequests(deletions);
  if (!requests.length) return null;
  return request(accessToken, `${SHEETS_API}/${spreadsheetId}:batchUpdate`, { method: 'POST', body: { requests } });
}

// ---------- Pure helpers (unit tested) ----------

/**
 * 1-based row numbers whose value in `column` equals `key` (header row skipped).
 * @param {any[]} column  values of one column, index 0 = row 1
 */
export function findRowNumbers(column, key) {
  const wanted = String(key).trim();
  const rows = [];
  for (let i = 1; i < (column?.length || 0); i++) {
    if (String(column[i] ?? '').trim() === wanted) rows.push(i + 1);
  }
  return rows;
}

/** A1 range covering one full row, e.g. ('Lamaran', 5, 16) -> 'Lamaran'!A5:P5 */
export function rowRange(sheetName, row, columnCount) {
  return `${quoteSheet(sheetName)}!A${row}:${columnLetter(columnCount)}${row}`;
}

/**
 * deleteDimension requests ordered from the bottom row up, so earlier deletions
 * never shift the index of a later one. Duplicates are removed.
 */
export function buildDeleteRequests(deletions) {
  const seen = new Set();
  return [...deletions]
    .filter(({ sheetId, row }) => {
      const key = `${sheetId}:${row}`;
      if (seen.has(key) || !(row > 1)) return false; // never delete the header row
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.row - a.row)
    .map(({ sheetId, row }) => ({
      deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } },
    }));
}

/**
 * Convert sheet rows (first row = headers) to objects keyed by header.
 * Rows whose `keyColumn` is empty are skipped (e.g. rows typed by hand).
 */
export function rowsToObjects(rows, { keyColumn } = {}) {
  if (!rows?.length) return [];
  const headers = rows[0].map((h) => String(h).trim());
  const result = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const obj = {};
    headers.forEach((h, c) => {
      if (h) obj[h] = row[c] ?? '';
    });
    if (keyColumn && String(obj[keyColumn] ?? '').trim() === '') continue;
    result.push(obj);
  }
  return result;
}

/** Convert an object to a row following `headers`; unknown headers become ''. */
export function objectToRow(headers, obj) {
  return headers.map((h) => {
    const v = obj[h];
    return v == null ? '' : v;
  });
}

/** Link to open the spreadsheet in Google Sheets. */
export function spreadsheetUrl(spreadsheetId) {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;
}
