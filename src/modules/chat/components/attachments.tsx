"use client";

import { Download, FileSpreadsheet, FileText, FileType, X } from "lucide-react";
import type { UiAttachment } from "@/modules/chat/client/store";
import { formatSize, isImageMime } from "@/modules/chat/files";
import { cn } from "@/lib/utils";

/** ფაილის მისამართი: ავტორიზებული API (მონაწილის შემოწმებით), ატვირთვამდე — ლოკალური preview. */
export const attachmentUrl = (id: number, download = false) => `/api/chat/attachments/${id}${download ? "?download=1" : ""}`;

function FileIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.includes("spreadsheet")) return <FileSpreadsheet className={className} />;
  if (mime.includes("word") || mime === "text/plain") return <FileText className={className} />;
  return <FileType className={className} />;
}

/** შეტყობინების ფაილები: სურათები — preview (ზომა წინასწარ იკავებს ადგილს, სქროლი არ „ხტება“), სხვა — ბარათი ჩამოტვირთვით. */
export function MessageAttachments({ attachments, mine }: { attachments: UiAttachment[]; mine: boolean }) {
  const images = attachments.filter((a) => isImageMime(a.mimeType));
  const files = attachments.filter((a) => !isImageMime(a.mimeType));
  return (
    <div className="mb-1 space-y-1">
      {images.length > 0 && (
        <div className={cn("grid gap-1", images.length > 1 && "grid-cols-2")}>
          {images.map((a) => {
            const src = a.localUrl ?? attachmentUrl(a.id);
            const img = (
              // eslint-disable-next-line @next/next/no-img-element -- ავტორიზებული API, next/image-ის ოპტიმიზაცია აქ არ გამოდგება
              <img
                src={src}
                alt={a.fileName}
                width={a.width ?? undefined}
                height={a.height ?? undefined}
                loading="lazy"
                className={cn(
                  "rounded-lg bg-background/40",
                  // ერთი სურათი — ბუნებრივი ზომით (პატარა არ იჭიმება), რამდენიმე — კვადრატულ ბადეში
                  images.length > 1 ? "aspect-square w-full object-cover" : "h-auto max-h-64 w-auto max-w-full",
                )}
                style={images.length === 1 && a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
              />
            );
            return a.id > 0 ? (
              <a key={a.id} href={attachmentUrl(a.id)} target="_blank" rel="noopener" title={`${a.fileName} — გახსნა`} className="block">
                {img}
              </a>
            ) : (
              <span key={a.id} className="block opacity-70">
                {img}
              </span>
            );
          })}
        </div>
      )}
      {files.map((a) => (
        <a
          key={a.id}
          href={a.id > 0 ? attachmentUrl(a.id, true) : undefined}
          className={cn(
            "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left",
            mine ? "bg-primary-foreground/15 hover:bg-primary-foreground/25" : "bg-background/70 hover:bg-background",
          )}
          aria-label={`${a.fileName}, ${formatSize(a.size)} — ჩამოტვირთვა`}
        >
          <FileIcon mime={a.mimeType} className="size-6 shrink-0" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium">{a.fileName}</span>
            <span className="block text-xs opacity-75">{formatSize(a.size)}</span>
          </span>
          {a.id > 0 && <Download className="size-4 shrink-0 opacity-75" />}
        </a>
      ))}
    </div>
  );
}

/** ტექსტის ველის ზემოთ: გასაგზავნი ფაილები (სურათის preview, წაშლა). */
export function OutgoingFiles({ files, previews, onRemove }: { files: File[]; previews: (string | null)[]; onRemove: (index: number) => void }) {
  if (files.length === 0) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-2" aria-label="მიმაგრებული ფაილები">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="relative flex max-w-48 items-center gap-2 rounded-lg border bg-muted/50 p-1.5 pr-7 text-xs">
          {previews[i] ? (
            // eslint-disable-next-line @next/next/no-img-element -- ლოკალური blob: preview
            <img src={previews[i]!} alt="" className="size-10 rounded object-cover" />
          ) : (
            <FileIcon mime={f.type} className="size-6 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-medium">{f.name}</span>
            <span className="text-muted-foreground">{formatSize(f.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={`${f.name} — მოხსნა`}
            className="absolute top-1 right-1 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
