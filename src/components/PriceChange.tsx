import { Pill } from "./ui";

/** A coloured percentage: red when dearer, green when cheaper, nothing within ±2%. */
export function PriceChange({ pct, suffix }: { pct: number | null; suffix?: string }) {
  if (pct == null || Math.abs(pct) <= 2) return null;
  return <Pill tone={pct > 0 ? "red" : "green"}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%{suffix ? ` ${suffix}` : ""}</Pill>;
}
