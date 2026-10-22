import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { OrderQueueScreen } from "@/modules/emr/screens/queue-screens";

export const instant = false;

export const metadata: Metadata = { title: "პროცედურები" };

export default async function NursePage({ searchParams }: PageProps<"/nurse">) {
  await requirePermission("orders.nurse");
  return <OrderQueueScreen kind="nurse" params={await searchParams} />;
}
