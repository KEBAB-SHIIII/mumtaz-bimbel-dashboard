import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorResponseSchema, healthResponseSchema } from '@mumtaz/contracts';
import { API, ORIGIN, createTestApp, type TestApp } from './helpers/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ seed: false });
});
afterAll(() => t.close());

describe('GET /api/v1/health', () => {
  it('mengembalikan 200 dengan body sesuai kontrak', async () => {
    const res = await request(t.app).get(`${API}/health`);

    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(res.body)).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('tidak membuat session/cookie', async () => {
    const res = await request(t.app).get(`${API}/health`);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('mengizinkan CORS dengan credentials hanya untuk FRONTEND_ORIGIN', async () => {
    const allowed = await request(t.app).get(`${API}/health`).set('Origin', ORIGIN);
    expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const other = await request(t.app).get(`${API}/health`).set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });

  it('memasang security headers, request id, dan tidak mengekspos x-powered-by', async () => {
    const res = await request(t.app).get(`${API}/health`);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('error envelope', () => {
  it('route tidak dikenal mengembalikan 404 NOT_FOUND', async () => {
    const res = await request(t.app).get(`${API}/tidak-ada`);
    expect(res.status).toBe(404);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('JSON rusak mengembalikan 400 BAD_REQUEST tanpa stack trace', async () => {
    const res = await request(t.app).post(`${API}/health`).set('Content-Type', 'application/json').send('{"rusak":');

    expect(res.status).toBe(400);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('BAD_REQUEST');
    expect(JSON.stringify(res.body)).not.toMatch(/at\s+\S+\s+\(/);
  });
});
