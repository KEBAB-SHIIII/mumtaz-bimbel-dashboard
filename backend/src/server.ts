import 'dotenv/config';
import { createApp } from './app.js';
import { EnvValidationError, integrationStatus, parseEnv } from './config/env.js';

function main() {
  const env = parseEnv(process.env);
  const app = createApp(env);
  const integrations = integrationStatus(env);

  const server = app.listen(env.PORT, () => {
    console.log(`[api] listening on :${env.PORT}${env.API_PREFIX} (${env.NODE_ENV})`);
    console.log(
      `[api] google sheets export: ${integrations.googleSheetsExport}, anomaly provider: ${integrations.anomalyProvider}`,
    );
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
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
