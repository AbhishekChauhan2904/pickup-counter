import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { migrate, pool } from "../src/db.js";
import { sign } from "../src/payments.js";

const app = buildApp();
let evt = 0;
const pay = (
  orderId: string,
  amountPaise: number,
  eventId = `evt_${++evt}_${Date.now()}`,
  status = "captured",
  secret?: string,
) => {
  const body = JSON.stringify({ eventId, orderId, amountPaise, status });
  return request(app)
    .post("/payments/webhook")
    .set("content-type", "application/json")
    .set("x-signature", sign(body, secret ?? "test-secret"))
    .send(body);
};
const order = (items: any[]) => request(app).post("/orders").send({ items });
const stockOf = async (id: number) =>
  (await pool.query("SELECT stock FROM products WHERE id=$1", [id])).rows[0]
    .stock;
const statusOf = async (id: string) =>
  (await request(app).get(`/orders/${id}`)).body.status;

beforeAll(migrate);
afterAll(() => pool.end());
beforeEach(async () => {
  await pool.query(
    "TRUNCATE order_events, payment_events, order_items, orders, products, categories RESTART IDENTITY CASCADE",
  );
  await pool.query(
    `INSERT INTO products (name, price_paise, stock, tags) VALUES ('Chips', 2000, 2, '{spicy}'), ('Juice', 3500, 5, '{drink}')`,
  );
});

describe("stock holds", () => {
  it("10 customers, last 2 units: exactly 2 held, 8 fail cleanly", async () => {
    const res = await Promise.all(
      Array.from({ length: 10 }, () => order([{ productId: 1, quantity: 1 }])),
    );
    expect(res.filter((r) => r.status === 201)).toHaveLength(2);
    const failed = res.filter((r) => r.status === 409);
    expect(failed).toHaveLength(8);
    expect(failed[0].body.error.code).toBe("INSUFFICIENT_STOCK");
    const held = await pool.query(
      `SELECT COALESCE(SUM(quantity),0)::int AS n FROM order_items WHERE product_id=1`,
    );
    expect(held.rows[0].n).toBe(2);
    expect((await request(app).get("/products")).body[0].available).toBe(0);
  });
  it("a failed multi-item order holds nothing", async () => {
    const r = await order([
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 99 },
    ]);
    expect(r.status).toBe(400); // exceeds per-item cap (validation)
    const r2 = await order([
      { productId: 1, quantity: 3 },
      { productId: 2, quantity: 1 },
    ]);
    expect(r2.status).toBe(409);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM order_items")).rows[0]
        .n,
    ).toBe(0);
  });
  it("returns expiresInSeconds and releases stock after expiry", async () => {
    const r = await order([{ productId: 1, quantity: 2 }]);
    expect(r.body.expiresInSeconds).toBeGreaterThan(115);
    expect(r.body.latePaymentSeconds).toBe(0);
    await pool.query(
      `UPDATE orders SET expires_at = now() - interval '1 second'`,
    );
    const expired = await request(app).get(`/orders/${r.body.id}`);
    expect(expired.body.status).toBe("expired");
    expect(expired.body.latePaymentSeconds).toBeGreaterThan(0);
    expect(expired.body.latePaymentSeconds).toBeLessThanOrEqual(30);
    expect((await request(app).get("/products")).body[0].available).toBe(2);
  });
});

describe("webhook", () => {
  it("same event twice (concurrently): processed once", async () => {
    const o = (await order([{ productId: 1, quantity: 1 }])).body;
    const [a, b] = await Promise.all([
      pay(o.id, 2000, "evt_same"),
      pay(o.id, 2000, "evt_same"),
    ]);
    expect([a.body.result, b.body.result].sort()).toEqual([
      "duplicate",
      "paid",
    ]);
    expect(
      (
        await pool.query(
          `SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='paid'`,
          [o.id],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(await statusOf(o.id)).toBe("paid");
  });
  it("rejects a bad signature", async () => {
    const o = (await order([{ productId: 1, quantity: 1 }])).body;
    expect((await pay(o.id, 2000, "evt_bad", "captured", "wrong")).status).toBe(
      401,
    );
    expect(await statusOf(o.id)).toBe("pending");
  });
  it("amount mismatch -> needs_review, not paid", async () => {
    const o = (await order([{ productId: 1, quantity: 1 }])).body;
    await pay(o.id, 100);
    expect(await statusOf(o.id)).toBe("needs_review");
  });
  it("late payment, stock still free -> paid", async () => {
    const o = (await order([{ productId: 1, quantity: 1 }])).body;
    await pool.query(
      `UPDATE orders SET expires_at = now() - interval '1 second'`,
    );
    await pay(o.id, 2000);
    expect(await statusOf(o.id)).toBe("paid");
  });
  it("late payment, stock sold to someone else -> needs_review", async () => {
    const o = (await order([{ productId: 1, quantity: 2 }])).body;
    await pool.query(
      `UPDATE orders SET expires_at = now() - interval '1 second'`,
    );
    expect((await order([{ productId: 1, quantity: 2 }])).status).toBe(201); // someone else takes both units
    await pay(o.id, 4000);
    const st = await request(app).get(`/orders/${o.id}`);
    expect(st.body.status).toBe("needs_review");
    expect(st.body.reviewReason).toBe("late_payment_stock_gone");
  });
  it("late capture after the grace window -> needs_review without reclaiming stock", async () => {
    const o = (await order([{ productId: 1, quantity: 1 }])).body;
    await pool.query(
      `UPDATE orders SET expires_at = now() - interval '31 seconds' WHERE id=$1`,
      [o.id],
    );
    const response = await pay(o.id, 2000);
    expect(response.body.result).toBe("needs_review");
    const st = await request(app).get(`/orders/${o.id}`);
    expect(st.body).toMatchObject({
      status: "needs_review",
      reviewReason: "late_payment_window_elapsed",
    });
    expect((await request(app).get("/products")).body[0].available).toBe(2);
  });
  it("unknown order -> 202", async () => {
    expect(
      (await pay("00000000-0000-4000-8000-000000000000", 100)).status,
    ).toBe(202);
  });
});

describe("pickup", () => {
  it("two simultaneous claims: exactly one succeeds, stock drops once", async () => {
    const o = (await order([{ productId: 1, quantity: 2 }])).body;
    await pay(o.id, 4000);
    const res = await Promise.all([
      request(app).post(`/orders/${o.id}/pickup-claim`),
      request(app).post(`/orders/${o.id}/pickup-claim`),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await stockOf(1)).toBe(0);
  });
  it("unpaid or expired orders cannot be claimed", async () => {
    const o = (await order([{ productId: 1, quantity: 1 }])).body;
    expect(
      (await request(app).post(`/orders/${o.id}/pickup-claim`)).status,
    ).toBe(409);
    await pool.query(`UPDATE orders SET status='expired'`);
    expect(
      (await request(app).post(`/orders/${o.id}/pickup-claim`)).status,
    ).toBe(409);
    expect(await stockOf(1)).toBe(2);
  });
});

describe("assistant", () => {
  it("falls back to rules and only suggests valid items", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = await request(app)
      .post("/assistant/suggest")
      .send({ message: "something spicy under ₹60" });
    expect(r.status).toBe(200);
    expect(r.body.source).toBe("rules");
    for (const i of r.body.items) expect([1, 2]).toContain(i.productId);
  });
});
