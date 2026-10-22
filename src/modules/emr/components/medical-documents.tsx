"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, FilePlus2, FileSignature, FileText, GitBranch, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import type { SignatureResult } from "@/components/signature/devices";
import { SignatureCapture } from "@/components/signature/signature-pad";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { documentUrl } from "@/lib/patient-schema";
import { cn } from "@/lib/utils";
import {
  createDocumentAction,
  deleteDraftAction,
  newVersionAction,
  saveDocumentAction,
  signDocumentAction,
  verifyDocumentAction,
} from "@/modules/emr/actions/document-actions";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TEMPLATES,
  DOCUMENT_TYPES,
  type DocumentTypeCode,
  SIGNER_ROLE_LABELS,
  type SignerRoleCode,
} from "@/modules/emr/documents/templates";
import type { MedicalDocumentRow } from "@/modules/emr/server/documents";
import { NativeSelectClient } from "@/modules/finance/components/native-select";

const previewUrl = (id: number) => `/api/medical-documents/${id}/preview`;

/**
 * სამედიცინო დოკუმენტები: შექმნა ვიზიტიდან (ველები ივსება ავტომატურად), რედაქტირება, PDF-ის წინასწარი ნახვა,
 * ხელმოწერა პადით, ხელმოწერილის ჩაკეტვა, ახალი ვერსია, მთლიანობის შემოწმება.
 * encounterId — საკუთარი ვიზიტი (შექმნა მხოლოდ მაშინ), userId — ავტორის შესამოწმებლად.
 */
export function MedicalDocuments({
  docs,
  encounterId,
  userId,
  canEdit,
  canSign,
}: {
  docs: MedicalDocumentRow[];
  encounterId: number | null;
  userId: number;
  canEdit: boolean;
  canSign: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<DocumentTypeCode>("visit_summary");
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult & { documentId?: number }>, after?: (id?: number) => void) {
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(res.message);
        after?.(res.documentId);
        router.refresh();
      } catch {
        toast.error("მოქმედება ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-3">
        <FileSignature className="size-4 text-muted-foreground" />
        <CardTitle>სამედიცინო დოკუმენტები</CardTitle>
        {canEdit && encounterId && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <NativeSelectClient
              id="new-document-type"
              value={type}
              onChange={(v) => setType(v as DocumentTypeCode)}
              options={DOCUMENT_TYPES}
              className="h-8 w-auto"
            />
            <Button size="sm" disabled={pending} onClick={() => run(() => createDocumentAction({ encounterId, type }), (id) => id && setEditing(id))}>
              <FilePlus2 />
              შექმნა
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            დოკუმენტი არ არის.{canEdit && !encounterId && " დოკუმენტი იქმნება ვიზიტიდან — აირჩიეთ ვიზიტი დღის განრიგიდან."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((d) => {
              const own = canEdit && d.createdById === userId;
              return (
                <li key={d.id} className={cn("rounded-lg border px-3 py-2 text-sm", d.status === "superseded" && "opacity-70")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" />
                    <b>{d.title}</b>
                    <span className="text-muted-foreground">N {d.id}</span>
                    {d.version > 1 && <Badge variant="outline">ვერსია {d.version}</Badge>}
                    <Badge variant={d.status === "signed" ? "default" : d.status === "draft" ? "secondary" : "outline"}>
                      {DOCUMENT_STATUS_LABELS[d.status]}
                    </Badge>
                    <div className="ml-auto flex flex-wrap gap-1">
                      {d.status === "draft" ? (
                        <>
                          <a href={previewUrl(d.id)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                            <Eye />
                            PDF
                          </a>
                          {own && editing !== d.id && (
                            <Button size="sm" variant="outline" onClick={() => setEditing(d.id)}>
                              <Pencil />
                              რედაქტირება
                            </Button>
                          )}
                          {own && <DeleteDraft disabled={pending} onConfirm={() => run(() => deleteDraftAction(d.id))} />}
                        </>
                      ) : (
                        <>
                          {d.pdfDocumentId && (
                            <a href={documentUrl(d.pdfDocumentId)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                              <Eye />
                              PDF
                            </a>
                          )}
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => verifyDocumentAction(d.id))} title="PDF-ის მთლიანობის შემოწმება (sha256)">
                            <ShieldCheck />
                            შემოწმება
                          </Button>
                          {own && d.status === "signed" && !d.next && (
                            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => newVersionAction(d.id), (id) => id && setEditing(id))}>
                              <GitBranch />
                              ახალი ვერსია
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {d.createdBy ?? "—"} · შეიქმნა {d.createdAt}
                    {d.signatures.map((s) => ` · ${SIGNER_ROLE_LABELS[s.role as SignerRoleCode]}: ${s.name}, ${s.signedAt}`).join("")}
                    {d.next && ` · ჩანაცვლებულია: ვერსია ${d.next.version} (N ${d.next.id})`}
                  </p>
                  {d.status === "draft" && own && editing === d.id && d.values && (
                    <DocumentEditor key={d.id} doc={d} values={d.values} canSign={canSign} onClose={() => setEditing(null)} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteDraft({ onConfirm, disabled }: { onConfirm: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setOpen(true)} aria-label="დრაფტის წაშლა" title="წაშლა">
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="დრაფტის წაშლა"
        description="ხელმოუწერელი დოკუმენტი წაიშლება."
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
      />
    </>
  );
}

/** დრაფტის ველები (შაბლონით) + შენახვა / წინასწარი ნახვა / ხელმოწერა. */
function DocumentEditor({
  doc,
  values: initial,
  canSign,
  onClose,
}: {
  doc: MedicalDocumentRow;
  values: Record<string, string>;
  canSign: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const template = DOCUMENT_TEMPLATES[doc.type];
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [signing, setSigning] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(after?: () => void) {
    startTransition(async () => {
      try {
        const res = await saveDocumentAction({ documentId: doc.id, values });
        if (!res.ok) {
          setErrors(res.fieldErrors ?? {});
          toast.error(res.error);
          return;
        }
        setErrors({});
        if (after) after();
        else toast.success(res.message);
        router.refresh();
      } catch {
        toast.error("დოკუმენტი ვერ შეინახა. სცადეთ თავიდან");
      }
    });
  }

  return (
    <form
      className="mt-2 flex flex-col gap-3 border-t pt-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {template.subtitle && <p className="text-xs text-muted-foreground">{template.subtitle}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {template.fields.map((f) => {
          const id = `doc-${doc.id}-${f.key}`;
          const props = {
            id,
            value: values[f.key] ?? "",
            placeholder: f.placeholder,
            "aria-invalid": errors[f.key] ? true : undefined,
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [f.key]: e.target.value })),
          };
          return (
            <div key={f.key} className={cn(f.kind === "textarea" && "md:col-span-2")}>
              <FormField id={id} label={f.required ? `${f.label} *` : f.label} error={errors[f.key]}>
                {f.kind === "textarea" ? <Textarea {...props} rows={3} /> : <Input {...props} type={f.kind === "date" ? "date" : "text"} className="h-9" />}
              </FormField>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "ინახება..." : "შენახვა"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            // ახალი ფანჯარა სინქრონულად (popup-ის ბლოკირების გარეშე), მისამართი — შენახვის შემდეგ
            const win = window.open("about:blank", "_blank");
            save(() => {
              if (win) win.location.href = previewUrl(doc.id);
            });
          }}
        >
          <Eye />
          წინასწარი ნახვა (PDF)
        </Button>
        {canSign && (
          <Button type="button" size="sm" disabled={pending} onClick={() => setSigning(true)}>
            <FileSignature />
            ხელმოწერა
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onClose}>
          დახურვა
        </Button>
      </div>
      {signing && (
        <SignDialog
          doc={doc}
          values={values}
          onClose={() => setSigning(false)}
          onFieldErrors={(e) => {
            setErrors(e);
            setSigning(false);
          }}
          onSigned={onClose}
        />
      )}
    </form>
  );
}

/** ხელმოწერის ფანჯარა: შაბლონის ხელმომწერები (ექიმი; საჭიროებისას — პაციენტი). ხელმოწერის შემდეგ დოკუმენტი იკეტება. */
function SignDialog({
  doc,
  values,
  onClose,
  onFieldErrors,
  onSigned,
}: {
  doc: MedicalDocumentRow;
  values: Record<string, string>;
  onClose: () => void;
  onFieldErrors: (errors: Record<string, string>) => void;
  onSigned: () => void;
}) {
  const router = useRouter();
  const signers = DOCUMENT_TEMPLATES[doc.type].signers;
  const [captured, setCaptured] = useState<Partial<Record<SignerRoleCode, SignatureResult | null>>>({});
  const [pending, startTransition] = useTransition();
  const missing = signers.filter((s) => s.required && !captured[s.role]);

  function sign() {
    startTransition(async () => {
      try {
        const res = await signDocumentAction({
          documentId: doc.id,
          values,
          signatures: signers.flatMap((s) => {
            const c = captured[s.role];
            return c ? [{ role: s.role, png: c.png, device: c.device }] : [];
          }),
        });
        if (!res.ok) {
          toast.error(res.error);
          if (res.fieldErrors) onFieldErrors(res.fieldErrors);
          return;
        }
        toast.success(res.message);
        onSigned();
        router.refresh();
      } catch {
        toast.error("ხელმოწერა ვერ შესრულდა. სცადეთ თავიდან");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>ხელმოწერა: {doc.title}</DialogTitle>
          <DialogDescription>ხელმოწერის შემდეგ დოკუმენტი ჩაიკეტება და PDF შეინახება. შესწორება — მხოლოდ ახალი ვერსიით.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {signers.map((s) => (
            <section key={s.role} className="flex flex-col gap-1.5">
              <h3 className="text-sm font-medium">
                {SIGNER_ROLE_LABELS[s.role]}
                {s.required && " *"}
              </h3>
              <SignatureCapture
                label={SIGNER_ROLE_LABELS[s.role]}
                disabled={pending}
                onChange={(r) => setCaptured((c) => ({ ...c, [s.role]: r }))}
              />
            </section>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            გაუქმება
          </Button>
          <Button onClick={sign} disabled={pending || missing.length > 0}>
            <FileSignature />
            {pending ? "ინახება..." : "ხელმოწერა და ჩაკეტვა"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
