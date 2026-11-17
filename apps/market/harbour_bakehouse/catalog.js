// Harbour Bakehouse's menu and rules. Sandwich platters for groups: mixed diets, a
// pickup discount, a high minimum order and long notice.
export const CATALOG = {
  id: "harbour_bakehouse",
  name: "Harbour Bakehouse",
  codePrefix: "HB",
  items: [
    { id: "classic-platter", name: "Classic sandwich platter", priceCents: 5400, serves: 8, diets: [] },
    { id: "veggie-platter", name: "Vegetarian sandwich platter", priceCents: 4800, serves: 8, diets: ["vegetarian"] },
    { id: "gf-platter", name: "Gluten-free sandwich platter", priceCents: 5600, serves: 6, diets: ["gluten-free", "vegetarian"] },
    { id: "vegan-platter", name: "Vegan sandwich platter", priceCents: 5200, serves: 6, diets: ["vegan"] },
  ],
  minOrderCents: 8000,
  delivery: { feeCents: 1200, freeOverCents: 25000, leadMinutes: 180 },
  pickup: { discountPct: 12 },
  hours: { from: "08:00", to: "18:00" },
  slotMinutes: 60,
  tiers: [{ minItems: 4, discountPct: 5 }],
  offPeak: null,
};
