// Pure rules for supplier criteria, rate cards and price consistency. No database access.

import { median, pctDiff } from "./rules";

/* ---------------- supplier criteria ---------------- */

export const SUPPLIER_KINDS = ["Farmer", "Market trader", "Wholesaler", "Distributor", "Manufacturer", "Importer"];
export const DELIVERY_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const PAYMENT_TERMS: { value: string; label: string }[] = [
  { value: "CASH", label: "Cash on delivery" },
  { value: "TRANSFER", label: "Transfer on delivery" },
  { value: "7", label: "7 days credit" },
  { value: "14", label: "14 days credit" },
  { value: "30", label: "30 days credit" },
];

export function splitList(s: string | null | undefined): string[] {
  return (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

export function noticeLabel(days: number | null | undefined): string | null {
  if (days == null) return null;
  return days === 0 ? "same-day orders" : `${days} day${days > 1 ? "s" : ""} notice`;
}

/** How complete a supplier's criteria are, out of the checks an admin looks at. */
export function criteriaChecklist(s: {
  cacNumber: string | null;
  tin: string | null;
  nafdacNumber: string | null;
  hygieneCert: boolean;
  references: string | null;
  bankAccountNumber: string | null;
  deliveryAreas: string | null;
  paymentTerms: string | null;
}) {
  const checks = [
    { label: "CAC number", ok: !!s.cacNumber },
    { label: "Tax ID (TIN)", ok: !!s.tin },
    { label: "NAFDAC number", ok: !!s.nafdacNumber },
    { label: "Hygiene certificate", ok: s.hygieneCert },
    { label: "References", ok: !!s.references },
    { label: "Bank details", ok: !!s.bankAccountNumber },
    { label: "Delivery areas", ok: splitList(s.deliveryAreas).length > 0 },
    { label: "Payment terms", ok: splitList(s.paymentTerms).length > 0 },
  ];
  return { checks, done: checks.filter((c) => c.ok).length, total: checks.length };
}

/* ---------------- rate cards ---------------- */

export const RATE_CARD_MAX_BYTES = 4 * 1024 * 1024;

const RATE_CARD_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  csv: "text/csv",
  txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** The content type to store and serve a rate card with, or null if the file type isn't accepted. */
export function rateCardType(fileName: string): string | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return RATE_CARD_TYPES[ext] ?? null;
}

/** Cleans a CSV rate card for parsePriceLines: drops a byte-order mark and spreadsheet quotes. */
export function rateCardText(raw: string): string {
  return raw.replace(/^\uFEFF/, "").replace(/"/g, "");
}

export function isTextRateCard(fileName: string): boolean {
  return /\.(csv|txt)$/i.test(fileName);
}

/** Types a browser can show in a tab; anything else downloads. */
export function showsInline(mimeType: string): boolean {
  return mimeType === "application/pdf" || (mimeType.startsWith("image/") && mimeType !== "image/heic");
}

export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ---------------- price changes and consistency ---------------- */

/** Below this % a price change is treated as no change. */
export const CHANGE_NOISE_PCT = 2;
/** A charged or quoted price this far from the supplier's own list price is flagged. */
export const DIFFERENCE_PCT = 5;
/** Prices spread within this % over the period count as steady; up to MOVING_PCT as some movement. */
export const STEADY_PCT = 5;
export const MOVING_PCT = 15;
export const CONSISTENCY_DAYS = 90;

export type Tone = "green" | "amber" | "red" | "grey";

/** Colour for a price change: red dearer, green cheaper, grey no real change. */
export function changeTone(pct: number): Tone {
  if (pct > CHANGE_NOISE_PCT) return "red";
  if (pct < -CHANGE_NOISE_PCT) return "green";
  return "grey";
}

export type ListChange = { at: Date; oldPrice: number | null; newPrice: number };

/** The most recent real price change (ignores first listing and re-saves at the same price). */
export function lastChange(changes: ListChange[]): { at: Date; from: number; to: number; pct: number } | null {
  const real = changes.filter((c) => c.oldPrice != null && c.oldPrice > 0 && c.oldPrice !== c.newPrice).sort((a, b) => b.at.getTime() - a.at.getTime());
  if (!real.length) return null;
  const c = real[0];
  return { at: c.at, from: c.oldPrice!, to: c.newPrice, pct: pctDiff(c.newPrice, c.oldPrice!) };
}

/**
 * The supplier's list price at a moment, worked out from the change history and today's price.
 * Null when the item wasn't on the list then.
 */
export function listPriceAt(changes: ListChange[], current: number | null, at: Date): number | null {
  const after = changes.filter((c) => c.at.getTime() > at.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime());
  if (after.length) return after[0].oldPrice;
  return current;
}

export type Steadiness = "steady" | "moving" | "unsteady" | "new";

/** How far an item's prices spread over the period, as a % of the middle price. */
export function priceSpread(prices: number[]): { spreadPct: number; low: number; high: number; level: Steadiness } {
  const p = prices.filter((x) => x > 0);
  if (p.length < 2) return { spreadPct: 0, low: p[0] ?? 0, high: p[0] ?? 0, level: "new" };
  const low = Math.min(...p);
  const high = Math.max(...p);
  const mid = median(p)!;
  const spreadPct = mid > 0 ? Math.round(((high - low) / mid) * 100) : 0;
  const level: Steadiness = spreadPct <= STEADY_PCT ? "steady" : spreadPct <= MOVING_PCT ? "moving" : "unsteady";
  return { spreadPct, low, high, level };
}

export const STEADINESS: Record<Steadiness, { label: string; tone: Tone }> = {
  steady: { label: "Steady", tone: "green" },
  moving: { label: "Some movement", tone: "amber" },
  unsteady: { label: "Unsteady", tone: "red" },
  new: { label: "Not enough history", tone: "grey" },
};

/**
 * A supplier's consistency score out of 100: steady items count fully, items with some movement
 * count half, and every price charged or quoted away from their own list costs a little more.
 * Null until at least one item has enough history.
 */
export function consistencyScore(levels: Steadiness[], differences = 0): { score: number; label: string; tone: Tone } | null {
  const rated = levels.filter((l) => l !== "new");
  if (!rated.length) return null;
  const base = rated.reduce((s, l) => s + (l === "steady" ? 1 : l === "moving" ? 0.5 : 0), 0) / rated.length;
  const penalty = Math.min(0.3, (differences / Math.max(rated.length, 1)) * 0.1);
  const score = Math.max(0, Math.round((base - penalty) * 100));
  return score >= 80 ? { score, label: "Consistent", tone: "green" } : score >= 50 ? { score, label: "Some changes", tone: "amber" } : { score, label: "Inconsistent", tone: "red" };
}

/** A price charged or quoted that isn't the supplier's own list price at the time. */
export function priceDifference(charged: number, listed: number | null, threshold = DIFFERENCE_PCT): { pct: number; tone: Tone } | null {
  if (listed == null || listed <= 0) return null;
  const pct = pctDiff(charged, listed);
  if (Math.abs(pct) <= threshold) return null;
  return { pct, tone: pct > 0 ? "red" : "amber" };
}
