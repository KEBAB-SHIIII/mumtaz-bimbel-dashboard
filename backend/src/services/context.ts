import type { Database } from '../db/client.js';

/** Dependensi yang dibagikan ke semua service (di-inject agar mudah dites). */
export interface ServiceContext {
  db: Database;
  /** Jam yang dapat diganti di test (O-14 tanggal masa depan, timestamp). */
  now: () => Date;
  parentAccessCodePepper: string;
  attendance: {
    /** `ATTENDANCE_MAX_DURATION_MINUTES` — batas teknis/konfigurasi, bukan aturan UMKM (O-12). */
    maxDurationMinutes: number;
  };
}
