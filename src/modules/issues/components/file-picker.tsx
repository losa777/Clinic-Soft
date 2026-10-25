"use client";

import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCEPT_ATTRIBUTE, checkFiles, formatSize } from "@/modules/chat/files";
import { ISSUE_FILES_MAX } from "@/modules/issues/labels";

/** ფოტო / ფაილის დართვა (მაქსიმუმ ISSUE_FILES_MAX). შემოწმება ბრაუზერში — ზომა/ტიპი, საბოლოოდ — სერვერზე. */
export function FilePicker({ files, onChange, onError }: { files: File[]; onChange: (files: File[]) => void; onError: (error: string) => void }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatSize(f.size)}</span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={`ამოშლა: ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length < ISSUE_FILES_MAX && (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => input.current?.click()}>
          <Paperclip />
          ფოტო ან ფაილი
        </Button>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          e.target.value = "";
          const error = picked.length + files.length > ISSUE_FILES_MAX ? `მაქსიმუმ ${ISSUE_FILES_MAX} ფაილი` : checkFiles(picked);
          if (error) onError(error);
          else onChange([...files, ...picked]);
        }}
      />
    </div>
  );
}
