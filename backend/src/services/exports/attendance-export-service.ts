import { and, count, desc, eq, lt } from 'drizzle-orm';
import {
  SHEET_EXPORT_HEADERS,
  formatSheetDate,
  formatSheetDuration,
  sheetTitleForPeriod,
  spreadsheetUrl,
  type Paginated,
  type Period,
  type SheetExportHistoryQuery,
  type SheetExportRequest,
  type SheetExportResponse,
  type SheetExportRow,
  type SheetExportRun,
} from '@mumtaz/contracts';
import type { Database } from '../../db/client.js';
import { sheetExportRuns } from '../../db/schema.js';
import { PG_UNIQUE_VIOLATION, isPgError, safeErrorMessage } from '../../lib/db-errors.js';
import { iso, isoOrNull } from '../../lib/format.js';
import { HttpError } from '../../lib/http-error.js';
import type { Logger } from '../../lib/logger.js';
import { pageOffset, paginated } from '../../lib/pagination.js';
import { SheetsExportError, type GoogleSheetsExporter } from '../../integrations/google-sheets/types.js';
import type { ServiceContext } from '../context.js';
import { sessionsInPeriod } from '../attendance/session-query.js';

/** Run `running` lebih tua dari ini dianggap terhenti (mis. proses mati di tengah ekspor). */
export const STALE_RUN_MINUTES = 10;
const STALE_RUN_MESSAGE = 'Proses ekspor terhenti sebelum selesai (mis. server restart). Silakan ekspor ulang.';
const REPORT_TYPE = 'attendance';

export interface ExportDeps {
  /** `null` = integrasi belum dikonfigurasi → 503 tanpa membuat run. */
  exporter: GoogleSheetsExporter | null;
  logger: Logger;
}

const unavailable = (message: string) => new HttpError(503, 'INTEGRATION_UNAVAILABLE', message);

/**
 * Baris laporan delapan kolom (docs/16 §2): SEMUA sesi pada periode (`lesson_date`) tanpa
 * filter status review (O-08 final), urut lesson_date → tutor → murid → mapel → id sesi,
 * `no` dibangun ulang 1..N. Tidak memuat status, materi, anomali, honor, atau ID internal.
 */
export async function buildAttendanceExportRows(db: Database, period: Period): Promise<SheetExportRow[]> {
  const rows = await sessionsInPeriod(db, period);
  return rows
    .sort(
      (a, b) =>
        a.lesson_date.localeCompare(b.lesson_date) ||
        a.tutor_name.localeCompare(b.tutor_name) ||
        a.student_name.localeCompare(b.student_name) ||
        a.subject_name.localeCompare(b.subject_name) ||
        a.id.localeCompare(b.id),
    )
    .map((row, index) => [
      index + 1,
      row.tutor_name,
      row.student_name,
      row.grade,
      row.school_name,
      row.subject_name,
      formatSheetDate(row.lesson_date),
      formatSheetDuration(row.duration_minutes),
    ]);
}

/** Tandai run `running` yang terhenti sebagai `failed` agar periode tidak terkunci selamanya. */
export async function expireStaleRuns(db: Database, now: Date): Promise<number> {
  const expired = await db
    .update(sheetExportRuns)
    .set({ status: 'failed', safe_error_message: STALE_RUN_MESSAGE, completed_at: now })
    .where(
      and(
        eq(sheetExportRuns.status, 'running'),
        lt(sheetExportRuns.started_at, new Date(now.getTime() - STALE_RUN_MINUTES * 60_000)),
      ),
    )
    .returning({ id: sheetExportRuns.id });
  return expired.length;
}

type RunRow = typeof sheetExportRuns.$inferSelect;

function toRun(row: RunRow): SheetExportRun {
  return {
    id: row.id,
    period: row.period,
    spreadsheet_id: row.spreadsheet_id,
    spreadsheet_url: spreadsheetUrl(row.spreadsheet_id),
    sheet_title: row.sheet_title,
    records_exported: row.records_exported,
    status: row.status as SheetExportRun['status'],
    safe_error_message: row.safe_error_message,
    started_at: iso(row.started_at),
    completed_at: isoOrNull(row.completed_at),
  };
}

/**
 * `POST /admin/reports/google-sheets/attendance` (docs/04 §8, docs/16 §5).
 * Urutan: konfigurasi → query Neon → run `running` (kunci per periode) → preflight tab →
 * aturan ekspor kosong (409 tanpa log) → tulis atomik → `succeeded`/`failed`.
 * Kegagalan Google tidak pernah mengubah data Neon selain log run.
 */
export async function exportAttendanceToSheets(
  ctx: ServiceContext,
  deps: ExportDeps,
  adminUserId: string,
  input: SheetExportRequest,
): Promise<SheetExportResponse> {
  const { exporter } = deps;
  if (!exporter) {
    throw unavailable('Ekspor Google Sheets belum dikonfigurasi. Hubungi pengelola sistem.');
  }

  const sheetTitle = sheetTitleForPeriod(input.period);
  const rows = await buildAttendanceExportRows(ctx.db, input.period);

  await expireStaleRuns(ctx.db, ctx.now());
  let run: RunRow;
  try {
    const [inserted] = await ctx.db
      .insert(sheetExportRuns)
      .values({
        exported_by_user_id: adminUserId,
        report_type: REPORT_TYPE,
        period: input.period,
        spreadsheet_id: exporter.spreadsheetId,
        sheet_title: sheetTitle,
        status: 'running',
        started_at: ctx.now(),
      })
      .returning();
    if (!inserted) throw new Error('Insert run ekspor gagal');
    run = inserted;
  } catch (error) {
    if (isPgError(error, PG_UNIQUE_VIOLATION, 'sheet_export_runs_one_running_per_period')) {
      throw new HttpError(409, 'CONFLICT', `Ekspor ${sheetTitle} sedang berjalan. Tunggu hingga selesai lalu coba lagi.`);
    }
    throw error;
  }

  const finish = async (patch: Partial<typeof sheetExportRuns.$inferInsert>) => {
    const [updated] = await ctx.db
      .update(sheetExportRuns)
      .set({ ...patch, completed_at: ctx.now() })
      .where(eq(sheetExportRuns.id, run.id))
      .returning();
    return updated ?? run;
  };
  const fail = async (error: unknown): Promise<never> => {
    const safe = error instanceof SheetsExportError ? error.safeMessage : 'Ekspor gagal karena kesalahan tak terduga.';
    deps.logger.warn('sheets_export_failed', {
      run_id: run.id,
      period: input.period,
      stage: error instanceof SheetsExportError ? error.stage : 'unexpected',
      error_message: error instanceof SheetsExportError ? error.safeMessage : safeErrorMessage(error),
    });
    await finish({ status: 'failed', safe_error_message: safe, records_exported: 0 });
    throw unavailable(safe);
  };

  let tab;
  try {
    tab = await exporter.getTabState(sheetTitle);
  } catch (error) {
    return fail(error);
  }

  if (rows.length === 0 && tab.dataRowCount > 0 && !input.confirm_empty_replace) {
    // Preflight konfirmasi, bukan percobaan ekspor: tidak boleh meninggalkan log.
    await ctx.db.delete(sheetExportRuns).where(eq(sheetExportRuns.id, run.id));
    throw new HttpError(
      409,
      'EMPTY_EXPORT_CONFIRMATION_REQUIRED',
      `Tidak ada sesi pada periode ini, sedangkan tab ${sheetTitle} berisi ${tab.dataRowCount} baris. Konfirmasi untuk mengganti isinya dengan laporan kosong.`,
    );
  }

  try {
    const result = await exporter.writeReport({ sheetTitle, header: SHEET_EXPORT_HEADERS, rows });
    const done = await finish({ status: 'succeeded', records_exported: result.recordsExported, safe_error_message: null });
    const exported = toRun(done);
    return {
      export: {
        id: exported.id,
        period: exported.period,
        spreadsheet_id: exported.spreadsheet_id,
        spreadsheet_url: exported.spreadsheet_url,
        sheet_title: exported.sheet_title,
        records_exported: exported.records_exported,
        status: exported.status,
        completed_at: exported.completed_at,
      },
    };
  } catch (error) {
    return fail(error);
  }
}

/** `GET /admin/reports/google-sheets/attendance/history` — terbaru dulu. */
export async function listExportHistory(ctx: ServiceContext, query: SheetExportHistoryQuery): Promise<Paginated<SheetExportRun>> {
  const where = and(eq(sheetExportRuns.report_type, REPORT_TYPE), query.period ? eq(sheetExportRuns.period, query.period) : undefined);
  const [rows, [total]] = await Promise.all([
    ctx.db
      .select()
      .from(sheetExportRuns)
      .where(where)
      .orderBy(desc(sheetExportRuns.started_at), desc(sheetExportRuns.id))
      .limit(query.page_size)
      .offset(pageOffset(query)),
    ctx.db.select({ value: count() }).from(sheetExportRuns).where(where),
  ]);
  return paginated(rows.map(toRun), query, total?.value ?? 0);
}
