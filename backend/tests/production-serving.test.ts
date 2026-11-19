import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { frontendStatic } from '../src/http/frontend-static.js';
import { API, createTestApp, type TestApp } from './helpers/test-app.js';

const dist = mkdtempSync(join(tmpdir(), 'mumtaz-dist-'));
mkdirSync(join(dist, 'assets'));
writeFileSync(join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
writeFileSync(join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ seed: false, env: { FRONTEND_DIST_DIR: dist } });
});
afterAll(async () => {
  await t.close();
  rmSync(dist, { recursive: true, force: true });
});

describe('SPA disajikan dari origin yang sama (FRONTEND_DIST_DIR)', () => {
  it('deep link React Router → index.html no-cache; asset ber-hash → immutable', async () => {
    const page = await request(t.app).get('/admin/rekap').set('Accept', 'text/html').expect(200);
    expect(page.text).toContain('id="root"');
    expect(page.headers['cache-control']).toBe('no-cache');

    const asset = await request(t.app).get('/assets/index-abc123.js').expect(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('path API tidak pernah di-fallback ke HTML (404 tetap JSON); asset hilang → 404', async () => {
    const res = await request(t.app).get(`${API}/tidak-ada`).set('Accept', 'text/html').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    await request(t.app).get('/assets/hilang.js').set('Accept', 'application/javascript').expect(404);
    await request(t.app).post('/admin/rekap').set('Accept', 'text/html').expect(404);
  });

  it('folder tanpa index.html: frontendStatic menolak, app hanya memberi peringatan dan API tetap jalan', async () => {
    expect(() => frontendStatic(join(dist, 'assets'), API)).toThrow(/index\.html/);
    const noBuild = await createTestApp({ seed: false, env: { FRONTEND_DIST_DIR: join(dist, 'belum-build') } });
    try {
      await request(noBuild.app).get(`${API}/health`).expect(200);
      await request(noBuild.app).get('/admin').set('Accept', 'text/html').expect(404);
    } finally {
      await noBuild.close();
    }
  });
});

describe('GET /health/ready', () => {
  it('200 bila database dapat di-query; 503 envelope aman bila tidak', async () => {
    expect((await request(t.app).get(`${API}/health/ready`).expect(200)).body).toEqual({ status: 'ok' });
    const broken = await createTestApp({ seed: false });
    await broken.database.close();
    const res = await request(broken.app).get(`${API}/health/ready`).expect(503);
    expect(res.body.error).toEqual({ code: 'INTEGRATION_UNAVAILABLE', message: 'Database belum siap' });
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
