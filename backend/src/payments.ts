import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { withTx, logEvent } from "./db.js";
import { AppError } from "./errors.js";
import { AVAILABLE_SQL, LATE_PAYMENT_GRACE_SECONDS } from "./orders.js";

export const sign = (
  raw: Buffer | string,
  secret = process.env.WEBHOOK_SECRET ?? "",
) => createHmac("sha256", secret).update(raw).digest("hex");

export function verifySignature(raw: Buffer, header: string | undefined) {
  const a = Buffer.from(sign(raw)),
    b = Buffer.from(header ?? "");
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new AppError(401, "INVALID_SIGNATURE", "Signature mismatch");
}
const eventSchema = z.object({
  eventId: z.string().min(1),
  orderId: z.string().uuid(),
  amountPaise: z.number().int(),
  status: z.string(),
  method: z.enum(["upi", "card", "netbanking"]).optional(),
});

export async function handleWebhook(
  raw: Buffer,
  signature: string | undefined,
) {
  verifySignature(raw, signature); // signature is checked on the RAW bytes, before parsing
  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new AppError(400, "BAD_JSON", "Body is not valid JSON");
  }
  const ev = eventSchema.parse(body);

  return withTx(async (c) => {
    // Idempotency: eventId is the primary key. Second delivery inserts nothing -> change nothing.
    const ins = await c.query(
      "INSERT INTO payment_events (event_id, order_id, payload) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
      [ev.eventId, ev.orderId, body],
    );
    if (ins.rowCount === 0) return { result: "duplicate" };

    const o = (
      await c.query(
        `SELECT id, status, total_paise, (expires_at <= clock_timestamp()) AS late,
        (expires_at + make_interval(secs => $2) <= clock_timestamp()) AS late_window_elapsed
       FROM orders WHERE id = $1 FOR UPDATE`,
        [ev.orderId, LATE_PAYMENT_GRACE_SECONDS],
      )
    ).rows[0];
    if (!o) return { result: "unknown_order" }; // stored for review, answered 202
    if (ev.status === "failed") {
      await logEvent(c, o.id, "payment_failed", { method: ev.method });
      return { result: "payment_failed" };
    } // hold stays; customer may retry
    if (ev.status !== "captured") {
      await logEvent(c, o.id, "webhook_ignored", { status: ev.status });
      return { result: "ignored" };
    }
    // State machine: only pending/expired can become paid. Never move claimed/paid/refunded backwards.
    if (!["pending", "expired"].includes(o.status)) {
      await logEvent(c, o.id, "webhook_ignored", {
        reason: `already_${o.status}`,
      });
      return { result: "ignored" };
    }

    if (ev.amountPaise !== o.total_paise) {
      await c.query(
        `UPDATE orders SET status='needs_review', review_reason='amount_mismatch' WHERE id=$1`,
        [o.id],
      );
      await logEvent(c, o.id, "needs_review", {
        reason: "amount_mismatch",
        expected: o.total_paise,
        got: ev.amountPaise,
      });
      return { result: "needs_review" };
    }
    if (o.status === "expired" || o.late) {
      if (o.late_window_elapsed) {
        await c.query(
          `UPDATE orders SET status='needs_review', review_reason='late_payment_window_elapsed' WHERE id=$1`,
          [o.id],
        );
        await logEvent(c, o.id, "needs_review", {
          reason: "late_payment_window_elapsed",
        });
        return { result: "needs_review" };
      }
      // Within the grace period, try to re-reserve the units; if unavailable, staff must refund.
      const ids = (
        await c.query(
          "SELECT product_id, quantity FROM order_items WHERE order_id=$1 ORDER BY product_id",
          [o.id],
        )
      ).rows;
      await c.query(
        "SELECT id FROM products WHERE id = ANY($1) ORDER BY id FOR UPDATE",
        [ids.map((i) => i.product_id)],
      );
      const avail = new Map(
        (
          await c.query(AVAILABLE_SQL + " WHERE p.id = ANY($1)", [
            ids.map((i) => i.product_id),
          ])
        ).rows.map((r) => [r.id, r.available]),
      );
      if (ids.some((i) => (avail.get(i.product_id) ?? 0) < i.quantity)) {
        await c.query(
          `UPDATE orders SET status='needs_review', review_reason='late_payment_stock_gone' WHERE id=$1`,
          [o.id],
        );
        await logEvent(c, o.id, "needs_review", {
          reason: "late_payment_stock_gone",
        });
        return { result: "needs_review" };
      }
    }
    await c.query(
      `UPDATE orders SET status='paid', paid_at=now(), payment_method=COALESCE($2, payment_method) WHERE id=$1`,
      [o.id, ev.method ?? null],
    );
    await logEvent(c, o.id, "paid", {
      late: !!(o.late || o.status === "expired"),
    });
    return { result: "paid" };
  });
}
