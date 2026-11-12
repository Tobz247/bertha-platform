import { describe, expect, it } from "vitest";
import { areaOnHand, deliveryMatch, issueProgress, itemKey, kitchenNo, linePlan, movedBatches, remainingOf, takeFromAreas } from "@/lib/kitchen-rules";
import { usageBreakdown } from "@/lib/rules";

describe("kitchen requests", () => {
  it("numbers requests", () => {
    expect(kitchenNo(7)).toBe("KR-0007");
  });
  it("uses the approved quantity once reviewed", () => {
    expect(remainingOf({ quantity: 10, approvedQty: 6, issuedQty: 2 })).toBe(4);
    expect(remainingOf({ quantity: 10, approvedQty: null, issuedQty: 0 })).toBe(10);
    expect(remainingOf({ quantity: 10, approvedQty: 5, issuedQty: 7 })).toBe(0);
  });
  it("splits a line into what the store can issue and what to buy", () => {
    expect(linePlan({ quantity: 10, approvedQty: 10, issuedQty: 0 }, 4)).toEqual({ remaining: 10, issueNow: 4, toBuy: 6 });
    expect(linePlan({ quantity: 3, approvedQty: null, issuedQty: 1 }, 20)).toEqual({ remaining: 2, issueNow: 2, toBuy: 0 });
    expect(linePlan({ quantity: 2.5, approvedQty: 2.5, issuedQty: 0 }, null)).toEqual({ remaining: 2.5, issueNow: 0, toBuy: 2.5 });
  });
  it("tracks issue progress", () => {
    expect(issueProgress([{ quantity: 5, approvedQty: 5, issuedQty: 0 }])).toBe("none");
    expect(issueProgress([{ quantity: 5, approvedQty: 5, issuedQty: 2 }])).toBe("part");
    expect(issueProgress([{ quantity: 5, approvedQty: 5, issuedQty: 5 }, { quantity: 1, approvedQty: 0, issuedQty: 0 }])).toBe("all");
  });
  it("matches item names loosely", () => {
    expect(itemKey("Tomatoes ", "Basket")).toBe(itemKey("tomato", "basket"));
  });
});

describe("matching a delivery", () => {
  it("passes a delivery that matches order and request", () => {
    expect(deliveryMatch({ requested: 10, ordered: 10, received: 10, unit: "kg" }).kind).toBe("match");
  });
  it("flags shortages first", () => {
    const r = deliveryMatch({ requested: 10, ordered: 10, received: 8, unit: "kg" });
    expect(r.kind).toBe("short");
    expect(r.label).toBe("Short by 2 kg");
  });
  it("flags over-delivery", () => {
    expect(deliveryMatch({ requested: 10, ordered: 10, received: 12, unit: "kg" }).kind).toBe("over");
  });
  it("doesn't flag an order smaller than the request (the store covered the rest)", () => {
    expect(deliveryMatch({ requested: 10, ordered: 6, received: 6, unit: "kg" }).kind).toBe("match");
  });
  it("flags items the kitchen never asked for", () => {
    expect(deliveryMatch({ requested: null, ordered: 2, received: 2, unit: "bag" }).kind).toBe("extra");
  });
});

describe("usage", () => {
  it("doesn't count moving goods to the kitchen as use", () => {
    expect(usageBreakdown([{ type: "ISSUED", quantity: -3 }, { type: "USED", quantity: -1 }]).used).toBe(1);
  });
});

describe("store and kitchen stock", () => {
  const d = (s: string) => new Date(s + "T12:00:00");
  const batches = [
    { id: "s1", area: "STORE", quantity: 10, receivedAt: d("2026-11-01"), expiresAt: d("2026-11-20") },
    { id: "s2", area: "STORE", quantity: 5, receivedAt: d("2026-11-05"), expiresAt: d("2026-11-15") },
    { id: "k1", area: "KITCHEN", quantity: 3, receivedAt: d("2026-11-02"), expiresAt: null },
  ];
  it("splits on-hand by area", () => {
    expect(areaOnHand(batches, "STORE")).toBe(15);
    expect(areaOnHand(batches, "KITCHEN")).toBe(3);
  });
  it("takes kitchen stock first for dishes sold, then the store", () => {
    const r = takeFromAreas(batches, 5, ["KITCHEN", "STORE"]);
    expect(r.updates).toEqual([{ id: "k1", quantity: 0 }, { id: "s2", quantity: 3 }]);
    expect(r.shortfall).toBe(0);
  });
  it("only touches the store when issuing", () => {
    const r = takeFromAreas(batches, 20, ["STORE"]);
    expect(r.shortfall).toBe(5);
    expect(r.updates.map((u) => u.id)).toEqual(["s2", "s1"]);
  });
  it("keeps use-by dates when moving goods to the kitchen", () => {
    const r = takeFromAreas(batches, 7, ["STORE"]);
    expect(movedBatches(batches, r.updates)).toEqual([
      { quantity: 5, expiresAt: d("2026-11-15"), receivedAt: d("2026-11-05") },
      { quantity: 2, expiresAt: d("2026-11-20"), receivedAt: d("2026-11-01") },
    ]);
  });
});
