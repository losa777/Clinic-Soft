"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Eye, FileText, Loader2, RotateCw, ScanLine, Settings, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deletePatientDocument } from "@/lib/patient-actions";
import {
  ACCEPTED_MIME_TYPES,
  DOCUMENT_TYPES,
  type DocumentType,
  documentTypeLabel,
  documentUrl,
  formatFileSize,
  MAX_FILE_SIZE,
  MAX_FILES_PER_SAVE,
  MAX_TOTAL_UPLOAD,
  type StoredDocument,
} from "@/lib/patient-schema";
import { scanPages } from "./scanner-client";
import { ScannerSettingsDialog } from "./scanner-settings-dialog";

/** დასკანერებული/ატვირთული, ჯერ შეუნახავი ფაილი (ბრაუზერის მეხსიერებაში). */
export type PendingDocument = {
  key: string;
  blob: Blob;
  url: string;
  originalName: string;
  docType: DocumentType;
  title: string;
};

export function releasePending(docs: PendingDocument[]) {
  for (const d of docs) URL.revokeObjectURL(d.url);
}

type Preview = { title: string; url: string; mimeType: string };

type Props = {
  stored: StoredDocument[];
  pending: PendingDocument[];
  onPendingChange: (update: (docs: PendingDocument[]) => PendingDocument[]) => void;
  onStoredDeleted: (id: number) => void;
  /** სკანირება/ატვირთვა შესაძლებელია (პირადი ნომერი შეყვანილია) */
  enabled: boolean;
  canDeleteStored: boolean;
  errors: Record<string, string>;
};

const ACCEPT = ".jpg,.jpeg,.png,.pdf," + ACCEPTED_MIME_TYPES.join(",");
const EXTENSION_BY_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

export function DocumentsSection({ stored, pending, onPendingChange, onStoredDeleted, enabled, canDeleteStored, errors }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [scanning, startScan] = useTransition();
  const [deletingPending, startDelete] = useTransition();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [deleting, setDeleting] = useState<StoredDocument | null>(null);

  /** ახალი ფაილები სიაში: ტიპი წინა ფაილისგან, სახელი ტიპის მიხედვით (მაგ. „პირადობის მოწმობა 2“). */
  function addPending(files: { blob: Blob; originalName?: string }[]) {
    const room = MAX_FILES_PER_SAVE - pending.length;
    if (files.length > room) toast.error(`ერთ ჯერზე შეიძლება მაქსიმუმ ${MAX_FILES_PER_SAVE} ფაილის შენახვა`);
    const accepted = files.slice(0, Math.max(0, room));
    if (!accepted.length) return;

    onPendingChange((docs) => {
      const next = [...docs];
      for (const f of accepted) {
        const docType = next.at(-1)?.docType ?? "id_card";
        const sameType = next.filter((d) => d.docType === docType).length + stored.filter((d) => d.docType === docType).length;
        const ext = EXTENSION_BY_TYPE[f.blob.type] ?? "jpg";
        next.push({
          key: crypto.randomUUID(),
          blob: f.blob,
          url: URL.createObjectURL(f.blob),
          originalName: f.originalName ?? `scan-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`,
          docType,
          title: f.originalName ? f.originalName.replace(/\.[^.]+$/, "") : sameType ? `${documentTypeLabel(docType)} ${sameType + 1}` : documentTypeLabel(docType),
        });
      }
      return next;
    });
  }

  function scan() {
    startScan(async () => {
      try {
        const pages = await scanPages();
        if (!pages.length) toast.error("სკანერმა გვერდი არ დააბრუნა");
        addPending(pages.map((blob) => ({ blob })));
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function upload(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (fileInput.current) fileInput.current.value = "";
    const ok: File[] = [];
    for (const f of files) {
      if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(f.type)) toast.error(`„${f.name}“: დასაშვებია მხოლოდ JPG, PNG ან PDF`);
      else if (f.size > MAX_FILE_SIZE) toast.error(`„${f.name}“ ${formatFileSize(MAX_FILE_SIZE)}-ზე დიდია`);
      else if (f.size === 0) toast.error(`„${f.name}“ ცარიელია`);
      else ok.push(f);
    }
    addPending(ok.map((f) => ({ blob: f, originalName: f.name })));
  }

  const update = (key: string, patch: Partial<PendingDocument>) =>
    onPendingChange((docs) => docs.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  function changeType(doc: PendingDocument, docType: DocumentType) {
    // სახელი ავტომატურია, სანამ ტიპის სახელს ემთხვევა
    const autoTitle = doc.title.startsWith(documentTypeLabel(doc.docType));
    update(doc.key, { docType, ...(autoTitle ? { title: documentTypeLabel(docType) } : {}) });
  }

  async function rotate(doc: PendingDocument) {
    try {
      const blob = await rotateImage(doc.blob);
      URL.revokeObjectURL(doc.url);
      update(doc.key, { blob, url: URL.createObjectURL(blob) });
    } catch {
      toast.error("სურათი ვერ შემობრუნდა");
    }
  }

  function removePending(doc: PendingDocument) {
    URL.revokeObjectURL(doc.url);
    onPendingChange((docs) => docs.filter((d) => d.key !== doc.key));
  }

  function confirmDeleteStored() {
    if (!deleting) return;
    startDelete(async () => {
      const res = await deletePatientDocument(deleting.id);
      if (res.ok) {
        toast.success(res.message);
        onStoredDeleted(deleting.id);
        setDeleting(null);
      } else toast.error(res.error);
    });
  }

  const pendingSize = pending.reduce((sum, d) => sum + d.blob.size, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="lg" onClick={scan} disabled={!enabled || scanning}>
          {scanning ? <Loader2 className="animate-spin" /> : <ScanLine />}
          {scanning ? "სკანირება..." : "დასკანერება"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          onClick={() => setSettingsOpen(true)}
          aria-label="სკანერის პარამეტრები"
          title="სკანერის პარამეტრები"
        >
          <Settings />
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => fileInput.current?.click()} disabled={!enabled}>
          <Upload />
          ფაილის ატვირთვა
        </Button>
        <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
        <p className="text-xs text-muted-foreground">
          {enabled ? `JPG, PNG ან PDF, მაქსიმუმ ${formatFileSize(MAX_FILE_SIZE)}` : "ჯერ შეიყვანეთ პირადი ნომერი"}
        </p>
      </div>

      {errors.documents && <p className="text-xs text-destructive">{errors.documents}</p>}
      {pendingSize > MAX_TOTAL_UPLOAD && (
        <p className="text-xs text-destructive">ფაილების ჯამური ზომა {formatFileSize(MAX_TOTAL_UPLOAD)}-ს აღემატება</p>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">ახალი (შეინახება „შენახვით“)</p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pending.map((doc) => (
              <li key={doc.key} className="flex gap-3 rounded-lg border border-dashed border-primary/40 p-2">
                <Thumbnail
                  url={doc.url}
                  mimeType={doc.blob.type}
                  onClick={() => setPreview({ title: doc.title, url: doc.url, mimeType: doc.blob.type })}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Select
                    items={DOCUMENT_TYPES}
                    value={doc.docType}
                    onValueChange={(v) => v && changeType(doc, v as DocumentType)}
                  >
                    <SelectTrigger className="h-8 w-full" aria-label="დოკუმენტის ტიპი">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={doc.title}
                    onChange={(e) => update(doc.key, { title: e.target.value })}
                    aria-label="დოკუმენტის სახელი"
                    aria-invalid={!doc.title.trim() || undefined}
                    maxLength={255}
                  />
                  <div className="flex items-center gap-1">
                    <span className="mr-auto truncate text-xs text-muted-foreground">{formatFileSize(doc.blob.size)}</span>
                    <IconButton
                      label="ნახვა"
                      onClick={() => setPreview({ title: doc.title, url: doc.url, mimeType: doc.blob.type })}
                    >
                      <Eye />
                    </IconButton>
                    <IconButton label="შემობრუნება 90°" onClick={() => rotate(doc)} disabled={!doc.blob.type.startsWith("image/")}>
                      <RotateCw />
                    </IconButton>
                    <IconButton label="წაშლა" onClick={() => removePending(doc)} destructive>
                      <Trash2 />
                    </IconButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stored.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">შენახული დოკუმენტები</p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {stored.map((doc) => (
              <li key={doc.id} className="flex gap-3 rounded-lg border p-2">
                <Thumbnail
                  url={documentUrl(doc.id)}
                  mimeType={doc.mimeType}
                  onClick={() => setPreview({ title: doc.title, url: documentUrl(doc.id), mimeType: doc.mimeType })}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate font-medium" title={doc.title}>
                    {doc.title}
                  </p>
                  <Badge variant="secondary">{documentTypeLabel(doc.docType)}</Badge>
                  <p className="truncate text-xs text-muted-foreground" title={doc.uploadedBy ?? undefined}>
                    {doc.uploadedAt} · {formatFileSize(doc.sizeBytes)}
                  </p>
                  <div className="mt-auto flex items-center justify-end gap-1">
                    <IconButton
                      label="ნახვა"
                      onClick={() => setPreview({ title: doc.title, url: documentUrl(doc.id), mimeType: doc.mimeType })}
                    >
                      <Eye />
                    </IconButton>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      render={<a href={`${documentUrl(doc.id)}?download`} />}
                      aria-label="ჩამოტვირთვა"
                      title="ჩამოტვირთვა"
                      nativeButton={false}
                    >
                      <Download />
                    </Button>
                    {canDeleteStored && (
                      <IconButton label="წაშლა" onClick={() => setDeleting(doc)} destructive>
                        <Trash2 />
                      </IconButton>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!pending.length && !stored.length && <p className="text-sm text-muted-foreground">დოკუმენტი ჯერ არ არის დამატებული</p>}

      <ScannerSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
            <DialogDescription className="sr-only">დოკუმენტის ნახვა</DialogDescription>
          </DialogHeader>
          {preview &&
            (preview.mimeType === "application/pdf" ? (
              <iframe src={preview.url} title={preview.title} className="h-[75vh] w-full rounded-lg border" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- blob: და დაცული API-ის სურათები
              <img src={preview.url} alt={preview.title} className="max-h-[75vh] w-full rounded-lg object-contain" />
            ))}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="დოკუმენტის წაშლა"
        description={
          <>
            ნამდვილად გსურთ <b>{deleting?.title}</b> წაშლა? ფაილი სამუდამოდ წაიშლება.
          </>
        }
        pending={deletingPending}
        onConfirm={confirmDeleteStored}
      />
    </div>
  );
}

function Thumbnail({ url, mimeType, onClick }: { url: string; mimeType: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label="ნახვა"
    >
      {mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: და დაცული API-ის სურათები
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
          <FileText className="size-8" />
          PDF
        </span>
      )}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={destructive ? "text-destructive hover:text-destructive" : undefined}
    >
      {children}
    </Button>
  );
}

/** სურათის 90°-ით შემობრუნება საათის ისრის მიმართულებით (ბრაუზერში, შენახვამდე). */
async function rotateImage(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), blob.type, 0.92),
  );
}
