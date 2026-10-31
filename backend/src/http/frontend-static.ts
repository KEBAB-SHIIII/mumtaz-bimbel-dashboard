import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { Router } from 'express';

/**
 * Menyajikan build SPA frontend dari origin yang sama dengan API (deploy satu service).
 * - `assets/*` ber-hash dari Vite → cache 1 tahun `immutable`.
 * - `index.html` & file lain → `no-cache` agar deploy baru langsung terpakai.
 * - Fallback SPA: GET/HEAD non-API yang meminta HTML → `index.html` (React Router).
 *   Path API tidak pernah di-fallback sehingga 404 API tetap JSON.
 */
/** Build frontend tersedia bila folder berisi `index.html`. */
export function hasFrontendBuild(distDir: string): boolean {
  return existsSync(join(resolve(distDir), 'index.html'));
}

export function frontendStatic(distDir: string, apiPrefix: string): Router {
  const root = resolve(distDir);
  const indexHtml = join(root, 'index.html');
  if (!hasFrontendBuild(distDir)) {
    throw new Error('FRONTEND_DIST_DIR tidak berisi index.html; jalankan `npm run build -w frontend` terlebih dahulu');
  }

  const router = Router();
  router.use(
    express.static(root, {
      index: false,
      setHeaders: (res, filePath) => {
        res.setHeader(
          'Cache-Control',
          filePath.startsWith(join(root, 'assets')) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );
  router.use((req, res, next) => {
    const isApi = req.path === apiPrefix || req.path.startsWith(`${apiPrefix}/`);
    if ((req.method !== 'GET' && req.method !== 'HEAD') || isApi || !req.accepts('html')) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
  return router;
}
