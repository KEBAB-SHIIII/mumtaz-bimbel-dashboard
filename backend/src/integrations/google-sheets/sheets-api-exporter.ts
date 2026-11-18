import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { google, type sheets_v4 } from 'googleapis';
import { reportLayout, REPORT_HEADER_ROWS } from './report-layout.js';
import { formatPeriodLabel, isManagedSheetTitle, periodFromSheetTitle, periodSchema } from '@mumtaz/contracts';
import type { Env } from '../../config/env.js';
import type { Logger } from '../../lib/logger.js';
import {
  SheetsExportError,
  type GoogleSheetsExporter,
  type SheetTabState,
  type SheetsExportStage,
  type WriteReportInput,
  type WriteReportResult,
} from './types.js';

const COLUMN_COUNT = 8;
const MIN_GRID_ROWS = 100;
/** `sheetId` deterministik per periode → `addSheet` + tulis data bisa dalam satu batch atomik. */
const SHEET_ID_BASE = 900_000_000;

interface SheetMeta {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

/** Antarmuka minimal Google Sheets API yang dipakai exporter (di-inject agar bisa dites offline). */
export interface SheetsApiClient {
  listSheets(spreadsheetId: string): Promise<SheetMeta[]>;
  /** Nilai A:H termasuk kop dan header. */
  readRows(spreadsheetId: string, title: string): Promise<unknown[][]>;
  batchUpdate(spreadsheetId: string, requests: sheets_v4.Schema$Request[]): Promise<void>;
}

/** Nama tab aman untuk notasi A1 (`'Absensi 2026-10'!A:H`). */
const a1Range = (title: string) => `'${title.replace(/'/g, "''")}'!A:H`;

export function sheetIdForTitle(title: string): number {
  const period = periodSchema.parse(periodFromSheetTitle(title));
  return SHEET_ID_BASE + Number(period.replace('-', ''));
}

function statusOf(error: unknown): number | undefined {
  const candidate = error as { response?: { status?: unknown }; status?: unknown; code?: unknown } | null;
  for (const value of [candidate?.response?.status, candidate?.status, candidate?.code]) {
    if (typeof value === 'number') return value;
  }
  return undefined;
}

function isTimeout(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'ETIMEDOUT' || code === 'ECONNABORTED' || code === 'ECONNRESET';
}

/** Error Google → pesan aman (tanpa credential, token, atau isi payload). */
export function toSheetsExportError(stage: SheetsExportStage, error: unknown): SheetsExportError {
  if (error instanceof SheetsExportError) return error;
  const status = statusOf(error);
  if (status === 401 || status === 403) {
    return new SheetsExportError(stage, 'Akses ke spreadsheet ditolak. Pastikan service account memiliki akses Editor.');
  }
  if (status === 404) {
    return new SheetsExportError(stage, 'Spreadsheet tujuan tidak ditemukan. Periksa GOOGLE_SHEETS_SPREADSHEET_ID.');
  }
  if (status === 429) {
    return new SheetsExportError(stage, 'Kuota Google Sheets API terlampaui. Coba lagi beberapa saat lagi.');
  }
  if (isTimeout(error)) return new SheetsExportError(stage, 'Google Sheets tidak merespons (timeout). Coba lagi.');
  return new SheetsExportError(stage, 'Gagal menghubungi Google Sheets API. Coba lagi.');
}

const isAlreadyExists = (error: unknown) =>
  statusOf(error) === 400 && /already exists/i.test((error as { message?: string } | null)?.message ?? '');

type Cell = sheets_v4.Schema$CellData;
const textCell = (value: string): Cell => ({ userEnteredValue: { stringValue: value } });
const numberCell = (value: number): Cell => ({ userEnteredValue: { numberValue: value } });
const EMPTY_ROW: sheets_v4.Schema$RowData = { values: Array.from({ length: COLUMN_COUNT }, () => ({})) };

/**
 * Exporter live via Google Sheets API (docs/16 §4–§6).
 * - Tab lama dengan nama numerik diganti namanya saat ekspor ulang.
 * - Report ditulis dalam SATU `spreadsheets.batchUpdate` (all-or-nothing): membuat tab bila
 *   belum ada, menulis header + data, dan menimpa sisa baris lama dengan sel kosong. Report
 *   lama tidak pernah dikosongkan sebelum payload baru siap.
 * - Tanggal/durasi ditulis sebagai teks agar tidak diubah locale spreadsheet.
 */
export class SheetsApiExporter implements GoogleSheetsExporter {
  constructor(
    readonly spreadsheetId: string,
    private readonly client: SheetsApiClient,
  ) {}

  private async findTab(title: string): Promise<SheetMeta | undefined> {
    const sheets = await this.client.listSheets(this.spreadsheetId);
    const period = periodFromSheetTitle(title);
    return sheets.find((sheet) => sheet.title === title)
      ?? sheets.find((sheet) => period && sheet.title === `Absensi ${period}`);
  }

  async getTabState(sheetTitle: string): Promise<SheetTabState> {
    try {
      const tab = await this.findTab(sheetTitle);
      if (!tab) return { exists: false, dataRowCount: 0 };
      const rows = await this.client.readRows(this.spreadsheetId, tab.title);
      return { exists: true, dataRowCount: rows.filter(([no]) => typeof no === 'number').length };
    } catch (error) {
      throw toSheetsExportError('read', error);
    }
  }

  async writeReport(input: WriteReportInput): Promise<WriteReportResult> {
    if (!isManagedSheetTitle(input.sheetTitle)) {
      throw new SheetsExportError('write', 'Tab tujuan bukan tab yang dikelola fitur ekspor.');
    }
    try {
      await this.client.batchUpdate(this.spreadsheetId, await this.buildRequests(input));
    } catch (error) {
      // Dua ekspor bersamaan membuat tab yang sama: baca ulang state lalu tulis sekali lagi.
      if (!isAlreadyExists(error)) throw toSheetsExportError('write', error);
      try {
        await this.client.batchUpdate(this.spreadsheetId, await this.buildRequests(input));
      } catch (retryError) {
        throw toSheetsExportError('write', retryError);
      }
    }
    return { spreadsheetId: this.spreadsheetId, sheetTitle: input.sheetTitle, recordsExported: input.rows.length };
  }

  private async buildRequests({ sheetTitle, header, rows }: WriteReportInput): Promise<sheets_v4.Schema$Request[]> {
    const tab = await this.findTab(sheetTitle);
    const previousRows = tab ? (await this.client.readRows(this.spreadsheetId, tab.title)).length : 0;
    const nextRows = rows.length + REPORT_HEADER_ROWS;
    const span = Math.max(previousRows, nextRows);
    const sheetId = tab?.sheetId ?? sheetIdForTitle(sheetTitle);
    const requests: sheets_v4.Schema$Request[] = [];

    if (!tab) {
      requests.push({
        addSheet: {
          properties: {
            sheetId,
            title: sheetTitle,
            gridProperties: { rowCount: Math.max(nextRows, MIN_GRID_ROWS), columnCount: COLUMN_COUNT },
          },
        },
      });
    } else if (tab.rowCount < span || tab.columnCount < COLUMN_COUNT) {
      requests.push({
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: { rowCount: Math.max(tab.rowCount, span), columnCount: Math.max(tab.columnCount, COLUMN_COUNT) },
          },
          fields: 'gridProperties.rowCount,gridProperties.columnCount',
        },
      });
    }

    if (tab && tab.title !== sheetTitle) {
      requests.push({ updateSheetProperties: { properties: { sheetId, title: sheetTitle }, fields: 'title' } });
    }
    if (tab) {
      requests.push({ unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: COLUMN_COUNT } } });
    }
    const periodLabel = formatPeriodLabel(periodSchema.parse(periodFromSheetTitle(sheetTitle)));
    const dataRows: sheets_v4.Schema$RowData[] = [
      { values: [textCell(`Laporan Absensi · ${periodLabel}`), {}, {}, {}, textCell('MUMTAZ BIMBEL')] },
      { values: header.map(textCell) },
      ...rows.map(([no, ...rest]) => ({ values: [numberCell(no), ...rest.map(textCell)] })),
      // Sel kosong menimpa sisa report lama yang lebih panjang (bagian dari batch yang sama).
      ...Array.from({ length: span - nextRows }, () => EMPTY_ROW),
    ];
    requests.push({
      updateCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: span, startColumnIndex: 0, endColumnIndex: COLUMN_COUNT },
        rows: dataRows,
        fields: 'userEnteredValue,userEnteredFormat',
      },
    });
    requests.push(...reportLayout(sheetId, nextRows));
    return requests;
  }
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function isServiceAccountKey(value: unknown): value is ServiceAccountKey {
  const key = value as Partial<ServiceAccountKey> | null;
  return typeof key?.client_email === 'string' && typeof key.private_key === 'string';
}

/** Klien Google Sheets API v4 dengan service account (scope spreadsheets saja). */
export function createSheetsApiClient(credentials: ServiceAccountKey, timeoutMs: number): SheetsApiClient {
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth, timeout: timeoutMs });
  return {
    async listSheets(spreadsheetId) {
      const { data } = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))',
      });
      return (data.sheets ?? []).map((sheet) => ({
        sheetId: sheet.properties?.sheetId ?? 0,
        title: sheet.properties?.title ?? '',
        rowCount: sheet.properties?.gridProperties?.rowCount ?? 0,
        columnCount: sheet.properties?.gridProperties?.columnCount ?? 0,
      }));
    },
    async readRows(spreadsheetId, title) {
      const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range: a1Range(title), majorDimension: 'ROWS', valueRenderOption: 'UNFORMATTED_VALUE' });
      return data.values ?? [];
    },
    async batchUpdate(spreadsheetId, requests) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    },
  };
}

/**
 * Exporter live hanya bila `GOOGLE_SHEETS_EXPORT_ENABLED=true` dan key file ada.
 * Selain itu `null` → endpoint ekspor mengembalikan 503 (tidak ada fake success).
 */
export function createSheetsExporter(env: Env, logger: Logger): GoogleSheetsExporter | null {
  if (!env.GOOGLE_SHEETS_EXPORT_ENABLED || !env.GOOGLE_SHEETS_SPREADSHEET_ID || !env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) return null;
  const keyFile = resolve(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  if (!existsSync(keyFile)) {
    logger.warn('sheets_key_file_missing', { message: 'GOOGLE_SERVICE_ACCOUNT_KEY_FILE tidak ditemukan; ekspor dinonaktifkan' });
    return null;
  }
  let credentials: unknown;
  try {
    credentials = JSON.parse(readFileSync(keyFile, 'utf8'));
  } catch {
    credentials = null;
  }
  if (!isServiceAccountKey(credentials)) {
    // Isi file tidak pernah dicatat.
    logger.warn('sheets_key_file_invalid', { message: 'GOOGLE_SERVICE_ACCOUNT_KEY_FILE bukan key service account yang valid; ekspor dinonaktifkan' });
    return null;
  }
  return new SheetsApiExporter(env.GOOGLE_SHEETS_SPREADSHEET_ID, createSheetsApiClient(credentials, env.GOOGLE_SHEETS_TIMEOUT_MS));
}
