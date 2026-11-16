import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDeleteRequests, deleteRows, findRowNumbers, readColumns, rowRange, updateRanges } from '../src/core/sheets.js';

describe('row helpers', () => {
  it('findRowNumbers skips the header and returns 1-based rows', () => {
    const column = ['id', 'a', '', 'b', 'a ', 'c'];
    expect(findRowNumbers(column, 'a')).toEqual([2, 5]);
    expect(findRowNumbers(column, 'c')).toEqual([6]);
    expect(findRowNumbers(column, 'x')).toEqual([]);
    expect(findRowNumbers([], 'a')).toEqual([]);
    // A header cell that happens to equal the key is never a match.
    expect(findRowNumbers(['id', 'x'], 'id')).toEqual([]);
  });

  it('rowRange covers the whole row', () => {
    expect(rowRange('Lamaran', 5, 16)).toBe("'Lamaran'!A5:P5");
    expect(rowRange("O'Brien", 2, 2)).toBe("'O''Brien'!A2:B2");
  });

  it('buildDeleteRequests deletes bottom-up, dedupes and never touches the header', () => {
    const req = buildDeleteRequests([
      { sheetId: 1, row: 3 },
      { sheetId: 2, row: 10 },
      { sheetId: 1, row: 7 },
      { sheetId: 1, row: 3 },
      { sheetId: 1, row: 1 },
    ]);
    expect(req.map((r) => r.deleteDimension.range)).toEqual([
      { sheetId: 2, dimension: 'ROWS', startIndex: 9, endIndex: 10 },
      { sheetId: 1, dimension: 'ROWS', startIndex: 6, endIndex: 7 },
      { sheetId: 1, dimension: 'ROWS', startIndex: 2, endIndex: 3 },
    ]);
  });
});

describe('row API calls', () => {
  afterEach(() => vi.unstubAllGlobals());

  function mockFetch(body = {}) {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  it('readColumns asks for whole columns in COLUMNS major dimension', async () => {
    const fetch = mockFetch({ valueRanges: [{ values: [['id', 'a', 'b']] }, {}] });
    const cols = await readColumns('tok', 'SID', [
      { sheet: 'Lamaran', column: 1 },
      { sheet: 'Riwayat', column: 2 },
    ]);
    expect(cols).toEqual([['id', 'a', 'b'], []]);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.getAll('ranges')).toEqual(["'Lamaran'!A:A", "'Riwayat'!B:B"]);
    expect(url.searchParams.get('majorDimension')).toBe('COLUMNS');
  });

  it('updateRanges writes RAW', async () => {
    const fetch = mockFetch();
    await updateRanges('tok', 'SID', [{ range: "'Lamaran'!A2:B2", values: [['=1+1', 'x']] }]);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.valueInputOption).toBe('RAW');
  });

  it('deleteRows sends one batchUpdate, or nothing when empty', async () => {
    const fetch = mockFetch();
    await deleteRows('tok', 'SID', []);
    expect(fetch).not.toHaveBeenCalled();
    await deleteRows('tok', 'SID', [{ sheetId: 0, row: 4 }]);
    expect(String(fetch.mock.calls[0][0])).toContain('SID:batchUpdate');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.requests).toHaveLength(1);
  });
});
