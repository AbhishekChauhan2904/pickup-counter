import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { migrate, pool } from "../src/db.js";
import { seed } from "../src/seed.js";

const app = buildApp();
const order = (items: any[], key?: string) => {
  const r = request(app).post("/orders");
  if (key) r.set("idempotency-key", key);
  return r.send({ items });
};
const sim = (body: any) => request(app).post("/payments/simulate").send(body);
const statusOf = async (id: string) =>
  (await request(app).get(`/orders/${id}`)).body;
const card = {
  method: "card",
  number: "4242 4242 4242 4242",
  expiry: "12/35",
  cvv: "123",
  name: "Abhishek",
};

beforeAll(migrate);
afterAll(() => pool.end());
beforeEach(async () => {
  await pool.query(
    "TRUNCATE order_events, payment_events, order_items, orders, products, categories RESTART IDENTITY CASCADE",
  );
  await seed(pool);
});

describe("catalog", () => {
  it("lists products with category, sub-category and description", async () => {
    const r = await request(app).get("/products");
    expect(r.body.length).toBeGreaterThanOrEqual(5);
    const chips = r.body.find((p: any) => p.name === "Masala Chips");
    expect(chips).toMatchObject({
      parent: "Snacks",
      category: "Chips",
      price_paise: 2000,
    });
    expect(chips.description.length).toBeGreaterThan(10);
    expect(chips.image_url).toBe("/products/masala-chips.svg");
  });
});

describe("payment methods (simulated provider -> signed webhook)", () => {
  it.each([
    ["upi", { method: "upi", vpa: "abhi@okhdfc" }],
    ["card", card],
    ["netbanking", { method: "netbanking", bank: "HDFC Bank" }],
  ])(
    "%s success marks the order paid and records the method",
    async (m, body) => {
      const o = (await order([{ productId: 1, quantity: 1 }])).body;
      const r = await sim({ ...body, orderId: o.id });
      expect(r.body.result).toBe("paid");
      expect(await statusOf(o.id)).toMatchObject({
        status: "paid",
        paymentMethod: m,
      });
    },
  );
  it("declined card keeps the hold so the customer can retry with UPI", async () => {
    const o = (await order([{ productId: 1, quantity: 1 }])).body;
    const bad = await sim({
      ...card,
      number: "4000000000000002",
      orderId: o.id,
    });
    expect(bad.body).toMatchObject({
      declined: true,
      result: "payment_failed",
    });
    expect((await statusOf(o.id)).status).toBe("pending");
    expect(
      (await sim({ method: "upi", vpa: "abhi@okhdfc", orderId: o.id })).body
        .result,
    ).toBe("paid");
  });
  it("wrong amount -> needs_review; duplicate scenario processes once", async () => {
    const a = (await order([{ productId: 1, quantity: 1 }])).body;
    await sim({
      method: "upi",
      vpa: "abhi@okhdfc",
      orderId: a.id,
      scenario: "wrong_amount",
    });
    expect((await statusOf(a.id)).status).toBe("needs_review");
    const b = (await order([{ productId: 2, quantity: 1 }])).body;
    const r = await sim({
      method: "upi",
      vpa: "abhi@okhdfc",
      orderId: b.id,
      scenario: "duplicate",
    });
    expect([r.body.result, r.body.duplicateResult]).toEqual([
      "paid",
      "duplicate",
    ]);
  });
  it("rejects invalid card, expired card and bad UPI id", async () => {
    const o = (await order([{ productId: 1, quantity: 1 }])).body;
    expect(
      (await sim({ ...card, number: "4242 4242 4242 4241", orderId: o.id }))
        .status,
    ).toBe(400);
    expect(
      (await sim({ ...card, expiry: "01/20", orderId: o.id })).status,
    ).toBe(400);
    expect(
      (await sim({ method: "upi", vpa: "nope", orderId: o.id })).status,
    ).toBe(400);
    expect((await statusOf(o.id)).status).toBe("pending");
  });
});

describe("idempotency key", () => {
  it("10 simultaneous requests with the same key create exactly one order", async () => {
    const rs = await Promise.all(
      Array.from({ length: 10 }, () =>
        order([{ productId: 1, quantity: 2 }], "key-1"),
      ),
    );
    expect(new Set(rs.map((r) => r.body.id)).size).toBe(1);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM orders")).rows[0].n,
    ).toBe(1);
  });
});

describe("chatbot (no API key => knowledge base tier)", () => {
  const chat = (message: string, orderId?: string) =>
    request(app).post("/assistant/chat").send({ message, orderId });
  it("answers payment questions from the KB", async () => {
    const r = await chat("Which payment methods can I use?");
    expect(r.body.source).toBe("kb");
    expect(r.body.reply).toContain("UPI");
  });
  it("suggests valid items within budget", async () => {
    const r = await chat("something spicy under ₹60");
    expect(r.body.items.length).toBeGreaterThan(0);
    const prices = new Map(
      (await pool.query("SELECT id, price_paise FROM products")).rows.map(
        (p) => [p.id, p.price_paise],
      ),
    );
    expect(
      r.body.items.reduce(
        (s: number, i: any) => s + i.quantity * prices.get(i.productId),
        0,
      ),
    ).toBeLessThanOrEqual(6000);
  });
  it("describes a product", async () => {
    expect(
      (await chat("tell me about the Peanut Chikki")).body.reply,
    ).toContain("Contains peanuts");
  });
  it("explains the live order status during payment", async () => {
    const o = (await order([{ productId: 1, quantity: 1 }])).body;
    expect((await chat("my payment failed", o.id)).body.reply).toContain(
      "another method",
    );
  });
  it("rejects empty and oversized messages", async () => {
    expect((await chat("x")).status).toBe(400);
    expect((await chat("y".repeat(301))).status).toBe(400);
  });
});

describe("the assistant can never place an order", () => {
  it("chat and suggest create no orders, holds or stock changes", async () => {
    const stock = async () =>
      (await pool.query("SELECT SUM(stock)::int AS n FROM products")).rows[0].n;
    const before = await stock();
    for (const message of [
      "place my order for 2 masala chips now",
      "buy everything and pay with my card",
      "suggest snacks under 100",
    ])
      await request(app).post("/assistant/chat").send({ message });
    await request(app)
      .post("/assistant/suggest")
      .send({ message: "order 3 chips for me" });
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM orders")).rows[0].n,
    ).toBe(0);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM order_items")).rows[0]
        .n,
    ).toBe(0);
    expect(await stock()).toBe(before);
  });
});
