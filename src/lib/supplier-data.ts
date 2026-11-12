import "server-only";
import { logPriceChange } from "./consistency";
import { db } from "./db";
import { num, str } from "./flash";
import { parsePriceLines } from "./rules";
import { DELIVERY_DAYS, PAYMENT_TERMS, RATE_CARD_MAX_BYTES, SUPPLIER_KINDS, fileSize, isTextRateCard, rateCardText, rateCardType } from "./supplier-rules";

/** The supplier criteria fields from a form (see SupplierCriteriaFields). */
export function criteriaFromForm(fd: FormData) {
  const picked = (name: string, allowed: string[]) => fd.getAll(name).filter((v): v is string => typeof v === "string" && allowed.includes(v));
  const kind = str(fd, "supplierKind");
  const years = num(fd, "yearsInBusiness");
  const notice = str(fd, "orderNoticeDays");
  const areas = fd.getAll("deliveryAreas").filter((v): v is string => typeof v === "string" && v.trim() !== "");
  return {
    supplierKind: SUPPLIER_KINDS.includes(kind) ? kind : null,
    yearsInBusiness: Number.isFinite(years) && years >= 0 ? Math.round(years) : null,
    deliveryAreas: areas.length ? areas.join(",") : null,
    deliveryDays: picked("deliveryDays", DELIVERY_DAYS).join(",") || null,
    orderNoticeDays: notice === "" ? null : Math.max(0, Math.round(Number(notice) || 0)),
    paymentTerms: picked("paymentTerms", PAYMENT_TERMS.map((p) => p.value)).join(",") || null,
    coldChain: str(fd, "coldChain") === "on",
    hygieneCert: str(fd, "hygieneCert") === "on",
    nafdacNumber: str(fd, "nafdacNumber") || null,
    tin: str(fd, "tin") || null,
    weeklyCapacity: str(fd, "weeklyCapacity") || null,
    references: str(fd, "references") || null,
  };
}

/**
 * Put typed or uploaded "Item, unit, price" lines on a supplier's price list.
 * New items are added; with `updateExisting`, items already listed take the new price.
 */
export async function applyPriceLines(supplierId: string, text: string, opts: { updateExisting: boolean; source: "ADMIN" | "RATE_CARD" | "PRICE_LIST" }) {
  const { items, errors } = parsePriceLines(text);
  const cats = await db.category.findMany({ where: { suppliers: { some: { id: supplierId } } }, select: { id: true } });
  let added = 0;
  let updated = 0;
  for (const i of items) {
    const exists = await db.catalogItem.findUnique({ where: { supplierId_name_unit: { supplierId, name: i.name, unit: i.unit } } });
    if (exists) {
      if (!opts.updateExisting || exists.price === i.price) continue;
      await db.catalogItem.update({ where: { id: exists.id }, data: { price: i.price } });
      await logPriceChange({ supplierId, itemId: exists.id, name: exists.name, unit: exists.unit, oldPrice: exists.price, newPrice: i.price, source: opts.source });
      updated++;
      continue;
    }
    const created = await db.catalogItem.create({ data: { supplierId, name: i.name, unit: i.unit, price: i.price, categoryId: cats.length === 1 ? cats[0].id : null } });
    await logPriceChange({ supplierId, itemId: created.id, name: i.name, unit: i.unit, oldPrice: null, newPrice: i.price, source: opts.source });
    added++;
  }
  return { added, updated, errors };
}

/** Lines that look like a header row ("Item, Unit, Price") rather than prices. */
function dropHeader(errors: string[]) {
  return errors.filter((e) => /\d/.test(e));
}

/**
 * Save an uploaded rate card. A CSV or text file can also update the price list.
 * Returns a message for the page, or an error.
 */
export async function saveRateCard(fd: FormData, supplierId: string, uploadedBy: string) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  const type = rateCardType(file.name);
  if (!type) return { error: "Upload a PDF, photo (JPG, PNG), spreadsheet (Excel or CSV) or Word file." };
  if (file.size > RATE_CARD_MAX_BYTES) return { error: `That file is ${fileSize(file.size)}. The most we take is ${fileSize(RATE_CARD_MAX_BYTES)}; try a smaller photo or a PDF.` };
  const bytes = Buffer.from(await file.arrayBuffer());
  const validFrom = str(fd, "validFrom");
  await db.rateCard.create({
    data: {
      supplierId,
      fileName: file.name.slice(0, 200),
      mimeType: type,
      size: file.size,
      data: bytes,
      validFrom: validFrom ? new Date(validFrom + "T12:00:00") : null,
      note: str(fd, "note") || null,
      uploadedBy,
    },
  });
  const parts = [`Rate card “${file.name}” uploaded.`];
  let error = false;
  if (str(fd, "apply") === "on") {
    if (!isTextRateCard(file.name)) {
      parts.push("Only CSV or text files can update the price list automatically; enter prices from this one by hand.");
    } else {
      const text = rateCardText(bytes.toString("utf8"));
      const r = await applyPriceLines(supplierId, text, { updateExisting: true, source: "RATE_CARD" });
      const errs = dropHeader(r.errors);
      parts.push(`${r.updated} price${r.updated === 1 ? "" : "s"} changed, ${r.added} item${r.added === 1 ? "" : "s"} added.`);
      if (errs.length) {
        error = true;
        parts.push(`Couldn't read ${errs.length} line${errs.length > 1 ? "s" : ""}: “${errs.slice(0, 2).join("”, “")}”. Each line should be Item, unit, price.`);
      }
    }
  }
  return error ? { error: parts.join(" ") } : { ok: parts.join(" ") };
}
