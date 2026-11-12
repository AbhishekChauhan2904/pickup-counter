import express from 'express';
import { pool } from './db/db.js';
import { errorHandler, notFound, requestId, AppError } from './middleware/errors.js';
import { requestLogger } from './middleware/requestLogger.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { rateLimit } from './middleware/rateLimit.js';
import { cors } from './middleware/cors.js';
import { createOrder, getOrder, listProducts, orderInput } from './orders/orders.js';
import { handleWebhook } from './payments/payments.js';
import { claimPickup } from './pickup/pickup.js';
import { suggest } from './assistant/assistant.js';
import { admin } from './admin/admin.js';
import { chat } from './assistant/chat.js';
import { payInput, simulatePayment } from './payments/simulator.js';
import { z } from 'zod';

export function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY)); // behind a host's proxy, so rate limits see real client IPs
  app.use(requestId, requestLogger, cors);
  const webDir = process.env.SERVE_FRONTEND_DIR;
  if (webDir) { // production mode: this one server hosts the built React app and the API (under /api)
    app.use((req, _res, next) => { if (req.url.startsWith('/api/')) req.url = req.url.slice(4); next(); });
    app.use(express.static(webDir, { redirect: false, maxAge: '1h', setHeaders: (res, file) => {
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
      if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); // so a redeploy is picked up straight away
    } }));
  }
  app.use(securityHeaders); // strict API-only headers; static files are served above, before this
  app.get('/health', async (_q, res) => { await pool.query('SELECT 1'); res.json({ ok: true }); });

  // Webhook needs the RAW body for the HMAC, so it is mounted before express.json().
  app.post('/payments/webhook', express.raw({ type: '*/*', limit: '100kb' }), async (req, res, next) => {
    try {
      const out = await handleWebhook(req.body as Buffer, req.header('x-signature'));
      res.status(out.result === 'unknown_order' ? 202 : 200).json(out);
    } catch (e) { next(e); }
  });

  app.use(express.json({ limit: '10kb' }));
  // Rate limits (per IP, per minute). Health and the signed webhook are exempt: the webhook is authenticated by its signature.
  // RATE_LIMIT_SCALE lets tests raise every limit.
  const limit = (max: number) => rateLimit({ max: max * Number(process.env.RATE_LIMIT_SCALE ?? 1) });
  app.use(limit(300));
  app.post('/orders', limit(30));
  app.post('/orders/:id/pickup-claim', limit(60));
  app.post('/payments/simulate', limit(20));
  app.use('/assistant', limit(30));
  const wrap = (fn: express.RequestHandler): express.RequestHandler => (q, s, n) => Promise.resolve(fn(q, s, n)).catch(n);

  app.get('/products', wrap(async (_q, res) => res.json(await listProducts())));
  app.post('/orders', wrap(async (req, res) => res.status(201).json(await createOrder(orderInput.parse(req.body), req.header('idempotency-key')))));
  app.get('/orders/:id', wrap(async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
    res.json(await getOrder(req.params.id));
  }));
  app.post('/orders/:id/pickup-claim', wrap(async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
    res.json(await claimPickup(req.params.id));
  }));
  app.get('/assistant/status', (_q, res) => res.json({ available: true, ai: !!process.env.ANTHROPIC_API_KEY }));
  app.post('/assistant/suggest', wrap(async (req, res) => {
    const { message } = z.object({ message: z.string().min(2).max(200) }).parse(req.body);
    res.json(await suggest(message, await listProducts())); // only suggests; never touches stock or payments
  }));
  app.post('/assistant/chat', wrap(async (req, res) => {
    const { message, orderId } = z.object({ message: z.string().min(2).max(300), orderId: z.string().uuid().optional() }).parse(req.body);
    const order = orderId ? await getOrder(orderId).catch(() => null) : null;
    res.json(await chat(message, await listProducts(), order)); // answers and suggests only; never creates orders or moves money
  }));
  // Demo payment provider (card / UPI / net banking). Disabled unless ENABLE_SIMULATOR=true.
  app.post('/payments/simulate', wrap(async (req, res) => {
    if (process.env.ENABLE_SIMULATOR !== 'true') throw new AppError(404, 'NOT_FOUND', 'Not found');
    res.json(await simulatePayment(payInput.parse(req.body)));
  }));
  app.use('/admin', limit(30), admin); // limit first, so guessing the token is slow
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
