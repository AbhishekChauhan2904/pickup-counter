import pg from "pg";
import { readFileSync } from "node:fs";
import { seed, imageFor, SEEDED_NAMES } from "./seed.js";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 30,
});
export type Db = pg.Pool | pg.PoolClient;

// Runs fn in a transaction; retries on serialization failure (40001) and deadlock (40P01).
export async function withTx<T>(
  fn: (c: pg.PoolClient) => Promise<T>,
  tries = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const out = await fn(c);
      await c.query("COMMIT");
      return out;
    } catch (e: any) {
      await c.query("ROLLBACK").catch(() => {});
      if ((e.code === "40001" || e.code === "40P01") && attempt < tries) {
        await new Promise((r) => setTimeout(r, 20 * attempt));
        continue;
      }
      throw e;
    } finally {
      c.release();
    }
  }
}
export async function migrate() {
  await pool.query(
    readFileSync(new URL("./schema.sql", import.meta.url), "utf8"),
  );
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM products");
  if (rows[0].n === 0) await seed(pool);
  for (const n of SEEDED_NAMES)
    await pool.query(
      "UPDATE products SET image_url = $2 WHERE name = $1 AND image_url IS NULL",
      [n, imageFor(n)],
    ); // backfill for older databases
}
export async function logEvent(
  c: Db,
  orderId: string,
  type: string,
  detail: unknown = {},
) {
  await c.query(
    "INSERT INTO order_events (order_id, type, detail) VALUES ($1,$2,$3)",
    [orderId, type, JSON.stringify(detail)],
  );
}
