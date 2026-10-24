import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { rupees, MAX_ITEM, MAX_TOTAL, type Product, type Cart } from "./api";

export default function Shop({
  products,
  loadError,
  reload,
  cart,
  setCart,
  search,
}: {
  products: Product[];
  loadError: string;
  reload: () => void;
  cart: Cart;
  setCart: Dispatch<SetStateAction<Cart>>;
  search: string;
}) {
  const [parent, setParent] = useState("All");
  const [sub, setSub] = useState("All");
  const [open, setOpen] = useState<number | null>(null);
  const groupOf = (p: Product) => p.parent ?? p.category ?? "Other";
  const parents = useMemo(
    () => ["All", ...new Set(products.map(groupOf))],
    [products],
  );
  const subs = useMemo(
    () => [
      "All",
      ...new Set(
        products
          .filter((p) => parent === "All" || groupOf(p) === parent)
          .map((p) => p.category ?? "Other"),
      ),
    ],
    [products, parent],
  );
  const shown = products.filter(
    (p) =>
      (parent === "All" || groupOf(p) === parent) &&
      (sub === "All" || (p.category ?? "Other") === sub) &&
      `${p.name} ${p.description} ${p.tags.join(" ")} ${p.category ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const canAdd = (p: Product) =>
    (cart[p.id] ?? 0) < Math.min(p.available, MAX_ITEM) && count < MAX_TOTAL;
  const change = (p: Product, d: number) =>
    setCart((c) => ({ ...c, [p.id]: Math.max(0, (c[p.id] ?? 0) + d) }));

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Categories">
        {parents.map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={parent === p}
            className={parent === p ? "on" : ""}
            onClick={() => {
              setParent(p);
              setSub("All");
            }}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="chips" aria-label="Sub-categories">
        {subs.map((s) => (
          <button
            key={s}
            aria-pressed={sub === s}
            className={sub === s ? "on" : ""}
            onClick={() => setSub(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {loadError && (
        <div className="banner bad" role="alert">
          Couldn’t load snacks: {loadError}{" "}
          <button onClick={reload}>Retry</button>
        </div>
      )}
      {!loadError && products.length > 0 && shown.length === 0 && (
        <p className="muted">
          No snacks match “{search}”. Clear the search or pick another category.
        </p>
      )}
      <div className="grid">
        {shown.map((p) => {
          const q = cart[p.id] ?? 0;
          return (
            <article className="card" key={p.id}>
              <div className="img">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} loading="lazy" />
                ) : (
                  <div className="ph" aria-hidden="true">
                    {p.name[0]}
                  </div>
                )}
                {p.available < 1 && <span className="tag out">Sold out</span>}
                {p.available > 0 && p.available <= 3 && (
                  <span className="tag low">Only {p.available} left</span>
                )}
              </div>
              <h3>{p.name}</h3>
              <p className="muted sub">
                {p.category ?? "Snack"} · {p.available} in stock
              </p>
              <button
                className="link"
                aria-expanded={open === p.id}
                onClick={() => setOpen(open === p.id ? null : p.id)}
              >
                {open === p.id ? "Hide details" : "Details"}
              </button>
              {open === p.id && <p className="muted desc">{p.description}</p>}
              <div className="buy">
                <strong>{rupees(p.price_paise)}</strong>
                {q === 0 ? (
                  <button
                    className="add"
                    disabled={p.available < 1 || !canAdd(p)}
                    onClick={() => change(p, 1)}
                    aria-label={`Add ${p.name}`}
                  >
                    ADD
                  </button>
                ) : (
                  <div className="step">
                    <button
                      aria-label={`Remove one ${p.name}`}
                      onClick={() => change(p, -1)}
                    >
                      −
                    </button>
                    <span aria-live="polite">{q}</span>
                    <button
                      aria-label={`Add one ${p.name}`}
                      disabled={!canAdd(p)}
                      onClick={() => change(p, 1)}
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
