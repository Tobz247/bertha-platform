import { describe, expect, it } from "vitest";
import {
  expiringBatches,
  invoiceCheck,
  isLow,
  needsApproval,
  orderTotal,
  paymentState,
  quoteBadges,
  receivedTotal,
  suggestedReorder,
  takeFromBatches,
} from "@/lib/rules";

const d = (s: string) => new Date(s + "T12:00:00");

describe("order totals", () => {
  it("adds lines and delivery fee", () => {
    expect(
      orderTotal(
        [
          { quantity: 6, unitPrice: 28000 },
          { quantity: 2, unitPrice: 22000 },
        ],
        5000,
      ),
    ).toBe(217000);
  });
  it("rounds fractional quantities to whole Naira", () => {
    expect(orderTotal([{ quantity: 2.5, unitPrice: 4801 }])).toBe(12003);
  });
  it("values received goods", () => {
    expect(receivedTotal([{ quantity: 20, unitPrice: 5800, receivedQty: 18 }], 2000)).toBe(106400);
  });
});

describe("approval", () => {
  it("needs approval only above the limit", () => {
    expect(needsApproval(500001, 500000)).toBe(true);
    expect(needsApproval(500000, 500000)).toBe(false);
    expect(needsApproval(9_000_000, null)).toBe(false);
  });
});

describe("quote badges", () => {
  it("marks lowest, earliest and top rated", () => {
    const b = quoteBadges([
      { id: "a", total: 412000, deliveryDate: d("2026-11-06"), rating: 4.6 },
      { id: "b", total: 401000, deliveryDate: d("2026-11-07"), rating: 4.1 },
      { id: "c", total: 402000, deliveryDate: d("2026-11-06"), rating: null },
    ]);
    expect(b.a).toEqual(["Earliest delivery", "Top rated"]);
    expect(b.b).toEqual(["Lowest total"]);
    expect(b.c).toEqual(["Earliest delivery"]);
  });
});

describe("payment state", () => {
  it("is not due before goods arrive", () => {
    expect(paymentState({ receivedAt: null, paymentTermsDays: 7, amountDue: 100, paid: 0 }).kind).toBe("not_due");
  });
  it("tracks part payment and due date", () => {
    const s = paymentState({
      receivedAt: d("2026-10-29"),
      paymentTermsDays: 30,
      amountDue: 1_060_000,
      paid: 500_000,
      today: d("2026-11-04"),
    });
    expect(s.kind).toBe("part_paid");
    if (s.kind === "part_paid") {
      expect(s.owed).toBe(560_000);
      expect(s.overdue).toBe(false);
      expect(s.dueDate.getDate()).toBe(28);
    }
  });
  it("flags overdue pay-on-delivery orders", () => {
    const s = paymentState({ receivedAt: d("2026-11-01"), paymentTermsDays: 0, amountDue: 5000, paid: 0, today: d("2026-11-04") });
    expect(s).toMatchObject({ kind: "unpaid", overdue: true });
  });
  it("is paid when nothing is owed", () => {
    expect(paymentState({ receivedAt: d("2026-11-01"), paymentTermsDays: 0, amountDue: 5000, paid: 6000 }).kind).toBe("paid");
  });
});

describe("invoice check", () => {
  it("reports the difference", () => {
    expect(invoiceCheck(118000, 106400)).toEqual({ matches: false, difference: 11600 });
    expect(invoiceCheck(5000, 5000).matches).toBe(true);
  });
});

describe("stock", () => {
  const batches = [
    { id: "new", quantity: 10, receivedAt: d("2026-11-03"), expiresAt: d("2026-11-20") },
    { id: "old", quantity: 4, receivedAt: d("2026-10-20"), expiresAt: d("2026-11-06") },
    { id: "noexp", quantity: 5, receivedAt: d("2026-10-01"), expiresAt: null },
  ];
  it("uses the soonest-expiring batch first", () => {
    expect(takeFromBatches(batches, 6)).toEqual({
      updates: [
        { id: "old", quantity: 0 },
        { id: "new", quantity: 8 },
      ],
      shortfall: 0,
    });
  });
  it("reports a shortfall", () => {
    expect(takeFromBatches(batches, 25).shortfall).toBe(6);
  });
  it("finds expiring batches", () => {
    expect(expiringBatches(batches, 3, d("2026-11-04")).map((b) => b.id)).toEqual(["old"]);
  });
  it("flags low stock", () => {
    expect(isLow(2, 4)).toBe(true);
    expect(isLow(5, 4)).toBe(false);
    expect(isLow(0, 0)).toBe(false);
  });
  it("suggests reorder quantities", () => {
    expect(suggestedReorder(2, 4, 6)).toBe(6);
    expect(suggestedReorder(2, 4, 0)).toBe(6);
  });
});

describe("prices", () => {
  it("matches the same product loosely", async () => {
    const { priceKey } = await import("@/lib/rules");
    expect(priceKey(" Tomatoes ", "Basket")).toBe(priceKey("tomato", "basket"));
    expect(priceKey("Rice", "50kg bag")).not.toBe(priceKey("Rice", "kg"));
    expect(priceKey("Eggs", "crate")).toBe("egg|crate");
    expect(priceKey("Fresh Pepper", "kg")).toBe("fresh pepper|kg");
    expect(priceKey("Irish potatoes", "bag")).toBe(priceKey("Irish potato", "bag"));
    expect(priceKey("Cabbages", "head")).toBe("cabbage|head");
    expect(priceKey("Grass", "kg")).toBe("grass|kg");
  });
  it("takes the median", async () => {
    const { median } = await import("@/lib/rules");
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1000, 2001])).toBe(1501);
  });
  it("flags prices well above your last price, or the market when you have none", async () => {
    const { priceFlag } = await import("@/lib/rules");
    expect(priceFlag(11000, { lastPaid: 10000 })).toBeNull();
    expect(priceFlag(11500, { lastPaid: 10000, market: 20000 })).toEqual({ pct: 15, against: "last", ref: 10000 });
    expect(priceFlag(26000, { lastPaid: null, market: 20000 })).toEqual({ pct: 30, against: "market", ref: 20000 });
    expect(priceFlag(26000, {})).toBeNull();
  });
});

describe("recipes", () => {
  it("costs a dish per portion and notes missing prices", async () => {
    const { recipeCost, foodCostPct } = await import("@/lib/rules");
    const c = recipeCost([{ quantity: 2, unitPrice: 1500 }, { quantity: 0.5, unitPrice: 4000 }, { quantity: 1, unitPrice: null }], 10);
    expect(c).toEqual({ batch: 5000, perPortion: 500, missing: 1 });
    expect(foodCostPct(500, 2000)).toBe(25);
    expect(foodCostPct(500, 0)).toBeNull();
  });
  it("turns dishes sold into ingredient usage", async () => {
    const { dishUsage } = await import("@/lib/rules");
    expect(dishUsage([{ itemId: "rice", quantity: 2 }, { itemId: "oil", quantity: 0.3 }], 15, 10)).toEqual([
      { itemId: "rice", quantity: 3 },
      { itemId: "oil", quantity: 0.45 },
    ]);
  });
  it("splits where stock went", async () => {
    const { usageBreakdown } = await import("@/lib/rules");
    expect(
      usageBreakdown([
        { type: "SOLD", quantity: -3 },
        { type: "USED", quantity: -1 },
        { type: "WASTED", quantity: -0.5 },
        { type: "COUNT_ADJUST", quantity: -0.25 },
        { type: "RECEIVED", quantity: 10 },
      ]),
    ).toEqual({ sold: 3, used: 1, wasted: 0.5, unexplained: 0.25 });
  });
});

describe("portion control", () => {
  it("works out cost per piece, piece weight and yield", async () => {
    const { portionResult } = await import("@/lib/rules");
    expect(portionResult({ inputQty: 10, inputUnit: "kg", pieces: 30, totalWeightKg: 8.4, unitPrice: 4800 })).toEqual({
      cost: 48000,
      costPerPiece: 1600,
      avgPieceGrams: 280,
      yieldPct: 84,
    });
  });
  it("leaves yield unknown when not weighed or not in kg", async () => {
    const { portionResult } = await import("@/lib/rules");
    expect(portionResult({ inputQty: 1, inputUnit: "carton", pieces: 40, totalWeightKg: 9, unitPrice: 50000 }).yieldPct).toBeNull();
    expect(portionResult({ inputQty: 5, inputUnit: "KG", pieces: 20, totalWeightKg: null, unitPrice: null })).toEqual({
      cost: 0, costPerPiece: 0, avgPieceGrams: null, yieldPct: null,
    });
  });
});

describe("admin supplier set-up", () => {
  it("reads a typed price list", async () => {
    const { parsePriceLines } = await import("@/lib/rules");
    expect(parsePriceLines("Tomatoes, basket, 25,000\n\nRice (long grain), 50kg bag, ₦70000\nOnions; bag; N 61,500\nbad line\nPepper, basket, 0")).toEqual({
      items: [
        { name: "Tomatoes", unit: "basket", price: 25000 },
        { name: "Rice (long grain)", unit: "50kg bag", price: 70000 },
        { name: "Onions", unit: "bag", price: 61500 },
      ],
      errors: ["bad line", "Pepper, basket, 0"],
    });
  });
  it("makes a login from a phone number", async () => {
    const { phoneLogin } = await import("@/lib/rules");
    expect(phoneLogin("0803 555 0192")).toBe("08035550192@supplier.bertha");
    expect(phoneLogin("+234 803 555 0192")).toBe("08035550192@supplier.bertha");
  });
});
