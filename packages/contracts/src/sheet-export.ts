import { z } from 'zod';
import { paginationQuerySchema, timestampSchema, uuidSchema, type IsoDate } from './common.js';
import { exportRunStatusSchema } from './enums.js';
import { periodSchema, type Period } from './period.js';

/** Header ekspor standar — tepat delapan kolom, urutan tetap (docs/16 §2). */
export const SHEET_EXPORT_HEADERS = [
  'no',
  'nama tutor',
  'nama murid',
  'kelas',
  'asal sekolah',
  'mata pelajaran',
  'tanggal les',
  'durasi les',
] as const;

export type SheetExportHeader = (typeof SHEET_EXPORT_HEADERS)[number];

/** Satu baris data ekspor, sejajar dengan `SHEET_EXPORT_HEADERS`. */
export const sheetExportRowSchema = z.tuple([
  z.number().int().min(1),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  z.string().regex(/^\d+ menit$/),
]);
export type SheetExportRow = z.infer<typeof sheetExportRowSchema>;

export const SHEET_TITLE_PREFIX = 'Absensi ';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function sheetTitleForPeriod(period: Period): string {
  const [year, month] = periodSchema.parse(period).split('-');
  return `${SHEET_TITLE_PREFIX}${MONTHS[Number(month) - 1]} ${year}`;
}

export function periodFromSheetTitle(title: string): Period | undefined {
  const match = /^Absensi ([A-Za-z]+) (\d{4})$/.exec(title);
  if (!match) return undefined;
  const month = MONTHS.indexOf(match[1] ?? '') + 1;
  if (!month) return undefined;
  return `${match[2]}-${String(month).padStart(2, '0')}`;
}

export function isManagedSheetTitle(title: string): boolean {
  return periodFromSheetTitle(title) !== undefined;
}

/** Working default O-11: `DD/MM/YYYY`; operasi string agar tanggal tidak bergeser timezone. */
export function formatSheetDate(lessonDate: IsoDate): string {
  const [year, month, day] = lessonDate.split('-');
  return `${day}/${month}/${year}`;
}

/** Working default O-11: `N menit`. */
export function formatSheetDuration(durationMinutes: number): string {
  return `${durationMinutes} menit`;
}

/** `POST /admin/reports/google-sheets/attendance`. */
export const sheetExportRequestSchema = z.strictObject({
  period: periodSchema,
  confirm_empty_replace: z.boolean().default(false),
});
export type SheetExportRequest = z.infer<typeof sheetExportRequestSchema>;

export const sheetExportRunSchema = z.object({
  id: uuidSchema,
  period: periodSchema,
  spreadsheet_id: z.string().min(1),
  spreadsheet_url: z.url(),
  sheet_title: z.string(),
  records_exported: z.number().int().min(0),
  status: exportRunStatusSchema,
  safe_error_message: z.string().nullable(),
  started_at: timestampSchema,
  /** `null` selama `running`. */
  completed_at: timestampSchema.nullable(),
});
export type SheetExportRun = z.infer<typeof sheetExportRunSchema>;

export const sheetExportResponseSchema = z.object({
  export: sheetExportRunSchema.pick({
    id: true,
    period: true,
    spreadsheet_id: true,
    spreadsheet_url: true,
    sheet_title: true,
    records_exported: true,
    status: true,
    completed_at: true,
  }),
});
export type SheetExportResponse = z.infer<typeof sheetExportResponseSchema>;

export const sheetExportHistoryQuerySchema = paginationQuerySchema.extend({
  period: periodSchema.optional(),
});
export type SheetExportHistoryQuery = z.infer<typeof sheetExportHistoryQuerySchema>;

export function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;
}
