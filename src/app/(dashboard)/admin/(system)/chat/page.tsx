import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { formatSize } from "@/modules/chat/files";
import { chatStorageStats, loadRetentionSettings } from "@/modules/chat/server/retention";
import { formatDateTime } from "@/modules/finance/server/db";
import { ChatHistoryCleanup, ChatRetentionSettings } from "./chat-cleanup";

export const instant = false;

export const metadata: Metadata = { title: "ჩატი" };

export default async function AdminChatPage() {
  await requireRole("admin");
  const [stats, settings] = await Promise.all([chatStorageStats(), loadRetentionSettings()]);
  const at = (iso: string | null) => (iso ? formatDateTime(new Date(iso)) : null);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">ჩატის ისტორია</h1>
        <p className="text-sm text-muted-foreground">
          შეტყობინებების და მიმაგრებული ფაილების წაშლა. საუბრები, ჯგუფები და მათი მონაწილეები რჩება.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChatHistoryCleanup
          messages={stats.messages}
          files={stats.files}
          size={formatSize(stats.bytes)}
          oldestAt={at(stats.oldestAt)}
        />
        <ChatRetentionSettings
          enabled={settings.enabled}
          days={settings.days}
          lastRunAt={at(settings.lastRunAt)}
          lastDeleted={settings.lastDeleted}
        />
      </div>
    </section>
  );
}
