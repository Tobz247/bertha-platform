import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { showsInline } from "@/lib/supplier-rules";

/** Opens a supplier's rate card: for the supplier, platform admins, and buyers once the supplier is verified. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return new Response("Sign in to see this rate card.", { status: 401 });
  const card = await db.rateCard.findUnique({ where: { id }, include: { supplier: { select: { verification: true } } } });
  const allowed =
    card &&
    (user.isPlatformAdmin ||
      user.businessId === card.supplierId ||
      (user.business?.type === "BUYER" && card.supplier.verification === "VERIFIED"));
  if (!card || !allowed) return new Response("Rate card not found.", { status: 404 });
  const name = card.fileName.replace(/[^\w.\- ()]/g, "_");
  return new Response(new Uint8Array(card.data), {
    headers: {
      "Content-Type": card.mimeType,
      "Content-Length": String(card.size),
      "Content-Disposition": `${showsInline(card.mimeType) ? "inline" : "attachment"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(card.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
