import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { OrderQueueScreen } from "@/modules/emr/screens/queue-screens";

export const instant = false;

export const metadata: Metadata = { title: "კვლევები" };

export default async function LabPage({ searchParams }: PageProps<"/lab">) {
  const user = await requirePermission("orders.lab");
  return <OrderQueueScreen kind="lab" params={await searchParams} canConsume={can(user, "inventory.consume")} />;
}
