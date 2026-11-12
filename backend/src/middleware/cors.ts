import type { RequestHandler } from 'express';

// Lets a website hosted elsewhere (for example GitHub Pages) call this API from the browser.
// CORS_ORIGIN is a comma-separated allow-list of exact origins, e.g. https://yourname.github.io
// If it is empty, no other website may call the API from a browser.
export const cors: RequestHandler = (req, res, next) => {
  const allowed = (process.env.CORS_ORIGIN ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.header('origin');
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, idempotency-key'); // admin and webhook headers are NOT allowed from browsers
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; } // answer the browser's pre-flight check
  }
  next();
};
