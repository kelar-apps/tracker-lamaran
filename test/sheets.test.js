import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendRows,
  buildFindQuery,
  columnLetter,
  ensureStructure,
  mergeHeaders,
  objectToRow,
  quoteSheet,
  rowsToObjects,
} from '../src/core/sheets.js';

describe('pure helpers', () => {
  it('columnLetter', () => {
    expect(columnLetter(1)).toBe('A');
    expect(columnLetter(16)).toBe('P');
    expect(columnLetter(26)).toBe('Z');
    expect(columnLetter(27)).toBe('AA');
    expect(columnLetter(52)).toBe('AZ');
  });

  it('quoteSheet escapes single quotes', () => {
    expect(quoteSheet('Lamaran')).toBe("'Lamaran'");
    expect(quoteSheet("Bu'di")).toBe("'Bu''di'");
  });

  it('buildFindQuery tags by appProperty and skips trash', () => {
    const q = buildFindQuery({ key: 'kelarApp', value: 'tracker-lamaran' });
    expect(q).toContain("appProperties has { key='kelarApp' and value='tracker-lamaran' }");
    expect(q).toContain('trashed=false');
    expect(q).toContain("mimeType='application/vnd.google-apps.spreadsheet'");
  });

  it('rowsToObjects maps by header, fills gaps, skips rows without key', () => {
    const rows = [
      ['id', 'perusahaan', 'posisi'],
      ['a1', 'PT Maju'],
      ['', 'Diketik manual', 'x'],
      ['a2', 'CV Jaya', 'Admin'],
    ];
    expect(rowsToObjects(rows, { keyColumn: 'id' })).toEqual([
      { id: 'a1', perusahaan: 'PT Maju', posisi: '' },
      { id: 'a2', perusahaan: 'CV Jaya', posisi: 'Admin' },
    ]);
    expect(rowsToObjects([])).toEqual([]);
  });

  it('rowsToObjects follows the sheet column order, not ours', () => {
    const rows = [['posisi', 'id'], ['Admin', 'a1']];
    expect(rowsToObjects(rows, { keyColumn: 'id' })).toEqual([{ posisi: 'Admin', id: 'a1' }]);
  });

  it('objectToRow follows headers', () => {
    expect(objectToRow(['id', 'a', 'b', 'c'], { id: 'x', b: 0, c: false })).toEqual(['x', '', 0, false]);
  });

  it('mergeHeaders keeps existing order and appends missing columns', () => {
    expect(mergeHeaders([], ['id', 'a'])).toEqual(['id', 'a']);
    expect(mergeHeaders(['a', 'id', 'extra', ''], ['id', 'a', 'b'])).toEqual(['a', 'id', 'extra', 'b']);
  });
});

// ---------- API calls with a mocked fetch ----------

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: u, method: init.method || 'GET', body });
    const json = handler({ url: u, method: init.method || 'GET', body }) ?? {};
    return { ok: true, status: 200, json: async () => json };
  });
  return calls;
}

afterEach(() => {
  delete globalThis.fetch;
});

describe('appendRows', () => {
  it('always writes RAW so user text is never a formula', async () => {
    const calls = mockFetch(() => ({}));
    await appendRows('tok', 'sid', 'Lamaran', [['=IMPORTXML("x")']]);
    const { url, body } = calls[0];
    expect(url.searchParams.get('valueInputOption')).toBe('RAW');
    expect(url.searchParams.get('insertDataOption')).toBe('INSERT_ROWS');
    expect(decodeURIComponent(url.pathname)).toContain("'Lamaran'!A1:append");
    expect(body.values).toEqual([['=IMPORTXML("x")']]);
  });
});

describe('ensureStructure', () => {
  const definition = { Lamaran: ['id', 'perusahaan'], Riwayat: ['id', 'catatan'], Pengaturan: ['key', 'value'] };

  it('fresh spreadsheet: renames the default sheet, adds the rest, writes headers', async () => {
    const calls = mockFetch(({ url, method }) => {
      if (method === 'GET' && url.pathname.endsWith('/sid')) {
        return { sheets: [{ properties: { sheetId: 0, title: 'Lembar1', index: 0 } }] };
      }
      if (url.pathname.endsWith('values:batchGet')) return { valueRanges: [{}, {}, {}] };
      return {};
    });

    const headers = await ensureStructure('tok', 'sid', definition, { fresh: true });

    expect(headers).toEqual(definition);
    const batch = calls.find((c) => c.url.pathname.endsWith(':batchUpdate') && c.body.requests).body.requests;
    expect(batch[0].updateSheetProperties.properties).toMatchObject({ sheetId: 0, title: 'Lamaran' });
    expect(batch.slice(1).map((r) => r.addSheet.properties.title)).toEqual(['Riwayat', 'Pengaturan']);

    const write = calls.find((c) => c.url.pathname.endsWith('values:batchUpdate')).body;
    expect(write.valueInputOption).toBe('RAW');
    expect(write.data.map((d) => d.range)).toEqual(["'Lamaran'!A1:B1", "'Riwayat'!A1:B1", "'Pengaturan'!A1:B1"]);
  });

  it('existing spreadsheet: re-adds a deleted sheet and appends a missing column only', async () => {
    const calls = mockFetch(({ url, method }) => {
      if (method === 'GET' && url.pathname.endsWith('/sid')) {
        return {
          sheets: [
            { properties: { sheetId: 1, title: 'Lamaran' } },
            { properties: { sheetId: 2, title: 'Pengaturan' } },
          ],
        };
      }
      if (url.pathname.endsWith('values:batchGet')) {
        return { valueRanges: [{ values: [['id']] }, {}, { values: [['key', 'value']] }] };
      }
      return {};
    });

    const headers = await ensureStructure('tok', 'sid', definition);

    const batch = calls.find((c) => c.body?.requests).body.requests;
    expect(batch).toEqual([{ addSheet: { properties: { title: 'Riwayat', gridProperties: { frozenRowCount: 1 } } } }]);
    const write = calls.find((c) => c.url.pathname.endsWith('values:batchUpdate')).body;
    expect(write.data).toEqual([
      { range: "'Lamaran'!A1:B1", values: [['id', 'perusahaan']] },
      { range: "'Riwayat'!A1:B1", values: [['id', 'catatan']] },
    ]);
    expect(headers.Pengaturan).toEqual(['key', 'value']);
  });

  it('complete spreadsheet: no writes at all', async () => {
    const calls = mockFetch(({ url, method }) => {
      if (method === 'GET' && url.pathname.endsWith('/sid')) {
        return { sheets: Object.keys(definition).map((title, i) => ({ properties: { sheetId: i, title } })) };
      }
      if (url.pathname.endsWith('values:batchGet')) {
        return { valueRanges: Object.values(definition).map((h) => ({ values: [h] })) };
      }
      return {};
    });
    await ensureStructure('tok', 'sid', definition);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });
});
