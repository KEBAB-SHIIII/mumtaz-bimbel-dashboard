import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { sheets_v4 } from 'googleapis';
import { afterAll, describe, expect, it } from 'vitest';
import { SHEET_EXPORT_HEADERS, type SheetExportRow } from '@mumtaz/contracts';
import { EXPECTED_EXPORT_ROWS_2026_10 } from '@mumtaz/contracts/fixtures';
import {
  SheetsApiExporter,
  createSheetsExporter,
  sheetIdForTitle,
  toSheetsExportError,
  type SheetsApiClient,
} from '../src/integrations/google-sheets/sheets-api-exporter.js';
import { SheetsExportError } from '../src/integrations/google-sheets/types.js';
import type { Logger } from '../src/lib/logger.js';
import { makeTestEnv } from './test-env.js';

interface Tab {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
  rows: number;
}

/** Klien Google palsu yang merekam setiap batchUpdate (tanpa credential). */
function fakeClient(tabs: Tab[], options: { failBatch?: unknown[] } = {}) {
  const batches: sheets_v4.Schema$Request[][] = [];
  const failures = [...(options.failBatch ?? [])];
  const client: SheetsApiClient = {
    listSheets: async () => tabs.map(({ rows: _rows, ...meta }) => meta),
    countRows: async (_id, title) => tabs.find((tab) => tab.title === title)?.rows ?? 0,
    batchUpdate: async (_id, requests) => {
      const failure = failures.shift();
      if (failure) throw failure;
      batches.push(requests);
    },
  };
  return { client, batches };
}

const write = (exporter: SheetsApiExporter, title: string, rows: readonly SheetExportRow[]) =>
  exporter.writeReport({ sheetTitle: title, header: SHEET_EXPORT_HEADERS, rows });

describe('SheetsApiExporter (Google API di-mock)', () => {
  it('tab belum ada: addSheet + tulis data dalam SATU batchUpdate (atomik)', async () => {
    const { client, batches } = fakeClient([]);
    const result = await write(new SheetsApiExporter('sheet-id', client), 'Absensi 2026-10', EXPECTED_EXPORT_ROWS_2026_10);

    expect(result).toEqual({ spreadsheetId: 'sheet-id', sheetTitle: 'Absensi 2026-10', recordsExported: 9 });
    expect(batches).toHaveLength(1);
    const [addSheet, updateCells] = batches[0] ?? [];
    expect(addSheet?.addSheet?.properties).toMatchObject({ sheetId: sheetIdForTitle('Absensi 2026-10'), title: 'Absensi 2026-10' });
    expect(updateCells?.updateCells).toMatchObject({
      range: { sheetId: sheetIdForTitle('Absensi 2026-10'), startRowIndex: 0, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 8 },
      fields: 'userEnteredValue',
    });
    const rows = updateCells?.updateCells?.rows ?? [];
    expect(rows[0]?.values?.map((cell) => cell.userEnteredValue?.stringValue)).toEqual([...SHEET_EXPORT_HEADERS]);
    // `no` angka; tanggal & durasi TEKS agar tidak diubah locale spreadsheet.
    expect(rows[1]?.values?.[0]?.userEnteredValue).toEqual({ numberValue: 1 });
    expect(rows[1]?.values?.[6]?.userEnteredValue).toEqual({ stringValue: '01/10/2026' });
    expect(rows[1]?.values?.[7]?.userEnteredValue).toEqual({ stringValue: '90 menit' });
  });

  it('re-export lebih pendek: sisa baris lama ditimpa sel kosong di batch yang sama (tidak clear dulu)', async () => {
    const existing: Tab = { sheetId: 42, title: 'Absensi 2026-10', rowCount: 100, columnCount: 8, rows: 10 };
    const { client, batches } = fakeClient([existing]);
    await write(new SheetsApiExporter('sheet-id', client), 'Absensi 2026-10', EXPECTED_EXPORT_ROWS_2026_10.slice(0, 2));

    expect(batches).toHaveLength(1);
    const requests = batches[0] ?? [];
    expect(requests.map((request) => Object.keys(request)[0])).toEqual(['updateCells']);
    const update = requests[0]?.updateCells;
    expect(update?.range).toMatchObject({ sheetId: 42, endRowIndex: 10 });
    const rows = update?.rows ?? [];
    expect(rows).toHaveLength(10);
    expect(rows.slice(3).every((row) => row.values?.every((cell) => cell.userEnteredValue === undefined))).toBe(true);
  });

  it('grid terlalu kecil → updateSheetProperties diikutkan di batch yang sama', async () => {
    const { client, batches } = fakeClient([{ sheetId: 7, title: 'Absensi 2026-10', rowCount: 5, columnCount: 3, rows: 2 }]);
    await write(new SheetsApiExporter('sheet-id', client), 'Absensi 2026-10', EXPECTED_EXPORT_ROWS_2026_10);
    expect((batches[0] ?? []).map((request) => Object.keys(request)[0])).toEqual(['updateSheetProperties', 'updateCells']);
    expect(batches[0]?.[0]?.updateSheetProperties?.properties?.gridProperties).toEqual({ rowCount: 10, columnCount: 8 });
  });

  it('getTabState menghitung baris data tanpa header', async () => {
    const { client } = fakeClient([{ sheetId: 1, title: 'Absensi 2026-10', rowCount: 100, columnCount: 8, rows: 4 }]);
    const exporter = new SheetsApiExporter('sheet-id', client);
    expect(await exporter.getTabState('Absensi 2026-10')).toEqual({ exists: true, dataRowCount: 3 });
    expect(await exporter.getTabState('Absensi 2026-11')).toEqual({ exists: false, dataRowCount: 0 });
  });

  it('menolak tab yang tidak dikelola fitur (tidak menyentuh tab lain)', async () => {
    const { client, batches } = fakeClient([]);
    await expect(write(new SheetsApiExporter('sheet-id', client), 'Sheet1', [])).rejects.toBeInstanceOf(SheetsExportError);
    expect(batches).toHaveLength(0);
  });

  it('tab dibuat bersamaan oleh proses lain ("already exists") → baca ulang lalu tulis sekali lagi', async () => {
    const tabs: Tab[] = [];
    const conflict = Object.assign(new Error('Invalid requests[0].addSheet: A sheet with the name "Absensi 2026-10" already exists.'), { status: 400 });
    const { client, batches } = fakeClient(tabs, { failBatch: [conflict] });
    const exporter = new SheetsApiExporter('sheet-id', client);
    // Setelah kegagalan pertama, tab "muncul" (dibuat proses lain).
    const originalList = client.listSheets.bind(client);
    let calls = 0;
    client.listSheets = async (id) => {
      calls += 1;
      if (calls > 1) tabs.splice(0, tabs.length, { sheetId: 99, title: 'Absensi 2026-10', rowCount: 100, columnCount: 8, rows: 3 });
      return originalList(id);
    };
    await write(exporter, 'Absensi 2026-10', EXPECTED_EXPORT_ROWS_2026_10);
    expect(batches).toHaveLength(1);
    expect((batches[0] ?? []).map((request) => Object.keys(request)[0])).toEqual(['updateCells']);
  });

  it('error Google dipetakan ke pesan aman tanpa detail credential/payload', async () => {
    const leaky = (status: number) => Object.assign(new Error('request failed: private_key=-----BEGIN token=abc'), { response: { status } });
    expect(toSheetsExportError('write', leaky(403)).safeMessage).toMatch(/akses Editor/);
    expect(toSheetsExportError('read', leaky(404)).safeMessage).toMatch(/tidak ditemukan/);
    expect(toSheetsExportError('write', leaky(429)).safeMessage).toMatch(/Kuota/);
    expect(toSheetsExportError('write', Object.assign(new Error('x'), { code: 'ETIMEDOUT' })).safeMessage).toMatch(/timeout/);
    for (const status of [403, 404, 429, 500]) {
      expect(toSheetsExportError('write', leaky(status)).safeMessage).not.toMatch(/private_key|token|BEGIN/);
    }

    const { client } = fakeClient([], { failBatch: [leaky(403)] });
    const error = await write(new SheetsApiExporter('sheet-id', client), 'Absensi 2026-10', []).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'SheetsExportError', stage: 'write' });
  });
});

describe('createSheetsExporter (konfigurasi)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mumtaz-sheets-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const FAKE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nFAKE-TEST-ONLY\n-----END PRIVATE KEY-----\n';

  const recordingLogger = () => {
    const lines: string[] = [];
    const record = (message: string, fields?: Record<string, unknown>) => lines.push(JSON.stringify({ message, ...fields }));
    const logger: Logger = { debug: record, info: record, warn: record, error: record };
    return { logger, lines };
  };
  const env = (keyFile: string, enabled = 'true') =>
    makeTestEnv({ GOOGLE_SHEETS_EXPORT_ENABLED: enabled, GOOGLE_SHEETS_SPREADSHEET_ID: 'demo-sheet', GOOGLE_SERVICE_ACCOUNT_KEY_FILE: keyFile });

  it('nonaktif / key file tidak ada / key tidak valid → null (endpoint 503), isi key tidak pernah dicatat', () => {
    const { logger, lines } = recordingLogger();
    const valid = join(dir, 'valid.json');
    writeFileSync(valid, JSON.stringify({ client_email: 'svc@example.test', private_key: FAKE_PRIVATE_KEY }));
    const invalid = join(dir, 'invalid.json');
    writeFileSync(invalid, '{"private_key": "FAKE-TEST-ONLY-SECRET"');

    expect(createSheetsExporter(env(valid, 'false'), logger)).toBeNull();
    expect(createSheetsExporter(env(join(dir, 'missing.json')), logger)).toBeNull();
    expect(createSheetsExporter(env(invalid), logger)).toBeNull();
    expect(lines.join('\n')).not.toMatch(/FAKE-TEST-ONLY|svc@example/);

    const exporter = createSheetsExporter(env(valid), logger);
    expect(exporter).toBeInstanceOf(SheetsApiExporter);
    expect(exporter?.spreadsheetId).toBe('demo-sheet');
  });
});
