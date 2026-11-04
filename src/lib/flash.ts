import "server-only";
import { redirect } from "next/navigation";

/** Redirect back to a page with a message the page shows in <Flash>. */
export function back(path: string, kind: "error" | "ok", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function num(fd: FormData, key: string): number {
  const s = str(fd, key).replace(/,/g, "");
  if (s === "") return NaN;
  return Number(s);
}
