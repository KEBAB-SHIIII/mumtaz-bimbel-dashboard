import { describe, expect, it } from 'vitest';
import { SHEET_EXPORT_HEADERS, sheetTitleForPeriod } from '@mumtaz/contracts';
import { EXPECTED_EXPORT_ROWS_2026_10, EXPECTED_SESSION_IDS_BY_PERIOD } from '@mumtaz/contracts/fixtures';
import { SheetsExportError } from '../src/integrations/google-sheets/types.js';
import { FakeGoogleSheetsExporter } from './fakes/fake-google-sheets-exporter.js';

const OCT = sheetTitleForPeriod('2026-10');

describe('FakeGoogleSheetsExporter (test double, bukan live)', () => {
  it('ekspor pertama membuat tab Absensi YYYY-MM dengan header 8 kolom', async () => {
    const exporter = new FakeGoogleSheetsExporter();
    expect(await exporter.getTabState(OCT)).toEqual({ exists: false, dataRowCount: 0 });

    const result = await exporter.writeReport({ sheetTitle: OCT, header: SHEET_EXPORT_HEADERS, rows: EXPECTED_EXPORT_ROWS_2026_10 });

    expect(result).toEqual({ spreadsheetId: 'fake-spreadsheet-id', sheetTitle: 'Absensi 2026-10', recordsExported: 9 });
    const tab = exporter.getTab(OCT);
    expect(tab?.[0]).toEqual([...SHEET_EXPORT_HEADERS]);
    expect(tab).toHaveLength(10);
    expect(tab?.every((row) => row.length === 8)).toBe(true);
  });

  it('re-export bulan sama mengganti isi tab, bukan append (termasuk sisa baris lama)', async () => {
    const exporter = new FakeGoogleSheetsExporter();
    await exporter.writeReport({ sheetTitle: OCT, header: SHEET_EXPORT_HEADERS, rows: EXPECTED_EXPORT_ROWS_2026_10 });
    await exporter.writeReport({ sheetTitle: OCT, header: SHEET_EXPORT_HEADERS, rows: EXPECTED_EXPORT_ROWS_2026_10 });
    expect(exporter.getTab(OCT)).toHaveLength(10);

    const shorter = EXPECTED_EXPORT_ROWS_2026_10.slice(0, 3);
    const result = await exporter.writeReport({ sheetTitle: OCT, header: SHEET_EXPORT_HEADERS, rows: shorter });
    expect(result.recordsExported).toBe(3);
    expect(exporter.getTab(OCT)).toHaveLength(4);
    expect(exporter.tabTitles()).toEqual([OCT]);
  });

  it('periode kosong: preflight mendeteksi tab berisi agar service dapat mengembalikan 409', async () => {
    const exporter = new FakeGoogleSheetsExporter();
    const DEC = sheetTitleForPeriod('2026-12');
    expect(EXPECTED_SESSION_IDS_BY_PERIOD['2026-12']).toEqual([]);

    exporter.seedTab(DEC, [[...SHEET_EXPORT_HEADERS], [1, 'Tutor Lama', 'Murid', '3 SD', 'Sekolah', 'IPA', '01/12/2026', '60 menit']]);
    expect(await exporter.getTabState(DEC)).toEqual({ exists: true, dataRowCount: 1 });

    // Setelah konfirmasi eksplisit, replace dengan header saja.
    const result = await exporter.writeReport({ sheetTitle: DEC, header: SHEET_EXPORT_HEADERS, rows: [] });
    expect(result.recordsExported).toBe(0);
    expect(exporter.getTab(DEC)).toEqual([[...SHEET_EXPORT_HEADERS]]);
    expect(await exporter.getTabState(DEC)).toEqual({ exists: true, dataRowCount: 0 });
  });

  it('kegagalan write tidak menghapus laporan lama dan melempar error aman', async () => {
    const exporter = new FakeGoogleSheetsExporter();
    await exporter.writeReport({ sheetTitle: OCT, header: SHEET_EXPORT_HEADERS, rows: EXPECTED_EXPORT_ROWS_2026_10 });
    const before = exporter.getTab(OCT);

    exporter.failNext('write');
    const failure = exporter.writeReport({ sheetTitle: OCT, header: SHEET_EXPORT_HEADERS, rows: [] });
    await expect(failure).rejects.toBeInstanceOf(SheetsExportError);
    await expect(failure).rejects.toMatchObject({ stage: 'write' });
    expect(exporter.getTab(OCT)).toEqual(before);

    // Kegagalan hanya sekali; retry berikutnya berhasil.
    await expect(exporter.writeReport({ sheetTitle: OCT, header: SHEET_EXPORT_HEADERS, rows: [] })).resolves.toMatchObject({ recordsExported: 0 });
  });

  it('kegagalan preflight read dilaporkan sebagai error tahap read', async () => {
    const exporter = new FakeGoogleSheetsExporter();
    exporter.failNext('read');
    await expect(exporter.getTabState(OCT)).rejects.toMatchObject({ name: 'SheetsExportError', stage: 'read' });
  });

  it('menolak menulis ke tab yang tidak dikelola fitur', async () => {
    const exporter = new FakeGoogleSheetsExporter();
    await expect(exporter.writeReport({ sheetTitle: 'Sheet1', header: SHEET_EXPORT_HEADERS, rows: [] })).rejects.toBeInstanceOf(SheetsExportError);
    expect(exporter.tabTitles()).toEqual([]);
  });
});
