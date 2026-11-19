import type { Logger } from '../../lib/logger.js';
import { safeErrorMessage } from '../../lib/db-errors.js';
import type { AnalysisOutcome } from './anomaly-service.js';

export interface AnomalyQueue {
  enqueue(sessionId: string): void;
}

/**
 * Worker in-process untuk analisis anomali setelah commit (docs/03 §5).
 * - Baseline satu instance: deduplikasi dalam proses (tidak memproses sesi yang
 *   sama dua kali bersamaan). Scale-out butuh claim/lock PostgreSQL atau job queue.
 * - Sesi yang di-enqueue ulang saat sedang diproses (mis. revisi) dijalankan sekali lagi.
 * - Error tidak pernah menjatuhkan proses dan tidak memengaruhi penyimpanan sesi.
 */
export class AnomalyWorker implements AnomalyQueue {
  private readonly queue: string[] = [];
  private readonly queued = new Set<string>();
  private readonly running = new Set<string>();
  private readonly rerun = new Set<string>();
  private active = 0;
  private stopped = false;
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly analyze: (sessionId: string) => Promise<AnalysisOutcome>,
    private readonly logger: Logger,
    private readonly concurrency = 1,
  ) {}

  enqueue(sessionId: string): void {
    if (this.stopped) return;
    if (this.running.has(sessionId)) {
      this.rerun.add(sessionId);
      return;
    }
    if (this.queued.has(sessionId)) return;
    this.queued.add(sessionId);
    this.queue.push(sessionId);
    this.pump();
  }

  /** Lanjutkan sesi yang masih `pending` (dipanggil saat startup). */
  async resume(loadPending: () => Promise<string[]>): Promise<number> {
    const ids = await loadPending();
    for (const id of ids) this.enqueue(id);
    if (ids.length > 0) this.logger.info('anomaly_resume_pending', { count: ids.length });
    return ids.length;
  }

  /** Selesai bila antrean kosong dan tidak ada analisis berjalan. */
  onIdle(): Promise<void> {
    if (this.active === 0 && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** Hentikan penerimaan job baru dan tunggu job berjalan selesai (graceful shutdown). */
  async stop(): Promise<void> {
    this.stopped = true;
    this.queue.length = 0;
    this.queued.clear();
    await this.onIdle();
  }

  private pump(): void {
    while (!this.stopped && this.active < this.concurrency && this.queue.length > 0) {
      const sessionId = this.queue.shift();
      if (!sessionId) break;
      this.queued.delete(sessionId);
      this.running.add(sessionId);
      this.active += 1;
      void this.run(sessionId);
    }
  }

  private async run(sessionId: string): Promise<void> {
    try {
      const outcome = await this.analyze(sessionId);
      this.logger.info('anomaly_analysis_done', { session_id: sessionId, outcome });
    } catch (error) {
      this.logger.error('anomaly_worker_error', { session_id: sessionId, error_message: safeErrorMessage(error) });
    } finally {
      this.running.delete(sessionId);
      this.active -= 1;
      if (this.rerun.delete(sessionId)) this.enqueue(sessionId);
      this.pump();
      if (this.active === 0 && this.queue.length === 0) {
        const waiters = this.idleWaiters;
        this.idleWaiters = [];
        for (const resolve of waiters) resolve();
      }
    }
  }
}
