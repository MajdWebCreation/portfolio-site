"use client";

import { useCallback, useRef, useState } from "react";
import { registerAttachmentAction } from "@/lib/portal/requests/actions";
import { attachmentAccept, attachmentMimeFor, attachmentProblem, attachmentProblemLabels, attachmentRules, formatBytes } from "@/lib/requests/model";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Adding files to a request that already exists.
 *
 * Each file goes on its own: a slot reserved (the database counts it
 * against the caps and names the path, random ids, never the file's name),
 * the file stored straight from the browser into the private bucket at
 * exactly that path under the member's own session, then registered by the
 * server, which reads its first bytes back. One file failing touches no other file and never the
 * request; a failed file stays in the list with its reason and can be tried
 * again, as often as needed, without choosing it anew.
 */
const bucket = "request-attachments";

export type UploadItem = {
  key: string;
  file: File;
  state: "waiting" | "uploading" | "done" | "failed";
  error?: string;
};

export function useRequestUploads(customerId: string, requestId: string | undefined) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const running = useRef(new Set<string>());

  const update = (key: string, patch: Partial<UploadItem>) => setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const uploadOne = useCallback(
    async (item: UploadItem, forRequest: string) => {
      if (running.current.has(item.key)) return;
      running.current.add(item.key);
      update(item.key, { state: "uploading", error: undefined });
      try {
        const problem = attachmentProblem(item.file);
        const mime = attachmentMimeFor(item.file);
        if (problem || !mime) {
          update(item.key, { state: "failed", error: attachmentProblemLabels[problem ?? "type"] });
          return;
        }
        /* A slot first: the database counts it against the request's and the customer's caps and names the path -- random ids, never the file's name. */
        const supabase = createSupabaseBrowserClient();
        const slot = await supabase.rpc("portal_reserve_request_upload", { p_customer_id: customerId, p_request_id: forRequest });
        const path = slot.data?.[0]?.storage_path;
        if (slot.error || !path) {
          const reason = slot.error?.message.replace("invalid:", "");
          update(item.key, {
            state: "failed",
            error: reason === "limit" ? attachmentProblemLabels.limit : reason === "closed" ? attachmentProblemLabels.closed : reason === "uploads" ? attachmentProblemLabels.uploads : attachmentProblemLabels.failed,
          });
          return;
        }
        const stored = await supabase.storage.from(bucket).upload(path, item.file, { contentType: mime, upsert: false });
        if (stored.error) {
          update(item.key, { state: "failed", error: attachmentProblemLabels.failed });
          return;
        }
        const registered = await registerAttachmentAction({ customerId, requestId: forRequest, storagePath: path, fileName: item.file.name, mimeType: mime });
        update(item.key, registered.ok ? { state: "done" } : { state: "failed", error: registered.error });
      } catch {
        update(item.key, { state: "failed", error: attachmentProblemLabels.failed });
      } finally {
        running.current.delete(item.key);
      }
    },
    [customerId],
  );

  /** Queues files; returns the ones refused before anything was sent. */
  const add = useCallback((files: File[]) => {
    const fresh = files.map((file) => {
      const problem = attachmentProblem(file);
      return {
        key: crypto.randomUUID(),
        file,
        state: problem ? ("failed" as const) : ("waiting" as const),
        ...(problem ? { error: attachmentProblemLabels[problem] } : {}),
      };
    });
    setItems((current) => [...current, ...fresh]);
    return fresh;
  }, []);

  /** Sends every waiting file, one after the other, to the given request. */
  const start = useCallback(
    async (forRequest: string, queue: UploadItem[]) => {
      for (const item of queue) {
        if (item.state === "waiting") await uploadOne(item, forRequest);
      }
    },
    [uploadOne],
  );

  const retry = useCallback((item: UploadItem) => (requestId ? uploadOne(item, requestId) : undefined), [requestId, uploadOne]);
  const remove = useCallback((key: string) => setItems((current) => current.filter((item) => item.key !== key)), []);

  return { items, add, start, retry, remove, setItems };
}

export function UploadList({ items, onRetry, onRemove }: { items: UploadItem[]; onRetry?: (item: UploadItem) => void; onRemove?: (key: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-4 border-t border-line" aria-live="polite">
      {items.map((item) => (
        <li key={item.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line py-2.5 text-[0.9rem]">
          <span className="min-w-0 break-all text-ink">
            {item.file.name} <span className="text-muted">· {formatBytes(item.file.size)}</span>
          </span>
          <span className="flex items-center gap-3">
            {item.state === "waiting" ? <span className="text-muted">Wacht</span> : null}
            {item.state === "uploading" ? <span className="text-muted">Bezig met uploaden…</span> : null}
            {item.state === "done" ? <span className="text-success">Toegevoegd</span> : null}
            {item.state === "failed" ? (
              <>
                <span className="text-danger">{item.error ?? attachmentProblemLabels.failed}</span>
                {/* Only a failure that may pass on a second try offers one; a file that is not acceptable stays refused. */}
                {onRetry && item.error === attachmentProblemLabels.failed ? (
                  <button type="button" onClick={() => onRetry(item)} className="link-static text-ink">
                    Opnieuw
                  </button>
                ) : null}
                {onRemove ? (
                  <button type="button" onClick={() => onRemove(item.key)} className="link-static text-muted">
                    Verwijderen
                  </button>
                ) : null}
              </>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FilePicker({ id, label, onFiles, disabled, remaining }: { id: string; label?: string; onFiles: (files: File[]) => void; disabled?: boolean; remaining: number }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[0.88rem] text-ink">
        {label ?? (
          <>
            Bijlagen <span className="text-muted">(optioneel)</span>
          </>
        )}
      </label>
      <input
        id={id}
        type="file"
        multiple
        accept={attachmentAccept}
        disabled={disabled || remaining <= 0}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          onFiles(files.slice(0, Math.max(0, remaining)));
        }}
        className="mt-1.5 block w-full text-[0.9rem] text-body file:mr-4 file:min-h-10 file:cursor-pointer file:rounded-sm file:border file:border-line file:bg-surface file:px-4 file:text-ink"
      />
      <p className="mt-1.5 text-[0.82rem] text-muted">
        Foto&apos;s, screenshots of PDF&apos;s (JPG, PNG, WebP, HEIC, PDF), tot {attachmentRules.maxFiles} bestanden van maximaal 15 MB.
        {remaining < attachmentRules.maxFiles ? ` Nog ${Math.max(0, remaining)} mogelijk.` : ""}
      </p>
    </div>
  );
}
