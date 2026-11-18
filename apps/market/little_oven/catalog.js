// Little Oven's menu and rules. Pizza: cheap per serving, strong volume discounts,
// no gluten-free dough.
export const CATALOG = {
  id: "little_oven",
  name: "Little Oven Pizza",
  codePrefix: "LO",
  items: [
    { id: "margherita", name: "Margherita", priceCents: 1400, serves: 3, diets: ["vegetarian"] },
    { id: "garden", name: "Garden vegetable", priceCents: 1600, serves: 3, diets: ["vegetarian"] },
    { id: "marinara", name: "Vegan marinara", priceCents: 1300, serves: 3, diets: ["vegan"] },
    { id: "pepperoni", name: "Pepperoni", priceCents: 1700, serves: 3, diets: [] },
  ],
  minOrderCents: 2500,
  delivery: { feeCents: 499, freeOverCents: 6000, leadMinutes: 90 },
  pickup: { discountPct: 0 },
  hours: { from: "11:00", to: "21:30" },
  slotMinutes: 30,
  tiers: [{ minItems: 5, discountPct: 8 }, { minItems: 10, discountPct: 15 }, { minItems: 20, discountPct: 20 }],
  offPeak: null,
};
