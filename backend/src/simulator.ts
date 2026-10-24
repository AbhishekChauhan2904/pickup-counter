import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getOrder } from "./orders.js";
import { handleWebhook, sign } from "./payments.js";

// Stand-in for the payment provider. It validates the payment form, then calls OUR webhook with a correctly signed event,
// exactly like a real provider would. Card details are validated for format and never stored or logged.
const luhn = (n: string) =>
  [...n].reverse().reduce((s, d, i) => {
    let x = +d;
    if (i % 2) {
      x *= 2;
      if (x > 9) x -= 9;
    }
    return s + x;
  }, 0) %
    10 ===
  0;
const notExpired = (v: string) => {
  const [mm, yy] = v.split("/").map(Number);
  const now = new Date();
  return (
    2000 + yy > now.getFullYear() ||
    (2000 + yy === now.getFullYear() && mm >= now.getMonth() + 1)
  );
};
const base = {
  orderId: z.string().uuid(),
  scenario: z
    .enum(["success", "decline", "wrong_amount", "duplicate"])
    .default("success"),
};
export const BANKS = [
  "HDFC Bank",
  "ICICI Bank",
  "State Bank of India",
  "Axis Bank",
  "Kotak Bank",
] as const;
export const payInput = z.discriminatedUnion("method", [
  z.object({
    ...base,
    method: z.literal("upi"),
    vpa: z
      .string()
      .regex(
        /^[\w.\-]{2,}@[a-zA-Z]{2,}$/,
        "Enter a valid UPI ID like name@bank",
      ),
  }),
  z.object({
    ...base,
    method: z.literal("card"),
    number: z
      .string()
      .transform((s) => s.replace(/[\s-]/g, ""))
      .refine(
        (s) => /^\d{13,19}$/.test(s) && luhn(s),
        "Card number is not valid",
      ),
    expiry: z
      .string()
      .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Use MM/YY")
      .refine(notExpired, "Card has expired"),
    cvv: z.string().regex(/^\d{3,4}$/, "CVV must be 3 or 4 digits"),
    name: z.string().trim().min(2, "Enter the name on the card").max(60),
  }),
  z.object({
    ...base,
    method: z.literal("netbanking"),
    bank: z.enum(BANKS, { error: "Choose a bank" }),
  }),
]);

export async function simulatePayment(input: z.infer<typeof payInput>) {
  const o = await getOrder(input.orderId);
  const declined =
    input.scenario === "decline" ||
    (input.method === "card" && input.number.endsWith("0002")) ||
    (input.method === "upi" && /fail/i.test(input.vpa));
  const raw = Buffer.from(
    JSON.stringify({
      eventId: `evt_sim_${randomUUID()}`,
      orderId: o.id,
      status: declined ? "failed" : "captured",
      method: input.method,
      amountPaise:
        input.scenario === "wrong_amount" ? o.totalPaise - 100 : o.totalPaise,
    }),
  );
  const first = await handleWebhook(raw, sign(raw));
  const second =
    input.scenario === "duplicate"
      ? await handleWebhook(raw, sign(raw))
      : undefined; // same eventId again
  return { result: first.result, duplicateResult: second?.result, declined };
}
