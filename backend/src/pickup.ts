import { withTx, logEvent } from "./db.js";
import { AppError } from "./errors.js";

export async function claimPickup(orderId: string) {
  return withTx(async (c) => {
    // Single winner: the UPDATE row-locks the order; a concurrent claim waits, then sees status='claimed' and matches 0 rows.
    const r = await c.query(
      `UPDATE orders SET status='claimed', claimed_at=now() WHERE id=$1 AND status='paid' RETURNING id`,
      [orderId],
    );
    if (r.rowCount === 0) {
      const o = await c.query("SELECT status FROM orders WHERE id=$1", [
        orderId,
      ]);
      if (!o.rows[0])
        throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
      throw new AppError(
        409,
        "NOT_CLAIMABLE",
        `Order cannot be claimed (status: ${o.rows[0].status})`,
      );
    }
    // Same transaction: stock drops permanently only if the claim succeeded.
    await c.query(
      `UPDATE products p SET stock = p.stock - oi.quantity FROM order_items oi WHERE oi.order_id=$1 AND oi.product_id=p.id`,
      [orderId],
    );
    await logEvent(c, orderId, "claimed");
    return { orderId, status: "claimed" };
  });
}
