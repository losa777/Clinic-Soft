import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { OrderQueueScreen } from "@/modules/emr/screens/queue-screens";

export const instant = false;

export const metadata: Metadata = { title: "პროცედურები" };

export default async function NursePage({ searchParams }: PageProps<"/nurse">) {
  const user = await requirePermission("orders.nurse");
  return <OrderQueueScreen kind="nurse" params={await searchParams} canConsume={can(user, "inventory.consume")} />;
}
