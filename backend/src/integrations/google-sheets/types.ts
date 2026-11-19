import type { SheetExportHeader, SheetExportRow } from '@mumtaz/contracts';

/**
 * Port ekspor laporan bulanan ke Google Sheets (docs/16).
 * Implementasi live (`googleapis`) dibuat pada Phase 08; test memakai fake in-memory.
 * Hanya dipanggil dari alur ekspor Admin, tidak pernah dari submit Tutor.
 */
export interface SheetTabState {
  exists: boolean;
  /** Jumlah baris data di bawah header (0 bila tab kosong/hanya header). */
  dataRowCount: number;
}

export interface WriteReportInput {
  sheetTitle: string;
  header: readonly SheetExportHeader[];
  rows: readonly SheetExportRow[];
}

export interface WriteReportResult {
  spreadsheetId: string;
  sheetTitle: string;
  /** Baris data yang tertulis, tanpa header. */
  recordsExported: number;
}

export interface GoogleSheetsExporter {
  readonly spreadsheetId: string;
  /** Preflight read: dipakai untuk aturan `409 EMPTY_EXPORT_CONFIRMATION_REQUIRED`. */
  getTabState(sheetTitle: string): Promise<SheetTabState>;
  /**
   * Membuat tab bila belum ada, lalu MENGGANTI seluruh isi A:H secara atomik
   * (bukan append). Bila gagal, isi tab lama harus tetap utuh.
   */
  writeReport(input: WriteReportInput): Promise<WriteReportResult>;
}

export type SheetsExportStage = 'read' | 'write';

/** Error terstruktur dengan pesan aman (tanpa credential/payload sensitif). */
export class SheetsExportError extends Error {
  readonly stage: SheetsExportStage;
  readonly safeMessage: string;

  constructor(stage: SheetsExportStage, safeMessage: string) {
    super(safeMessage);
    this.name = 'SheetsExportError';
    this.stage = stage;
    this.safeMessage = safeMessage;
  }
}
