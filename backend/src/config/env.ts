import { z } from 'zod';
import { DURATION_MINUTES_TECHNICAL_MAX } from '@mumtaz/contracts';

// Nilai kosong di .env ("KEY=") diperlakukan sebagai tidak diset.
const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

const positiveInt = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const postgresUrl = z
  .url()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), {
    message: 'Harus berupa connection string PostgreSQL',
  });

const PLACEHOLDER_PREFIX = 'replace';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
export const isHttpsOrigin = (origin: string) => new URL(origin).protocol === 'https:';
export const isLoopbackOrigin = (origin: string) => LOOPBACK_HOSTS.has(new URL(origin).hostname);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: positiveInt(3001),
    API_PREFIX: z.string().startsWith('/').default('/api/v1'),
    FRONTEND_ORIGIN: z.url().transform((value) => new URL(value).origin),
    /**
     * Jumlah reverse proxy tepercaya di depan API (Express `trust proxy`).
     * Default `0`: X-Forwarded-For diabaikan agar IP untuk rate limit tidak bisa dipalsukan.
     */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    /**
     * Folder hasil `vite build` frontend. Bila diisi, API ikut menyajikan SPA dari origin yang
     * sama (satu service; cookie SameSite tetap first-party). Kosong = frontend di-host terpisah.
     */
    FRONTEND_DIST_DIR: optionalString,

    DATABASE_URL: postgresUrl,
    DATABASE_MIGRATION_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      postgresUrl.optional(),
    ),

    SESSION_SECRET: z.string().min(1),
    PARENT_ACCESS_CODE_PEPPER: z.string().min(1),
    BOOTSTRAP_ADMIN_USERNAME: optionalString,
    BOOTSTRAP_ADMIN_PASSWORD: optionalString,
    // Default teknis development, bukan kebijakan bisnis final (docs/04 §1).
    SESSION_IDLE_TIMEOUT_MINUTES: positiveInt(480),
    AUTH_RATE_LIMIT_MAX: positiveInt(5),
    AUTH_RATE_LIMIT_WINDOW_MINUTES: positiveInt(15),
    SEED_TUTOR_PASSWORD: optionalString,

    /**
     * Batas atas durasi sesi (menit) yang diterima saat submit/revisi. Default = batas teknis
     * kontrak (24 jam); batas bisnis UMKM belum ditetapkan (O-12). Durasi di atas ambang
     * anomali tetap diterima dan hanya menjadi finding (lihat ANOMALY_DURATION_OUTLIER_MINUTES).
     */
    /** Tarif honor tunggal per sesi (rupiah, D-24); dikunci ke sesi saat disetujui. */
    HONOR_RATE_PER_SESSION: positiveInt(50_000),

    ATTENDANCE_MAX_DURATION_MINUTES: z.coerce.number().int().min(1).max(DURATION_MINUTES_TECHNICAL_MAX).default(DURATION_MINUTES_TECHNICAL_MAX),

    GOOGLE_SHEETS_EXPORT_ENABLED: booleanFlag,
    GOOGLE_SHEETS_SPREADSHEET_ID: optionalString,
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE: optionalString,
    /** Batas waktu satu panggilan Google Sheets API (ms). */
    GOOGLE_SHEETS_TIMEOUT_MS: positiveInt(20_000),

    GEMINI_API_KEY: optionalString,
    GEMINI_MODEL: optionalString,
    // Heuristik demo duration_outlier (O-03/O-12 masih terbuka).
    ANOMALY_DURATION_OUTLIER_MINUTES: positiveInt(180),
    /** Batas waktu satu panggilan provider anomali; lewat batas → `failed`. */
    ANOMALY_PROVIDER_TIMEOUT_MS: positiveInt(20_000),
  })
  .superRefine((env, ctx) => {
    if (env.SESSION_SECRET === env.PARENT_ACCESS_CODE_PEPPER) {
      ctx.addIssue({
        code: 'custom',
        path: ['PARENT_ACCESS_CODE_PEPPER'],
        message: 'Harus berbeda dari SESSION_SECRET',
      });
    }

    if (env.GOOGLE_SHEETS_EXPORT_ENABLED) {
      for (const key of [
        'GOOGLE_SHEETS_SPREADSHEET_ID',
        'GOOGLE_SERVICE_ACCOUNT_KEY_FILE',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Wajib diisi bila GOOGLE_SHEETS_EXPORT_ENABLED=true',
          });
        }
      }
    }

    if (env.NODE_ENV === 'production') {
      for (const key of ['SESSION_SECRET', 'PARENT_ACCESS_CODE_PEPPER'] as const) {
        const value = env[key];
        if (value.length < 32 || value.startsWith(PLACEHOLDER_PREFIX)) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Production membutuhkan secret acak minimal 32 karakter',
          });
        }
      }
      // Loopback (laptop owner) boleh HTTP; domain publik wajib HTTPS.
      if (!isHttpsOrigin(env.FRONTEND_ORIGIN) && !isLoopbackOrigin(env.FRONTEND_ORIGIN)) {
        ctx.addIssue({ code: 'custom', path: ['FRONTEND_ORIGIN'], message: 'Production wajib memakai origin HTTPS (kecuali localhost)' });
      }
      for (const key of ['DATABASE_URL', 'DATABASE_MIGRATION_URL'] as const) {
        const value = env[key];
        if (value && !/[?&]sslmode=(require|verify-ca|verify-full)\b/.test(value)) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'Production wajib memakai koneksi TLS (sslmode=require/verify-full)' });
        }
      }
      const adminPassword = env.BOOTSTRAP_ADMIN_PASSWORD;
      if (adminPassword && (adminPassword.length < 12 || adminPassword.startsWith(PLACEHOLDER_PREFIX))) {
        ctx.addIssue({
          code: 'custom',
          path: ['BOOTSTRAP_ADMIN_PASSWORD'],
          message: 'Production membutuhkan password Admin minimal 12 karakter (bukan placeholder)',
        });
      }
      if (env.SEED_TUTOR_PASSWORD) {
        ctx.addIssue({
          code: 'custom',
          path: ['SEED_TUTOR_PASSWORD'],
          message: 'Hanya untuk development; jangan diset di production',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Konfigurasi environment tidak valid:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/**
 * Validasi environment. Pesan error hanya memuat nama variabel dan alasan,
 * tidak pernah nilai, agar secret tidak bocor ke log.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

/** Status integrasi eksternal. Tidak ada fake success: belum dikonfigurasi = nonaktif. */
export function integrationStatus(env: Env) {
  return {
    googleSheetsExport: env.GOOGLE_SHEETS_EXPORT_ENABLED ? 'configured' : 'disabled',
    anomalyProvider: env.GEMINI_API_KEY && env.GEMINI_MODEL ? 'gemini' : 'not_configured',
  } as const;
}
