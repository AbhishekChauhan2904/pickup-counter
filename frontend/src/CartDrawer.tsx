import { useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  rupees,
  type Product,
  type Cart,
  MAX_ITEM,
  MAX_TOTAL,
} from "./api";

export default function CartDrawer({
  open,
  onClose,
  products,
  cart,
  setCart,
  onPlaced,
  reload,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  cart: Cart;
  setCart: (u: (c: Cart) => Cart) => void;
  onPlaced: (id: string) => void;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idem = useRef(crypto.randomUUID()); // same key for retries / double clicks of this cart
  const lines = products.filter((p) => (cart[p.id] ?? 0) > 0);
  const count = lines.reduce((s, p) => s + cart[p.id], 0);
  const total = lines.reduce((s, p) => s + cart[p.id] * p.price_paise, 0);
  const change = (p: Product, d: number) =>
    setCart((c) => ({ ...c, [p.id]: Math.max(0, (c[p.id] ?? 0) + d) }));
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;

  async function place() {
    setBusy(true);
    setError("");
    try {
      const items = lines.map((p) => ({
        productId: p.id,
        quantity: cart[p.id],
      }));
      const o = await api<{ id: string }>("/orders", {
        method: "POST",
        headers: { "idempotency-key": idem.current },
        body: JSON.stringify({ items }),
      });
      onClose();
      onPlaced(o.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "INSUFFICIENT_STOCK")
        setError(
          e.details
            .map(
              (d: any) =>
                `Only ${d.available} ${d.name} left (you asked for ${d.requested}).`,
            )
            .join(" "),
        );
      else setError((e as Error).message);
      idem.current = crypto.randomUUID();
      reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="overlay" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="My cart"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <h2>My cart</h2>
          <button onClick={onClose} aria-label="Close cart">
            Close
          </button>
        </div>
        <div className="drawer-body">
          {lines.length === 0 && (
            <p className="muted">
              Your cart is empty. Add a snack, or ask the assistant to suggest
              some.
            </p>
          )}
          {lines.map((p) => (
            <div className="line" key={p.id}>
              {p.image_url && <img src={p.image_url} alt="" />}
              <div>
                <strong>{p.name}</strong>
                <div className="muted">{rupees(p.price_paise)} each</div>
              </div>
              <div className="step">
                <button
                  aria-label={`Remove one ${p.name}`}
                  onClick={() => change(p, -1)}
                >
                  −
                </button>
                <span>{cart[p.id]}</span>
                <button
                  aria-label={`Add one ${p.name}`}
                  disabled={
                    cart[p.id] >= Math.min(p.available, MAX_ITEM) ||
                    count >= MAX_TOTAL
                  }
                  onClick={() => change(p, 1)}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="drawer-foot">
          {error && (
            <div className="banner bad" role="alert">
              {error}
            </div>
          )}
          <div className="row" style={{ borderBottom: 0 }}>
            <strong>Total</strong>
            <strong>{rupees(total)}</strong>
          </div>
          <button
            className="primary wide"
            disabled={busy || count === 0}
            onClick={place}
          >
            {busy ? "Placing…" : `Place order and pay · ${rupees(total)}`}
          </button>
          <p className="muted">
            Your items are held for 2 minutes once you place the order.
          </p>
        </div>
      </aside>
    </div>
  );
}
