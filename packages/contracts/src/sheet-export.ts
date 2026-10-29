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

export function sheetTitleForPeriod(period: Period): string {
  return `${SHEET_TITLE_PREFIX}${periodSchema.parse(period)}`;
}

/** Hanya tab dengan pola ini yang boleh disentuh fitur ekspor. */
export function isManagedSheetTitle(title: string): boolean {
  return /^Absensi \d{4}-(0[1-9]|1[0-2])$/.test(title);
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
