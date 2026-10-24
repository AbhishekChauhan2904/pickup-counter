import { Router } from "express";
import { z } from "zod";
import { pool, withTx, logEvent } from "./db.js";
import { AppError } from "./errors.js";

export const admin = Router();
admin.use((req, _res, next) => {
  if (
    !process.env.ADMIN_TOKEN ||
    req.header("x-admin-token") !== process.env.ADMIN_TOKEN
  )
    return next(new AppError(401, "UNAUTHORIZED", "Admin token required"));
  next();
});
const list = (
  where: string,
) => `SELECT o.id, o.status, o.total_paise AS "totalPaise", o.review_reason AS "reviewReason", o.created_at AS "createdAt",
  (SELECT json_agg(json_build_object('name', p.name, 'quantity', oi.quantity)) FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=o.id) AS items
  FROM orders o ${where} ORDER BY o.created_at DESC LIMIT 100`;
admin.get("/orders", async (_q, res) =>
  res.json((await pool.query(list(""))).rows),
);
admin.get("/needs-review", async (_q, res) =>
  res.json((await pool.query(list(`WHERE o.status='needs_review'`))).rows),
);
admin.get("/orders/:id/timeline", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT type, detail, at FROM order_events WHERE order_id=$1 ORDER BY id",
        [req.params.id],
      )
    ).rows,
  ),
);
admin.post("/orders/:id/resolve", async (req, res) => {
  const { action } = z
    .object({ action: z.enum(["refund", "accept"]) })
    .parse(req.body);
  res.json(
    await withTx(async (c) => {
      const o = (
        await c.query("SELECT status FROM orders WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!o) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
      if (o.status !== "needs_review")
        throw new AppError(
          409,
          "NOT_IN_REVIEW",
          "Order is not awaiting review",
        );
      const next = action === "refund" ? "refunded" : "paid"; // 'accept' makes it claimable (admin accepts stock risk)
      await c.query(
        `UPDATE orders SET status=$2, paid_at = CASE WHEN $2='paid' THEN now() ELSE paid_at END WHERE id=$1`,
        [req.params.id, next],
      );
      await logEvent(c, req.params.id, `resolved_${action}`);
      return { id: req.params.id, status: next };
    }),
  );
});
