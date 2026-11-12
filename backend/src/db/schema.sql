CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise > 0),
  stock INTEGER NOT NULL CHECK (stock >= 0),          -- safety net: stock can never go negative
  tags TEXT[] NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','claimed','expired','needs_review','refunded')),
  total_paise INTEGER NOT NULL CHECK (total_paise > 0),
  expires_at TIMESTAMPTZ NOT NULL, paid_at TIMESTAMPTZ, claimed_at TIMESTAMPTZ,
  review_reason TEXT, idem_key TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_items (
  order_id UUID NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0), unit_price_paise INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
CREATE TABLE IF NOT EXISTS payment_events (            -- eventId PK = idempotency
  event_id TEXT PRIMARY KEY, order_id TEXT, payload JSONB NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_events (               -- audit trail
  id BIGSERIAL PRIMARY KEY, order_id UUID NOT NULL, type TEXT NOT NULL, detail JSONB, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, name TEXT NOT NULL, parent_id INTEGER REFERENCES categories(id));
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
