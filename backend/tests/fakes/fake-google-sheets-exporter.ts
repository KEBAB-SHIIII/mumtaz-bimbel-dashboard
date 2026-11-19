import { isManagedSheetTitle } from '@mumtaz/contracts';
import {
  SheetsExportError,
  type GoogleSheetsExporter,
  type SheetTabState,
  type SheetsExportStage,
  type WriteReportInput,
  type WriteReportResult,
} from '../../src/integrations/google-sheets/types.js';

type Cell = string | number;

/**
 * FAKE in-memory Google Sheets exporter — test double, BUKAN integrasi live.
 * Mensimulasikan create tab, replace atomik, dan kegagalan read/write.
 */
export class FakeGoogleSheetsExporter implements GoogleSheetsExporter {
  readonly label = 'FAKE_GOOGLE_SHEETS_EXPORTER';
  readonly spreadsheetId: string;
  readonly calls: { method: 'getTabState' | 'writeReport'; sheetTitle: string }[] = [];

  private readonly tabs = new Map<string, Cell[][]>();
  private readonly pendingFailures = new Set<SheetsExportStage>();

  constructor(spreadsheetId = 'fake-spreadsheet-id') {
    this.spreadsheetId = spreadsheetId;
  }

  /** Buat kegagalan satu kali pada tahap tertentu (permission/quota/API error). */
  failNext(stage: SheetsExportStage): void {
    this.pendingFailures.add(stage);
  }

  /** Isi tab langsung (mis. untuk mensimulasikan laporan lama yang sudah ada). */
  seedTab(sheetTitle: string, values: Cell[][]): void {
    this.tabs.set(sheetTitle, values.map((row) => [...row]));
  }

  getTab(sheetTitle: string): Cell[][] | undefined {
    return this.tabs.get(sheetTitle)?.map((row) => [...row]);
  }

  tabTitles(): string[] {
    return [...this.tabs.keys()];
  }

  async getTabState(sheetTitle: string): Promise<SheetTabState> {
    this.calls.push({ method: 'getTabState', sheetTitle });
    this.throwIfFailing('read');
    const values = this.tabs.get(sheetTitle);
    return {
      exists: values !== undefined,
      dataRowCount: values ? Math.max(values.length - 1, 0) : 0,
    };
  }

  async writeReport({ sheetTitle, header, rows }: WriteReportInput): Promise<WriteReportResult> {
    this.calls.push({ method: 'writeReport', sheetTitle });
    if (!isManagedSheetTitle(sheetTitle)) {
      throw new SheetsExportError('write', 'Tab tujuan bukan tab yang dikelola fitur ekspor.');
    }
    // Gagal sebelum write: isi tab lama tetap utuh.
    this.throwIfFailing('write');
    this.tabs.set(sheetTitle, [[...header], ...rows.map((row) => [...row])]);
    return { spreadsheetId: this.spreadsheetId, sheetTitle, recordsExported: rows.length };
  }

  private throwIfFailing(stage: SheetsExportStage): void {
    if (this.pendingFailures.delete(stage)) {
      throw new SheetsExportError(stage, `Simulasi kegagalan Google Sheets (${stage}).`);
    }
  }
}
