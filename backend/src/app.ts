import cors from 'cors';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { csrfProtection } from './auth/csrf.js';
import { loadAuth } from './auth/middleware.js';
import { createAuthRateLimiters } from './auth/rate-limit.js';
import './auth/session-types.js';
import type { Env } from './config/env.js';
import { buildSessionConfig } from './config/session.js';
import type { Database } from './db/client.js';
import type { Logger } from './lib/logger.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { parentRouter } from './routes/parent.js';
import { tutorRouter } from './routes/tutor.js';
import type { AnomalyQueue } from './services/anomaly/anomaly-worker.js';
import type { ServiceContext } from './services/context.js';

export interface AppDependencies {
  env: Env;
  db: Database;
  sessionStore: session.Store;
  logger: Logger;
  /** Antrean analisis anomali setelah commit (default: tidak ada analisis). */
  anomalyQueue?: AnomalyQueue;
  /** Jam yang dapat di-inject (default: jam sistem). */
  now?: () => Date;
}

const NO_ANOMALY_QUEUE: AnomalyQueue = { enqueue: () => undefined };

/**
 * Komposisi Express app. Semua dependensi eksternal di-inject sehingga app dapat
 * diuji offline (PGlite + session store yang sama dengan production).
 */
export function createApp({ env, db, sessionStore, logger, anomalyQueue = NO_ANOMALY_QUEUE, now = () => new Date() }: AppDependencies) {
  const ctx: ServiceContext = { db, now, parentAccessCodePepper: env.PARENT_ACCESS_CODE_PEPPER };
  const sessionConfig = buildSessionConfig(env);
  const limiters = createAuthRateLimiters({
    max: env.AUTH_RATE_LIMIT_MAX,
    windowMinutes: env.AUTH_RATE_LIMIT_WINDOW_MINUTES,
  });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  // Health tidak menyentuh session/DB agar tetap murah untuk probe.
  api.use(healthRouter);
  api.use(
    session({
      ...sessionConfig,
      store: sessionStore,
      proxy: env.TRUST_PROXY > 0,
    }),
  );
  api.use(csrfProtection(env.FRONTEND_ORIGIN));
  api.use(loadAuth(ctx));
  api.use(authRouter(ctx, limiters, sessionConfig));
  api.use(adminRouter(ctx));
  api.use(tutorRouter(ctx, limiters, anomalyQueue));
  api.use(parentRouter(ctx));

  app.use(env.API_PREFIX, api);
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
