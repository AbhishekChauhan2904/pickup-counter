import { buildApp } from "./app.js";
import { migrate, pool } from "./db.js";
import { sweepExpired } from "./orders.js";

// Wait for PostgreSQL instead of crashing (it may still be starting).
for (let attempt = 1; ; attempt++) {
  try {
    await migrate();
    break;
  } catch (e: any) {
    if (attempt >= 30) {
      console.error(
        "Could not reach PostgreSQL. Is it running, and is DATABASE_URL correct?",
        e.message,
      );
      process.exit(1);
    }
    console.log(
      `Waiting for PostgreSQL (attempt ${attempt}/30): ${e.code ?? e.message}`,
    );
    await new Promise((r) => setTimeout(r, 2000));
  }
}
const app = buildApp();
const server = app.listen(3000, () =>
  console.log(JSON.stringify({ level: "info", msg: "listening on :3000" })),
);
const timer = setInterval(
  () => sweepExpired().catch((e) => console.error(e)),
  5000,
);
const stop = () => {
  clearInterval(timer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
