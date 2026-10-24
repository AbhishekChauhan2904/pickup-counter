import { useEffect, useState } from "react";
import { api, type Product, type Cart } from "./api";
import Header from "./Header";
import Shop from "./Shop";
import CartDrawer from "./CartDrawer";
import Payment from "./Payment";
import Chat from "./Chat";
import Boundary from "./Boundary";

export default function App() {
  const [orderId, setOrderId] = useState<string | null>(() =>
    localStorage.getItem("orderId"),
  ); // survives refresh
  const [cart, setCart] = useState<Cart>({});
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadError, setLoadError] = useState("");
  const [seed, setSeed] = useState<{ text: string; n: number } | null>(null);

  const load = () =>
    api<Product[]>("/products")
      .then((p) => {
        setProducts(p);
        setLoadError("");
      })
      .catch((e) => setLoadError(e.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const lines = products.filter((p) => (cart[p.id] ?? 0) > 0);
  const count = lines.reduce((s, p) => s + cart[p.id], 0);
  const total = lines.reduce((s, p) => s + cart[p.id] * p.price_paise, 0);
  const finish = () => {
    localStorage.removeItem("orderId");
    setOrderId(null);
    setCart({});
  };

  return (
    <>
      <Header
        shopping={!orderId}
        search={search}
        setSearch={setSearch}
        count={count}
        total={total}
        onCart={() => setDrawer(true)}
      />
      <main className={orderId ? "wrap narrow" : "wrap"}>
        <Boundary name={orderId ? "payment" : "shop"}>
          {orderId ? (
            <Payment
              id={orderId}
              onDone={finish}
              onHelp={(text) => setSeed({ text, n: Date.now() })}
            />
          ) : (
            <Shop
              products={products}
              loadError={loadError}
              reload={load}
              cart={cart}
              setCart={setCart}
              search={search}
            />
          )}
        </Boundary>
        <Boundary name="cart">
          <CartDrawer
            open={drawer && !orderId}
            onClose={() => setDrawer(false)}
            products={products}
            cart={cart}
            setCart={setCart}
            reload={load}
            onPlaced={(id) => {
              localStorage.setItem("orderId", id);
              setOrderId(id);
            }}
          />
        </Boundary>
        <Boundary name="assistant">
          {/* The assistant only fills the cart and opens it. The customer still has to press "Place order and pay". */}
          <Chat
            orderId={orderId}
            seed={seed}
            onAdd={(items) => {
              setCart(
                Object.fromEntries(items.map((i) => [i.productId, i.quantity])),
              );
              setDrawer(true);
            }}
          />
        </Boundary>
      </main>
    </>
  );
}
