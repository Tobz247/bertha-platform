// Pure rules for kitchen requests, store issues and matching deliveries. No database access.
import { priceKey, round3 } from "./rules";

export const kitchenNo = (n: number) => `KR-${String(n).padStart(4, "0")}`;

/** Sections of a hotel or restaurant that ask the store for goods. */
export const DEPARTMENTS = ["Kitchen", "Pastry", "Bar", "Restaurant", "Banquet", "Room service", "Housekeeping", "Staff canteen"];

type KLine = { quantity: number; approvedQty: number | null; issuedQty: number };

/** What procurement approved, or what was asked for while it is still under review. */
export const approvedOf = (l: { quantity: number; approvedQty: number | null }) => l.approvedQty ?? l.quantity;

/** Still to give out from the store for one line. */
export const remainingOf = (l: KLine) => Math.max(0, round3(approvedOf(l) - l.issuedQty));

/**
 * For one line: how much the store can issue now and how much has to be bought.
 * `onHand` is null when the item isn't tracked in stock at all.
 */
export function linePlan(l: KLine, onHand: number | null) {
  const remaining = remainingOf(l);
  const have = Math.max(0, onHand ?? 0);
  const issueNow = round3(Math.min(remaining, have));
  return { remaining, issueNow, toBuy: round3(remaining - issueNow) };
}

/** Overall progress of an approved kitchen request. */
export function issueProgress(lines: KLine[]): "none" | "part" | "all" {
  const live = lines.filter((l) => approvedOf(l) > 0);
  if (live.length === 0 || live.every((l) => remainingOf(l) === 0)) return "all";
  return lines.some((l) => l.issuedQty > 0) ? "part" : "none";
}

/** Matches a kitchen line to a stock item or an order line: case, spacing and plural "s" ignored. */
export const itemKey = priceKey;

export type MatchResult = { kind: "match" | "short" | "over" | "extra"; label: string; tone: "green" | "amber" | "red" };

/**
 * Checks one delivered line against the purchase order, and flags items that weren't on the kitchen
 * request it was bought for. (The order can rightly be smaller than the kitchen's request when the
 * store covered part of it, so ordered vs requested is shown but not flagged.)
 */
export function deliveryMatch(args: { requested: number | null; ordered: number; received: number; unit: string }): MatchResult {
  const { requested, ordered, received, unit } = args;
  if (received < ordered) return { kind: "short", label: `Short by ${fmt(ordered - received)} ${unit}`, tone: "red" };
  if (received > ordered) return { kind: "over", label: `${fmt(received - ordered)} ${unit} more than ordered`, tone: "amber" };
  if (requested == null) return { kind: "extra", label: "Not on the kitchen request", tone: "amber" };
  return { kind: "match", label: "Matches", tone: "green" };
}

/** True when every line of a delivery matches (no shortages, no extras). */
export function deliveryAllMatch(results: MatchResult[]) {
  return results.every((r) => r.kind === "match");
}

const fmt = (n: number) => {
  const r = round3(n);
  return String(r);
};
