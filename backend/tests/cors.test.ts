import { describe, it, expect, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/db.js';

const app = buildApp();
const ORIGIN = 'https://demo.github.io';
afterEach(() => { delete process.env.CORS_ORIGIN; });
afterAll(() => pool.end());

describe('CORS (so the GitHub Pages site can call the API)', () => {
  it('answers the pre-flight check for an allowed origin', async () => {
    process.env.CORS_ORIGIN = ORIGIN;
    const r = await request(app).options('/orders').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'POST');
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(r.headers['access-control-allow-headers']).toContain('idempotency-key');
    expect(r.headers['access-control-allow-headers']).not.toContain('x-admin-token');
  });
  it('adds the header to normal responses for an allowed origin', async () => {
    process.env.CORS_ORIGIN = ORIGIN;
    expect((await request(app).get('/health').set('Origin', ORIGIN)).headers['access-control-allow-origin']).toBe(ORIGIN);
  });
  it('gives other websites nothing', async () => {
    process.env.CORS_ORIGIN = ORIGIN;
    expect((await request(app).get('/health').set('Origin', 'https://evil.example')).headers['access-control-allow-origin']).toBeUndefined();
  });
  it('allows nobody when CORS_ORIGIN is not set', async () => {
    expect((await request(app).get('/health').set('Origin', ORIGIN)).headers['access-control-allow-origin']).toBeUndefined();
  });
});
