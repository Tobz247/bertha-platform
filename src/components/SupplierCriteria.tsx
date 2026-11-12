import type { Business } from "@prisma/client";
import { ABUJA_AREAS } from "@/lib/format";
import { DELIVERY_DAYS, PAYMENT_TERMS, SUPPLIER_KINDS, criteriaChecklist, noticeLabel, splitList } from "@/lib/supplier-rules";
import { Pill } from "./ui";

type Criteria = Pick<
  Business,
  | "supplierKind"
  | "yearsInBusiness"
  | "deliveryAreas"
  | "deliveryDays"
  | "orderNoticeDays"
  | "paymentTerms"
  | "coldChain"
  | "nafdacNumber"
  | "tin"
  | "hygieneCert"
  | "weeklyCapacity"
  | "references"
>;

/** Form fields for the extra supplier criteria. Read back with criteriaFromForm(). */
export function SupplierCriteriaFields({ s }: { s?: Partial<Criteria> | null }) {
  const areas = new Set(splitList(s?.deliveryAreas));
  const days = new Set(splitList(s?.deliveryDays));
  const terms = new Set(splitList(s?.paymentTerms));
  return (
    <>
      <div className="fields">
        <label className="f">Type of supplier
          <select name="supplierKind" id="supplierKind" defaultValue={s?.supplierKind ?? ""}>
            <option value="">Choose…</option>
            {SUPPLIER_KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
        <label className="f">Years in business<input type="number" name="yearsInBusiness" id="yearsInBusiness" min="0" step="1" defaultValue={s?.yearsInBusiness ?? ""} /></label>
        <label className="f">Notice needed before delivery
          <select name="orderNoticeDays" id="orderNoticeDays" defaultValue={s?.orderNoticeDays == null ? "" : String(s.orderNoticeDays)}>
            <option value="">Choose…</option>
            <option value="0">Same day</option>
            <option value="1">1 day</option>
            <option value="2">2 days</option>
            <option value="3">3 days</option>
            <option value="7">A week</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Areas they deliver to</legend>
        <div className="fields" style={{ gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
          {ABUJA_AREAS.map((a) => <label key={a} className="check"><input type="checkbox" name="deliveryAreas" value={a} defaultChecked={areas.has(a)} /> {a}</label>)}
        </div>
      </fieldset>
      <fieldset>
        <legend>Delivery days</legend>
        <div className="btns" style={{ gap: 14 }}>
          {DELIVERY_DAYS.map((d) => <label key={d} className="check"><input type="checkbox" name="deliveryDays" value={d} defaultChecked={days.has(d)} /> {d}</label>)}
        </div>
      </fieldset>
      <fieldset>
        <legend>Payment they accept</legend>
        <div className="fields" style={{ gap: 6 }}>
          {PAYMENT_TERMS.map((p) => <label key={p.value} className="check"><input type="checkbox" name="paymentTerms" value={p.value} defaultChecked={terms.has(p.value)} /> {p.label}</label>)}
        </div>
      </fieldset>
      <div className="fields">
        <label className="f">NAFDAC number <span className="hint">packaged or processed food</span><input type="text" name="nafdacNumber" id="nafdacNumber" defaultValue={s?.nafdacNumber ?? ""} /></label>
        <label className="f">Tax ID (TIN) <span className="hint">optional</span><input type="text" name="tin" id="tin" defaultValue={s?.tin ?? ""} /></label>
      </div>
      <div className="btns" style={{ gap: 18 }}>
        <label className="check"><input type="checkbox" name="coldChain" defaultChecked={!!s?.coldChain} /> Cold room or refrigerated delivery</label>
        <label className="check"><input type="checkbox" name="hygieneCert" defaultChecked={!!s?.hygieneCert} /> Food hygiene certificate</label>
      </div>
      <label className="f">How much can they supply in a week? <span className="hint">in their words</span><input type="text" name="weeklyCapacity" id="weeklyCapacity" placeholder="e.g. 40 baskets of tomatoes, 200 crates of eggs" defaultValue={s?.weeklyCapacity ?? ""} /></label>
      <label className="f">References <span className="hint">hotels or restaurants they already supply, with a phone number</span>
        <textarea name="references" id="references" rows={2} defaultValue={s?.references ?? ""} placeholder="e.g. Transcorp kitchen, Mr Bello 0803 000 0000" />
      </label>
    </>
  );
}

/** A short read-out of a supplier's criteria for buyers and admins. */
export function SupplierCriteriaSummary({ s, showChecks = false }: { s: Criteria & { cacNumber: string | null; bankAccountNumber: string | null }; showChecks?: boolean }) {
  const terms = splitList(s.paymentTerms).map((t) => PAYMENT_TERMS.find((p) => p.value === t)?.label ?? t);
  const facts = [
    s.supplierKind,
    s.yearsInBusiness != null ? `${s.yearsInBusiness} year${s.yearsInBusiness === 1 ? "" : "s"} in business` : null,
    noticeLabel(s.orderNoticeDays),
    splitList(s.deliveryDays).length ? `delivers ${splitList(s.deliveryDays).join(", ")}` : null,
  ].filter(Boolean);
  const c = criteriaChecklist(s);
  return (
    <div className="stack" style={{ gap: 6 }}>
      {facts.length ? <div className="k">{facts.join(" · ")}</div> : null}
      {splitList(s.deliveryAreas).length ? <div className="k">Delivers to {splitList(s.deliveryAreas).join(", ")}</div> : null}
      {terms.length ? <div className="k">Accepts {terms.join(", ").toLowerCase()}</div> : null}
      {s.weeklyCapacity ? <div className="k">Weekly capacity: {s.weeklyCapacity}</div> : null}
      <div className="badges">
        {s.coldChain ? <Pill tone="blue">Cold chain</Pill> : null}
        {s.hygieneCert ? <Pill tone="green">Hygiene certificate</Pill> : null}
        {s.nafdacNumber ? <Pill tone="green">NAFDAC {s.nafdacNumber}</Pill> : null}
        {s.cacNumber ? <Pill tone="green">CAC registered</Pill> : null}
      </div>
      {showChecks ? (
        <>
          <div className="k">Checks: {c.done} of {c.total} · missing {c.checks.filter((x) => !x.ok).map((x) => x.label).join(", ") || "nothing"}</div>
          {s.tin ? <div className="k">TIN {s.tin}</div> : null}
          {s.references ? <div className="k" style={{ whiteSpace: "pre-line" }}>References: {s.references}</div> : null}
        </>
      ) : null}
    </div>
  );
}
