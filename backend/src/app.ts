import express from "express";
import { pool } from "./db.js";
import { errorHandler, requestId, AppError } from "./errors.js";
import { createOrder, getOrder, listProducts, orderInput } from "./orders.js";
import { handleWebhook } from "./payments.js";
import { claimPickup } from "./pickup.js";
import { suggest, rateLimited } from "./assistant.js";
import { admin } from "./admin.js";
import { chat } from "./chat.js";
import { payInput, simulatePayment } from "./simulator.js";
import { z } from "zod";

export function buildApp() {
  const app = express();
  app.use(requestId);
  app.get("/health", async (_q, res) => {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  });

  // Webhook needs the RAW body for the HMAC, so it is mounted before express.json().
  app.post(
    "/payments/webhook",
    express.raw({ type: "*/*", limit: "100kb" }),
    async (req, res, next) => {
      try {
        const out = await handleWebhook(
          req.body as Buffer,
          req.header("x-signature"),
        );
        res.status(out.result === "unknown_order" ? 202 : 200).json(out);
      } catch (e) {
        next(e);
      }
    },
  );

  app.use(express.json({ limit: "10kb" }));
  const wrap =
    (fn: express.RequestHandler): express.RequestHandler =>
    (q, s, n) =>
      Promise.resolve(fn(q, s, n)).catch(n);

  app.get(
    "/products",
    wrap(async (_q, res) => res.json(await listProducts())),
  );
  app.post(
    "/orders",
    wrap(async (req, res) =>
      res
        .status(201)
        .json(
          await createOrder(
            orderInput.parse(req.body),
            req.header("idempotency-key"),
          ),
        ),
    ),
  );
  app.get(
    "/orders/:id",
    wrap(async (req, res) => {
      if (!z.string().uuid().safeParse(req.params.id).success)
        throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
      res.json(await getOrder(req.params.id));
    }),
  );
  app.post(
    "/orders/:id/pickup-claim",
    wrap(async (req, res) => {
      if (!z.string().uuid().safeParse(req.params.id).success)
        throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
      res.json(await claimPickup(req.params.id));
    }),
  );
  app.get("/assistant/status", (_q, res) =>
    res.json({ available: true, ai: !!process.env.ANTHROPIC_API_KEY }),
  );
  app.post(
    "/assistant/suggest",
    wrap(async (req, res) => {
      if (rateLimited(req.ip ?? "x"))
        throw new AppError(
          429,
          "RATE_LIMITED",
          "Too many requests, try again in a minute",
        );
      const { message } = z
        .object({ message: z.string().min(2).max(200) })
        .parse(req.body);
      res.json(await suggest(message, await listProducts())); // only suggests; never touches stock or payments
    }),
  );
  app.post(
    "/assistant/chat",
    wrap(async (req, res) => {
      if (rateLimited((req.ip ?? "x") + ":chat", 30))
        throw new AppError(
          429,
          "RATE_LIMITED",
          "Too many messages, try again in a minute",
        );
      const { message, orderId } = z
        .object({
          message: z.string().min(2).max(300),
          orderId: z.string().uuid().optional(),
        })
        .parse(req.body);
      const order = orderId ? await getOrder(orderId).catch(() => null) : null;
      res.json(await chat(message, await listProducts(), order)); // answers and suggests only; never creates orders or moves money
    }),
  );
  // Demo payment provider (card / UPI / net banking). Disabled unless ENABLE_SIMULATOR=true.
  app.post(
    "/payments/simulate",
    wrap(async (req, res) => {
      if (process.env.ENABLE_SIMULATOR !== "true")
        throw new AppError(404, "NOT_FOUND", "Not found");
      res.json(await simulatePayment(payInput.parse(req.body)));
    }),
  );
  app.use("/admin", admin);
  app.use(errorHandler);
  return app;
}
