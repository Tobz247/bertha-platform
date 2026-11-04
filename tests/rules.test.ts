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
