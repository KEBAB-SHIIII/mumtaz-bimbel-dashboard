import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';

export type AppConfig = Pick<Env, 'API_PREFIX' | 'FRONTEND_ORIGIN'>;

/**
 * Membuat Express app tanpa membuka koneksi DB/integrasi apa pun,
 * sehingga bisa diuji dengan Supertest secara offline.
 */
export function createApp(config: AppConfig) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.FRONTEND_ORIGIN,
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.use(healthRouter);

  app.use(config.API_PREFIX, api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
