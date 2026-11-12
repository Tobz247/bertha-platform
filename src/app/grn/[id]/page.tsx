import Link from "next/link";
import { notFound } from "next/navigation";
import { GoodsReceivedNote } from "@/components/GoodsReceivedNote";
import { PrintButton } from "@/components/PrintButton";
import { requireBuyer } from "@/lib/auth";
import { loadOrder } from "@/lib/orders";
import { grnNo } from "@/lib/rules";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: `Goods received note ${(await params).id.slice(-4)}` };
}

export default async function GrnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { business } = await requireBuyer("view_orders");
  const o = await loadOrder(id);
  if (!o || o.buyerId !== business.id || !o.receivedAt) notFound();
  return (
    <div className="paper-wrap">
      <div className="paper-bar">
        <Link href={`/orders/${o.id}`}>‹ Back to the order</Link>
        <PrintButton />
      </div>
      <GoodsReceivedNote o={o} />
      <p className="paper-bar" style={{ color: "#555", fontSize: 13 }}>{grnNo(o.number)} · print it for signatures, or choose “Save as PDF” to send it to accounts.</p>
    </div>
  );
}
