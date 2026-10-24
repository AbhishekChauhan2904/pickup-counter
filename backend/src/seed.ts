import type { Pool } from "pg";
// Sample data: 2 categories, 5 sub-categories, 9 products. Money in whole paise.
const TREE: Record<
  string,
  Record<string, [string, number, number, string[], string][]>
> = {
  Snacks: {
    Chips: [
      [
        "Masala Chips",
        2000,
        10,
        ["spicy", "salty"],
        "Crinkle-cut potato chips with a tangy masala dusting. 40 g pack.",
      ],
      [
        "Salted Chips",
        1800,
        10,
        ["salty"],
        "Classic thin potato chips, lightly salted. 40 g pack.",
      ],
    ],
    "Namkeen & Mix": [
      [
        "Spicy Namkeen Mix",
        3000,
        12,
        ["spicy", "salty"],
        "Crunchy sev, peanuts and lentils with red chilli. 100 g pack.",
      ],
      [
        "Roasted Peanuts",
        2500,
        8,
        ["salty"],
        "Dry-roasted peanuts with a pinch of salt. 80 g pack. Contains peanuts.",
      ],
    ],
    Sweets: [
      [
        "Peanut Chikki",
        1500,
        8,
        ["sweet"],
        "Jaggery and peanut brittle bar. 50 g. Contains peanuts.",
      ],
      [
        "Kaju Barfi",
        6000,
        4,
        ["sweet"],
        "Cashew fudge squares, 4 pieces. Contains cashew and milk.",
      ],
    ],
  },
  Drinks: {
    Coffee: [
      [
        "Cold Coffee",
        4500,
        6,
        ["drink", "sweet"],
        "Chilled milk coffee, 250 ml bottle. Contains milk.",
      ],
    ],
    Juices: [
      [
        "Mango Juice",
        3500,
        5,
        ["drink", "sweet"],
        "Alphonso mango drink, 200 ml carton.",
      ],
      [
        "Lime Soda",
        3000,
        7,
        ["drink"],
        "Fresh lime soda, lightly salted, 250 ml.",
      ],
    ],
  },
};
export const imageFor = (name: string) =>
  "/products/" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".svg";
export const SEEDED_NAMES = Object.values(TREE).flatMap((s) =>
  Object.values(s).flatMap((ps) => ps.map((p) => p[0])),
);
export async function seed(db: Pool) {
  for (const [parent, subs] of Object.entries(TREE)) {
    const p = (
      await db.query("INSERT INTO categories (name) VALUES ($1) RETURNING id", [
        parent,
      ])
    ).rows[0].id;
    for (const [sub, products] of Object.entries(subs)) {
      const c = (
        await db.query(
          "INSERT INTO categories (name, parent_id) VALUES ($1,$2) RETURNING id",
          [sub, p],
        )
      ).rows[0].id;
      for (const [name, price, stock, tags, description] of products)
        await db.query(
          "INSERT INTO products (name, price_paise, stock, tags, description, category_id, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [name, price, stock, tags, description, c, imageFor(name)],
        );
    }
  }
}
