import { addDays, startOfDay } from "./rules";
import { parseDateInput } from "./format";

/** Date range from ?from=YYYY-MM-DD&to=YYYY-MM-DD (to is inclusive). Defaults to the last 7 days. */
export function receivedRange(sp: Record<string, string | undefined>) {
  const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const toDay = ok(sp.to) ? startOfDay(parseDateInput(sp.to!)) : startOfDay(new Date());
  const fromDay = ok(sp.from) ? startOfDay(parseDateInput(sp.from!)) : addDays(toDay, -6);
  return { from: fromDay, to: addDays(toDay, 1), fromDay, toDay };
}
