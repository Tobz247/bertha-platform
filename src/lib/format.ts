const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function naira(n: number): string {
  return "₦" + Math.round(n).toLocaleString("en-NG");
}

export function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}

export function day(d: Date | null | undefined): string {
  if (!d) return "";
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function dateInput(d: Date | null | undefined): string {
  if (!d) return "";
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
}

export function parseDateInput(s: string): Date {
  // Treat as midday local time so it never slips a day.
  return new Date(s + "T12:00:00");
}

export const rfqNo = (n: number) => `RFQ-${String(n).padStart(4, "0")}`;
export const poNo = (n: number) => `PO-${String(n).padStart(4, "0")}`;

export const LOCATION_LABEL: Record<string, string> = {
  DRY_STORE: "Dry store",
  COLD_ROOM: "Cold room",
  FREEZER: "Freezer",
  OTHER: "Other",
};

export const ORDER_STATUS: Record<string, { label: string; tone: "amber" | "blue" | "green" | "red" | "grey" }> = {
  AWAITING_APPROVAL: { label: "Awaiting approval", tone: "amber" },
  NOT_APPROVED: { label: "Not approved", tone: "red" },
  AWAITING_SUPPLIER: { label: "Awaiting supplier", tone: "blue" },
  DECLINED: { label: "Declined by supplier", tone: "red" },
  CONFIRMED: { label: "Confirmed", tone: "blue" },
  DISPATCHED: { label: "On the way", tone: "blue" },
  RECEIVED: { label: "Delivered", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "grey" },
};

/** Areas of the FCT used for addresses and supplier coverage. */
export const ABUJA_AREAS = [
  "Asokoro", "Apo", "Bwari", "Central Area", "Dutse", "Garki", "Gwagwalada", "Gwarinpa", "Jabi",
  "Jahi", "Karu", "Kubwa", "Kuje", "Lugbe", "Maitama", "Life Camp", "Utako", "Wuse", "Wuye", "Other",
];
