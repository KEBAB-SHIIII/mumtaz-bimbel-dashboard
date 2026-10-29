import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorResponseSchema, healthResponseSchema } from '@mumtaz/contracts';
import { createApp } from '../src/app.js';
import { makeTestEnv } from './test-env.js';

const app = createApp(makeTestEnv());

describe('GET /api/v1/health', () => {
  it('mengembalikan 200 dengan body sesuai kontrak', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(res.body)).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('mengizinkan CORS dengan credentials hanya untuk FRONTEND_ORIGIN', async () => {
    const allowed = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const other = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });

  it('memasang security headers dan tidak mengekspos x-powered-by', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('error envelope', () => {
  it('route tidak dikenal mengembalikan 404 NOT_FOUND', async () => {
    const res = await request(app).get('/api/v1/tidak-ada');

    expect(res.status).toBe(404);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('JSON rusak mengembalikan 400 BAD_REQUEST tanpa stack trace', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"rusak":');

    expect(res.status).toBe(400);
    const body = errorResponseSchema.parse(res.body);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(JSON.stringify(res.body)).not.toMatch(/at\s+\S+\s+\(/);
  });
});
