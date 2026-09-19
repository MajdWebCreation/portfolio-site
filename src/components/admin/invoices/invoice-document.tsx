"use client";

import { useEffect, useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { invoiceDocumentFile } from "@/lib/admin/invoices/document-actions";
import type { InvoiceDocumentFile } from "@/lib/admin/invoices/types";

/**
 * The definitive PDF of an issued invoice.
 *
 * Nothing is rendered here. The other panel, the one for concepts, carries a
 * megabyte of PDF renderer and builds a document out of the form on screen;
 * this fetches the file that was stored when the invoice was made
 * definitive, verified server-side against its SHA-256, and shows those
 * bytes. It is the same file the customer's mail attaches, because there is
 * only one.
 *
 * The hash is shown on purpose. It is the short answer to "is this really the
 * document that went out", and it is the same string the invoice row holds.
 */
function blobFromBase64(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "application/pdf" });
}

export default function InvoiceDocument({ invoiceId, document: file }: { invoiceId: string; document: InvoiceDocumentFile }) {
  const [url, setUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("factuur.pdf");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  async function load() {
    if (url) {
      setOpen((value) => !value);
      return;
    }
    setState("busy");
    setError(null);
    const result = await invoiceDocumentFile(invoiceId);
    if (!result.ok) {
      setError(result.error);
      setState("error");
      return;
    }
    setFileName(result.value.fileName);
    setUrl(URL.createObjectURL(blobFromBase64(result.value.base64)));
    setOpen(true);
    setState("idle");
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <AdminButton onClick={load} disabled={state === "busy"}>
          {state === "busy" ? "Ophalen…" : url ? (open ? "Voorbeeld verbergen" : "Voorbeeld tonen") : "PDF bekijken"}
        </AdminButton>
        {url ? (
          <a href={url} download={fileName} className="link-static text-[0.92rem] text-ink">
            Downloaden
          </a>
        ) : null}
      </div>

      <p className="text-[0.82rem] leading-snug text-muted">
        Dit is het opgeslagen definitieve bestand, niet een nieuwe weergave. Exact deze bytes gaan als bijlage naar de
        klant.
        <br />
        <span className="font-mono text-[0.78rem] break-all">sha256 {file.sha256}</span>
      </p>

      {error ? (
        <p role="alert" className="text-[0.85rem] leading-snug text-danger">
          {error}
        </p>
      ) : null}

      {url && open ? (
        <div className="overflow-hidden rounded-sm border border-line bg-paper-deep">
          <iframe src={`${url}#toolbar=0&view=FitH`} title="Definitieve factuur" className="block h-[70vh] min-h-[28rem] w-full" />
        </div>
      ) : null}
    </>
  );
}
