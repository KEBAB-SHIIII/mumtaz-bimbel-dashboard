import 'dotenv/config';
import { createApp } from './app.js';
import { EnvValidationError, integrationStatus, parseEnv } from './config/env.js';
import { createSessionStore } from './config/session.js';
import { createDatabase } from './db/client.js';
import { createLogger } from './lib/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function main() {
  const env = parseEnv(process.env);
  const logger = createLogger();
  const database = createDatabase(env.DATABASE_URL);
  const sessionStore = createSessionStore(database.sessionPool, {
    pruneIntervalSeconds: 15 * 60,
    onError: (message) => logger.error('session_store_error', { error_message: message }),
  });

  const app = createApp({ env, db: database.db, sessionStore, logger });
  const integrations = integrationStatus(env);

  const server = app.listen(env.PORT, () => {
    logger.info('api_listening', {
      port: env.PORT,
      prefix: env.API_PREFIX,
      node_env: env.NODE_ENV,
      google_sheets_export: integrations.googleSheetsExport,
      anomaly_provider: integrations.anomalyProvider,
    });
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('api_shutdown', { signal });
    const force = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
    force.unref();
    server.close(() => {
      database
        .close()
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
