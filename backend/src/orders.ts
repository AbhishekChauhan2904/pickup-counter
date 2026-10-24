import { z } from "zod";
import { withTx, pool, logEvent, type Db } from "./db.js";
import { AppError } from "./errors.js";

export const HOLD_SECONDS = Number(process.env.HOLD_SECONDS ?? 120);
export const LATE_PAYMENT_GRACE_SECONDS = 30;
export const MAX_PER_ITEM = 5;

// available = stock - units in live holds (pending & not expired) - units in paid-but-unclaimed orders.
// Paid orders must keep reserving stock until pickup, otherwise we could oversell between payment and pickup.
export const AVAILABLE_SQL = `
  SELECT p.id, p.name, p.price_paise, p.tags, p.stock, p.description, p.image_url, c.name AS category, pc.name AS parent,
    (p.stock - COALESCE((SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE oi.product_id = p.id AND (o.status = 'paid' OR (o.status = 'pending' AND o.expires_at > now()))), 0))::int AS available
  FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN categories pc ON pc.id = c.parent_id`;

export const listProducts = async (db: Db = pool) =>
  (await db.query(AVAILABLE_SQL + " ORDER BY p.id")).rows;

export const orderInput = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(MAX_PER_ITEM),
      }),
    )
    .min(1)
    .max(10)
    .refine(
      (a) => new Set(a.map((i) => i.productId)).size === a.length,
      "Duplicate productId",
    )
    .refine(
      (a) => a.reduce((s, i) => s + i.quantity, 0) <= 15,
      "Max 15 items per order",
    ),
});

export async function getOrder(id: string, db: Db = pool) {
  const { rows } = await db.query(
    `SELECT id, total_paise AS "totalPaise", payment_method AS "paymentMethod", review_reason AS "reviewReason",
       CASE WHEN status = 'pending' AND expires_at <= now() THEN 'expired' ELSE status END AS status,
       CASE WHEN status = 'pending' THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (expires_at - now()))))::int ELSE 0 END AS "expiresInSeconds",
       CASE WHEN status = 'expired' OR (status = 'pending' AND expires_at <= now())
         THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (expires_at + make_interval(secs => $2) - now()))))::int
         ELSE 0 END AS "latePaymentSeconds"
     FROM orders WHERE id = $1`,
    [id, LATE_PAYMENT_GRACE_SECONDS],
  );
  if (!rows[0]) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  const items = (
    await db.query(
      `SELECT oi.product_id AS "productId", p.name, oi.quantity, oi.unit_price_paise AS "unitPricePaise"
     FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1 ORDER BY p.id`,
      [id],
    )
  ).rows;
  return { ...rows[0], items };
}

export async function createOrder(
  input: z.infer<typeof orderInput>,
  idemKey?: string,
) {
  const run = () =>
    withTx(async (c) => {
      if (idemKey) {
        // double-click / network retry returns the same order
        const prev = await c.query(
          "SELECT id FROM orders WHERE idem_key = $1",
          [idemKey],
        );
        if (prev.rows[0]) return prev.rows[0].id as string;
      }
      const ids = input.items.map((i) => i.productId).sort((a, b) => a - b);
      // Row locks in a fixed order (ORDER BY id) => concurrent orders queue up and cannot deadlock.
      const locked = await c.query(
        "SELECT id FROM products WHERE id = ANY($1) ORDER BY id FOR UPDATE",
        [ids],
      );
      if (locked.rowCount !== ids.length)
        throw new AppError(
          400,
          "UNKNOWN_PRODUCT",
          "One or more products do not exist",
        );
      if (idemKey) {
        // re-check after the lock: a concurrent request with the same key may have just committed
        const again = await c.query(
          "SELECT id FROM orders WHERE idem_key = $1",
          [idemKey],
        );
        if (again.rows[0]) return again.rows[0].id as string;
      }
      // Separate statement after the lock: sees every hold committed by earlier lock holders.
      const avail = (
        await c.query(AVAILABLE_SQL + " WHERE p.id = ANY($1)", [ids])
      ).rows;
      const byId = new Map(avail.map((p) => [p.id as number, p]));
      const short = input.items
        .filter((i) => byId.get(i.productId)!.available < i.quantity)
        .map((i) => ({
          productId: i.productId,
          name: byId.get(i.productId)!.name,
          requested: i.quantity,
          available: Math.max(0, byId.get(i.productId)!.available),
        }));
      if (short.length)
        throw new AppError(
          409,
          "INSUFFICIENT_STOCK",
          "Not enough stock",
          short,
        ); // rollback => nothing held
      const total = input.items.reduce(
        (s, i) => s + i.quantity * byId.get(i.productId)!.price_paise,
        0,
      ); // total computed on the server
      const o = await c.query(
        `INSERT INTO orders (status, total_paise, expires_at, idem_key) VALUES ('pending', $1, now() + make_interval(secs => $2), $3) RETURNING id`,
        [total, HOLD_SECONDS, idemKey ?? null],
      );
      for (const i of input.items)
        await c.query("INSERT INTO order_items VALUES ($1,$2,$3,$4)", [
          o.rows[0].id,
          i.productId,
          i.quantity,
          byId.get(i.productId)!.price_paise,
        ]);
      await logEvent(c, o.rows[0].id, "created", { total, items: input.items });
      return o.rows[0].id as string;
    });
  let id: string;
  try {
    id = await run();
  } catch (e: any) {
    if (e.code === "23505" && idemKey)
      id = (
        await pool.query("SELECT id FROM orders WHERE idem_key = $1", [idemKey])
      ).rows[0].id;
    else throw e;
  }
  return getOrder(id);
}

// Lazy expiry (via CASE in queries) keeps things correct; this sweeper just makes the stored status tidy.
export async function sweepExpired() {
  const { rows } = await pool.query(
    `UPDATE orders SET status = 'expired' WHERE status = 'pending' AND expires_at <= now() RETURNING id`,
  );
  for (const r of rows) await logEvent(pool, r.id, "expired");
}
