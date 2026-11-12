import { describe, expect, it } from "vitest";
import { parsePriceLines } from "@/lib/rules";
import {
  changeTone,
  consistencyScore,
  criteriaChecklist,
  lastChange,
  listPriceAt,
  priceDifference,
  priceSpread,
  rateCardText,
  rateCardType,
  showsInline,
} from "@/lib/supplier-rules";

const d = (s: string) => new Date(s + "T12:00:00");

describe("price change colours", () => {
  it("red when dearer, green when cheaper, grey for tiny moves", () => {
    expect(changeTone(14)).toBe("red");
    expect(changeTone(-5)).toBe("green");
    expect(changeTone(2)).toBe("grey");
    expect(changeTone(-1)).toBe("grey");
  });
});

describe("last list price change", () => {
  it("ignores the first listing and same-price re-saves", () => {
    const c = lastChange([
      { at: d("2026-09-01"), oldPrice: null, newPrice: 21000 },
      { at: d("2026-10-10"), oldPrice: 21000, newPrice: 22000 },
      { at: d("2026-11-01"), oldPrice: 22000, newPrice: 25000 },
      { at: d("2026-11-05"), oldPrice: 25000, newPrice: 25000 },
    ]);
    expect(c).toMatchObject({ from: 22000, to: 25000, pct: 14 });
  });
  it("is null with no real change", () => {
    expect(lastChange([{ at: d("2026-09-01"), oldPrice: null, newPrice: 5000 }])).toBeNull();
  });
});

describe("list price at a date", () => {
  const changes = [
    { at: d("2026-09-01"), oldPrice: null, newPrice: 21000 },
    { at: d("2026-10-10"), oldPrice: 21000, newPrice: 22000 },
    { at: d("2026-11-01"), oldPrice: 22000, newPrice: 25000 },
  ];
  it("takes the price before the next change", () => {
    expect(listPriceAt(changes, 25000, d("2026-10-20"))).toBe(22000);
    expect(listPriceAt(changes, 25000, d("2026-09-15"))).toBe(21000);
  });
  it("uses today's price after the last change", () => {
    expect(listPriceAt(changes, 25000, d("2026-11-10"))).toBe(25000);
  });
  it("is null before the item was listed", () => {
    expect(listPriceAt(changes, 25000, d("2026-08-01"))).toBeNull();
  });
});

describe("price spread", () => {
  it("rates steady, some movement and unsteady", () => {
    expect(priceSpread([5000, 5100, 5050]).level).toBe("steady");
    expect(priceSpread([20000, 22000]).level).toBe("moving");
    expect(priceSpread([21000, 22000, 25000])).toMatchObject({ level: "unsteady", low: 21000, high: 25000, spreadPct: 18 });
  });
  it("needs two prices", () => {
    expect(priceSpread([5000]).level).toBe("new");
  });
});

describe("consistency score", () => {
  it("counts steady items fully and moving items half", () => {
    expect(consistencyScore(["steady", "steady", "moving", "unsteady"])).toMatchObject({ score: 63, tone: "amber" });
    expect(consistencyScore(["steady", "steady", "new"])).toMatchObject({ score: 100, label: "Consistent" });
  });
  it("loses points for prices away from their list", () => {
    expect(consistencyScore(["steady", "steady"], 2)!.score).toBe(90);
    expect(consistencyScore(["steady"], 20)!.score).toBe(70);
  });
  it("is null with no history", () => {
    expect(consistencyScore(["new", "new"])).toBeNull();
  });
});

describe("price differences", () => {
  it("flags quotes away from the supplier's own list", () => {
    expect(priceDifference(30000, 25000)).toEqual({ pct: 20, tone: "red" });
    expect(priceDifference(22000, 25000)).toEqual({ pct: -12, tone: "amber" });
    expect(priceDifference(25500, 25000)).toBeNull();
    expect(priceDifference(25500, null)).toBeNull();
  });
});

describe("rate cards", () => {
  it("accepts common files and refuses others", () => {
    expect(rateCardType("December Rates.PDF")).toBe("application/pdf");
    expect(rateCardType("photo.jpeg")).toBe("image/jpeg");
    expect(rateCardType("prices.csv")).toBe("text/csv");
    expect(rateCardType("virus.exe")).toBeNull();
    expect(rateCardType("page.html")).toBeNull();
    expect(showsInline("application/pdf")).toBe(true);
    expect(showsInline("text/csv")).toBe(false);
  });
  it("reads a CSV rate card with quoted thousands", () => {
    const text = rateCardText('\uFEFFItem,Unit,Price\r\nTomatoes,basket,25000\r\nRice (long grain),50kg bag,"70,000"\r\n');
    const r = parsePriceLines(text);
    expect(r.items).toEqual([
      { name: "Tomatoes", unit: "basket", price: 25000 },
      { name: "Rice (long grain)", unit: "50kg bag", price: 70000 },
    ]);
    expect(r.errors).toEqual(["Item,Unit,Price"]);
  });
});

describe("supplier criteria", () => {
  it("lists what's missing", () => {
    const c = criteriaChecklist({ cacNumber: "RC123", tin: null, nafdacNumber: null, hygieneCert: true, references: "x", bankAccountNumber: "0123", deliveryAreas: "Wuse", paymentTerms: "" });
    expect(c.done).toBe(5);
    expect(c.checks.filter((x) => !x.ok).map((x) => x.label)).toEqual(["Tax ID (TIN)", "NAFDAC number", "Payment terms"]);
  });
});
