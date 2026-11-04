import Link from "next/link";
import { ORDER_STATUS } from "@/lib/format";

export function Pill({ tone, children }: { tone: "green" | "amber" | "red" | "blue" | "grey"; children: React.ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function OrderStatusPill({ status }: { status: string }) {
  const s = ORDER_STATUS[status] ?? { label: status, tone: "grey" as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export function PageHead({
  title,
  eyebrow,
  backHref,
  backLabel,
  action,
}: {
  title: string;
  eyebrow?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <>
      {backHref ? <Link className="back" href={backHref}>‹ {backLabel ?? "Back"}</Link> : null}
      <div className="page-head">
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h1>{title}</h1>
        </div>
        {action}
      </div>
    </>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
