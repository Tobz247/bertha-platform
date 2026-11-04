import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function Home() {
  const user = await requireUser();
  if (user.business?.type === "BUYER") redirect("/dashboard");
  if (user.business?.type === "SUPPLIER") redirect("/supplier");
  if (user.isPlatformAdmin) redirect("/admin");
  redirect("/login");
}
