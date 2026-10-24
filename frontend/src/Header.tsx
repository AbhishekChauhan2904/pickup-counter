import { rupees } from "./api";

function Logo() {
  return (
    <a className="logo" href="/" aria-label="Pickup Counter home">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="8" fill="#0f6b4f" />
        <rect x="6" y="6" width="9" height="9" rx="2" fill="#fff" />
        <rect
          x="19"
          y="6"
          width="9"
          height="9"
          rx="2"
          fill="#fff"
          opacity=".55"
        />
        <rect
          x="6"
          y="19"
          width="9"
          height="9"
          rx="2"
          fill="#fff"
          opacity=".55"
        />
        <rect x="19" y="19" width="9" height="9" rx="2" fill="#f5c542" />
        <circle cx="12.5" cy="10.5" r="1" fill="#0f6b4f" />
      </svg>
      <span>
        <strong>pickup</strong> counter
      </span>
    </a>
  );
}

export default function Header({
  shopping,
  search,
  setSearch,
  count,
  total,
  onCart,
}: {
  shopping: boolean;
  search: string;
  setSearch: (s: string) => void;
  count: number;
  total: number;
  onCart: () => void;
}) {
  return (
    <header className="top">
      <div className="top-in">
        <Logo />
        {shopping && (
          <>
            <div className="searchbox">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M16.5 16.5L21 21"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                aria-label="Search snacks"
                placeholder='Search "chips", "spicy", "coffee"'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              className="cartbtn"
              onClick={onCart}
              aria-label={
                count
                  ? `Open cart, ${count} items, ${rupees(total)}`
                  : "Open cart"
              }
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M3 4h2l2.4 11h10.2L20 7H6.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9" cy="19.5" r="1.6" fill="currentColor" />
                <circle cx="17" cy="19.5" r="1.6" fill="currentColor" />
              </svg>
              {count ? (
                <span className="cart-txt">
                  <strong>
                    {count} item{count > 1 ? "s" : ""}
                  </strong>
                  <span>{rupees(total)}</span>
                </span>
              ) : (
                <strong>My cart</strong>
              )}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
