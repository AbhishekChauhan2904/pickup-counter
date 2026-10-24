// npm run send-webhook -- <orderId> <amountPaise> [--duplicate] [--bad-signature] [--status=failed] [--url=http://localhost:3000]
import { createHmac, randomUUID } from "node:crypto";
const [orderId, amount, ...flags] = process.argv.slice(2);
if (!orderId || !amount) {
  console.error(
    "usage: npm run send-webhook -- <orderId> <amountPaise> [--duplicate] [--bad-signature]",
  );
  process.exit(1);
}
const flag = (n: string) => flags.includes(`--${n}`);
const url =
  flags.find((f) => f.startsWith("--url="))?.slice(6) ??
  "http://localhost:3000";
const status =
  flags.find((f) => f.startsWith("--status="))?.slice(9) ?? "captured";
const body = JSON.stringify({
  eventId: `evt_${randomUUID()}`,
  orderId,
  amountPaise: Number(amount),
  status,
});
const secret = flag("bad-signature")
  ? "wrong-secret"
  : (process.env.WEBHOOK_SECRET ?? "change-me-webhook-secret");
const sig = createHmac("sha256", secret).update(body).digest("hex");
for (let i = 0; i < (flag("duplicate") ? 2 : 1); i++) {
  const r = await fetch(`${url}/payments/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": sig },
    body,
  });
  console.log(`#${i + 1}`, r.status, await r.text());
}
