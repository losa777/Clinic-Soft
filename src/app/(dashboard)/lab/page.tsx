import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { OrderQueueScreen } from "@/modules/emr/screens/queue-screens";

export const instant = false;

export const metadata: Metadata = { title: "კვლევები" };

export default async function LabPage({ searchParams }: PageProps<"/lab">) {
  await requirePermission("orders.lab");
  return <OrderQueueScreen kind="lab" params={await searchParams} />;
}
