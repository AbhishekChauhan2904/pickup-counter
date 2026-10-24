import { useEffect, useRef, useState } from "react";
import { api, ApiError, rupees } from "./api";

type Order = {
  id: string;
  status: string;
  totalPaise: number;
  expiresInSeconds: number;
  latePaymentSeconds: number;
  reviewReason?: string;
  paymentMethod?: string;
  items: { name: string; quantity: number }[];
};
type Method = "upi" | "card" | "netbanking";
const FINAL = ["paid", "expired", "needs_review", "claimed", "refunded"];
const BANKS = [
  "HDFC Bank",
  "ICICI Bank",
  "State Bank of India",
  "Axis Bank",
  "Kotak Bank",
];
const LABEL: Record<Method, string> = {
  upi: "UPI",
  card: "Card",
  netbanking: "Net banking",
};

export default function Payment({
  id,
  onDone,
  onHelp,
}: {
  id: string;
  onDone: () => void;
  onHelp: (text: string) => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [left, setLeft] = useState(0);
  const [offline, setOffline] = useState(false);
  const [tick, setTick] = useState(0);
  const deadline = useRef(0); // performance.now() time: monotonic, immune to a wrong device clock
  const fails = useRef(0);
  const [checking, setChecking] = useState(false);
  const [method, setMethod] = useState<Method>("upi");
  const [vpa, setVpa] = useState("");
  const [bank, setBank] = useState("");
  const [card, setCard] = useState({
    number: "",
    expiry: "",
    cvv: "",
    name: "",
  });
  const [scenario, setScenario] = useState("success");
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState<{ bad: boolean; text: string } | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const o = await api<Order>(`/orders/${id}`);
        fails.current = 0;
        setOffline(false);
        setOrder(o);
        deadline.current = performance.now() + o.expiresInSeconds * 1000; // re-sync from the server on every poll
        if (o.status === "expired") {
          const stillChecking = o.latePaymentSeconds > 0;
          setChecking(stillChecking);
          if (!stillChecking) return;
        } else if (FINAL.includes(o.status)) return;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          onDone();
          return;
        }
        fails.current++;
        setOffline(true); // a failed poll is not "payment failed"
      }
      if (!stop)
        timer = setTimeout(poll, Math.min(2000 * 2 ** fails.current, 15000));
    };
    poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id, tick]);
  useEffect(() => {
    const t = setInterval(
      () =>
        setLeft(
          Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000)),
        ),
      250,
    );
    return () => clearInterval(t);
  }, []);

  async function pay() {
    setPaying(true);
    setMsg(null);
    const body =
      method === "upi"
        ? { method, vpa }
        : method === "card"
          ? { method, ...card }
          : { method, bank };
    try {
      const r = await api<{ declined: boolean }>("/payments/simulate", {
        method: "POST",
        body: JSON.stringify({ ...body, orderId: id, scenario }),
      });
      setCard({ number: "", expiry: "", cvv: "", name: "" }); // never keep card details around
      if (r.declined)
        setMsg({
          bad: true,
          text: "Payment declined. Your items are still held: try again or pick another method.",
        });
      setTick((t) => t + 1); // refresh status right away
    } catch (e) {
      const first =
        e instanceof ApiError && e.code === "VALIDATION_ERROR"
          ? e.details?.[0]?.message
          : (e as Error).message;
      setMsg({ bad: true, text: first ?? "Check your details and try again." });
    } finally {
      setPaying(false);
    }
  }
  async function collect() {
    setClaiming(true);
    try {
      await api(`/orders/${id}/pickup-claim`, { method: "POST" });
      setTick((t) => t + 1);
    } catch (e) {
      setMsg({ bad: true, text: (e as Error).message });
    } finally {
      setClaiming(false);
    }
  }

  if (!order) return <p>Loading your order…{offline && " Reconnecting…"}</p>;
  const mm = String(Math.floor(left / 60)).padStart(2, "0"),
    ss = String(left % 60).padStart(2, "0");
  const ref = order.id.slice(0, 8);
  const field = (label: string, el: JSX.Element) => (
    <label className="field">
      <span>{label}</span>
      {el}
    </label>
  );
  return (
    <>
      <h2>Pay {rupees(order.totalPaise)}</h2>
      <p className="muted">
        Order reference <span className="ref">{ref.toUpperCase()}</span>. Keep
        it if you need help.
      </p>
      {order.items.map((i) => (
        <div className="row" key={i.name}>
          <span>{i.name}</span>
          <span>× {i.quantity}</span>
        </div>
      ))}
      {offline && (
        <div className="banner" role="status">
          Reconnecting… your order is safe on the server.
        </div>
      )}

      {order.status === "pending" && (
        <>
          <p>Your items are held for</p>
          <div className="count">
            {mm}:{ss}
          </div>
          <div className="tabs" role="tablist" aria-label="Payment method">
            {(Object.keys(LABEL) as Method[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={method === m}
                className={method === m ? "on" : ""}
                onClick={() => {
                  setMethod(m);
                  setMsg(null);
                }}
              >
                {LABEL[m]}
              </button>
            ))}
          </div>
          {method === "upi" &&
            field(
              "UPI ID",
              <input
                value={vpa}
                placeholder="name@bank"
                autoComplete="off"
                onChange={(e) => setVpa(e.target.value)}
              />,
            )}
          {method === "card" && (
            <>
              {field(
                "Card number",
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="4242 4242 4242 4242"
                  value={card.number}
                  onChange={(e) => setCard({ ...card, number: e.target.value })}
                />,
              )}
              <div className="two">
                {field(
                  "Expiry (MM/YY)",
                  <input
                    autoComplete="off"
                    placeholder="12/35"
                    value={card.expiry}
                    onChange={(e) =>
                      setCard({ ...card, expiry: e.target.value })
                    }
                  />,
                )}
                {field(
                  "CVV",
                  <input
                    inputMode="numeric"
                    type="password"
                    autoComplete="off"
                    maxLength={4}
                    value={card.cvv}
                    onChange={(e) => setCard({ ...card, cvv: e.target.value })}
                  />,
                )}
              </div>
              {field(
                "Name on card",
                <input
                  autoComplete="off"
                  value={card.name}
                  onChange={(e) => setCard({ ...card, name: e.target.value })}
                />,
              )}
            </>
          )}
          {method === "netbanking" &&
            field(
              "Bank",
              <select value={bank} onChange={(e) => setBank(e.target.value)}>
                <option value="">Choose your bank</option>
                {BANKS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>,
            )}
          <details className="demo">
            <summary>Demo tools (for reviewers)</summary>
            {field(
              "Demo outcome",
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              >
                <option value="success">Payment succeeds</option>
                <option value="decline">Payment is declined</option>
                <option value="wrong_amount">
                  Provider sends the wrong amount
                </option>
                <option value="duplicate">
                  Provider sends the event twice
                </option>
              </select>,
            )}
          </details>
          {msg && (
            <div className={`banner ${msg.bad ? "bad" : "ok"}`} role="alert">
              {msg.text}
            </div>
          )}
          <button className="primary" disabled={paying} onClick={pay}>
            {paying ? "Processing…" : `Pay ${rupees(order.totalPaise)}`}
          </button>
          <p className="muted">
            Waiting for payment confirmation. This screen updates by itself.
          </p>
          <div className="chips">
            <button onClick={() => onHelp("Which payment method is fastest?")}>
              Which method is fastest?
            </button>
            <button
              onClick={() => onHelp("My payment failed, what should I do?")}
            >
              My payment failed
            </button>
          </div>
        </>
      )}

      {order.status === "paid" && (
        <div className="banner ok" role="status">
          <strong>Thank you! Payment received</strong> (
          {order.paymentMethod ? LABEL[order.paymentMethod as Method] : "paid"}
          ). Go to the locker to collect your order.
          <div>
            <button className="primary" disabled={claiming} onClick={collect}>
              {claiming ? "Opening…" : "I’m at the locker (demo)"}
            </button>
          </div>
        </div>
      )}
      {order.status === "claimed" && (
        <div className="banner ok" role="status">
          <strong>
            Order {ref} collected. Thank you for shopping with us!
          </strong>{" "}
          Enjoy your snacks, and see you again soon.
        </div>
      )}
      {order.status === "expired" &&
        (checking ? (
          <div className="banner" role="status">
            Time ran out. We’re checking for a payment that may still be
            arriving. This screen will update by itself.
          </div>
        ) : (
          <div className="banner bad" role="alert">
            Time ran out and the hold was released. If you were charged, keep
            reference {ref.toUpperCase()} so staff can review your payment.
          </div>
        ))}
      {order.status === "needs_review" && (
        <div className="banner" role="alert">
          We received your payment but need to check it (
          {order.reviewReason === "amount_mismatch"
            ? "the amount did not match"
            : order.reviewReason === "late_payment_window_elapsed"
              ? "it arrived after the late-payment window"
              : "the items sold out while paying"}
          ). Staff will help you shortly. Keep order {ref}.
        </div>
      )}
      {order.status === "refunded" && (
        <div className="banner" role="status">
          This order was refunded.
        </div>
      )}
      {FINAL.includes(order.status) && order.status !== "paid" && (
        <button onClick={onDone}>Start a new order</button>
      )}
    </>
  );
}
