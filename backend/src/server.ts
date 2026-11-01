import 'dotenv/config';
import { createApp } from './app.js';
import { EnvValidationError, integrationStatus, parseEnv } from './config/env.js';
import { createSessionStore } from './config/session.js';
import { createDatabase } from './db/client.js';
import { createAnomalyDetector } from './integrations/anomaly/create-detector.js';
import { createSheetsExporter } from './integrations/google-sheets/sheets-api-exporter.js';
import { safeErrorMessage } from './lib/db-errors.js';
import { createLogger } from './lib/logger.js';
import { analyzeSession, listPendingAnalysis } from './services/anomaly/anomaly-service.js';
import { AnomalyWorker } from './services/anomaly/anomaly-worker.js';
import { expireStaleRuns } from './services/exports/attendance-export-service.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function main() {
  const env = parseEnv(process.env);
  const logger = createLogger();
  const database = createDatabase(env.DATABASE_URL);
  const sessionStore = createSessionStore(database.sessionPool, {
    pruneIntervalSeconds: 15 * 60,
    onError: (message) => logger.error('session_store_error', { error_message: message }),
  });

  const detector = createAnomalyDetector(env);
  const anomalyWorker = new AnomalyWorker(
    (sessionId) =>
      analyzeSession(
        {
          db: database.db,
          detector,
          config: {
            durationOutlierMinutes: env.ANOMALY_DURATION_OUTLIER_MINUTES,
            lateStartAfter: env.ANOMALY_LATE_START_AFTER,
          },
          timeoutMs: env.ANOMALY_PROVIDER_TIMEOUT_MS,
          logger,
        },
        sessionId,
      ),
    logger,
  );

  const sheetsExporter = createSheetsExporter(env, logger);
  const app = createApp({ env, db: database.db, sessionStore, logger, anomalyQueue: anomalyWorker, sheetsExporter });
  const integrations = integrationStatus(env);

  const server = app.listen(env.PORT, () => {
    logger.info('api_listening', {
      port: env.PORT,
      prefix: env.API_PREFIX,
      node_env: env.NODE_ENV,
      google_sheets_export: sheetsExporter ? integrations.googleSheetsExport : 'disabled',
      anomaly_provider: integrations.anomalyProvider,
    });
    // Run ekspor yang tertinggal `running` akibat restart tidak boleh mengunci periode.
    expireStaleRuns(database.db, new Date())
      .then((count) => count > 0 && logger.warn('sheets_export_stale_runs_expired', { count }))
      .catch((error: unknown) => logger.error('sheets_export_expire_failed', { error_message: safeErrorMessage(error) }));
    // Restart tidak boleh membuat status analisis menggantung.
    anomalyWorker
      .resume(() => listPendingAnalysis(database.db))
      .catch((error: unknown) => logger.error('anomaly_resume_failed', { error_message: safeErrorMessage(error) }));
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('api_shutdown', { signal });
    const force = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
    force.unref();
    server.close(() => {
      anomalyWorker
        .stop()
        .then(() => database.close())
        .catch((error: unknown) => logger.error('db_close_failed', { error_message: String(error) }))
        .finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

try {
  main();
} catch (error) {
  if (error instanceof EnvValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
