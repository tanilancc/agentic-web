// Green Fork's menu and rules. Bowls and salads: vegan and gluten-free, dearer per
// serving, with an afternoon discount.
export const CATALOG = {
  id: "green_fork",
  name: "Green Fork",
  codePrefix: "GF",
  items: [
    { id: "quinoa-bowl", name: "Roasted quinoa bowl", priceCents: 1150, serves: 1, diets: ["vegan", "gluten-free"] },
    { id: "chicken-salad", name: "Herb chicken salad", priceCents: 1250, serves: 1, diets: ["gluten-free"] },
    { id: "halloumi-wrap", name: "Halloumi wrap", priceCents: 1050, serves: 1, diets: ["vegetarian"] },
    { id: "falafel-platter", name: "Falafel sharing platter", priceCents: 4200, serves: 6, diets: ["vegan"] },
  ],
  minOrderCents: 3000,
  delivery: { feeCents: 799, freeOverCents: 15000, leadMinutes: 120 },
  pickup: { discountPct: 0 },
  hours: { from: "10:00", to: "20:00" },
  slotMinutes: 30,
  tiers: [{ minItems: 10, discountPct: 5 }],
  offPeak: { from: "14:30", to: "17:00", discountPct: 20 },
};
