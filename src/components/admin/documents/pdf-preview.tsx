"use client";

import { pdf } from "@react-pdf/renderer";
import { useEffect, useRef, useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { type DocumentView } from "@/lib/admin/documents/view";
import InvoicePdf from "@/lib/admin/pdf/invoice-pdf";
import QuotePdf from "@/lib/admin/pdf/quote-pdf";

type PdfPreviewProps = { document: DocumentView; fileName: string; ready: boolean };

/**
 * Generates the PDF in the browser from the current document and shows it in
 * a preview frame with a download link.
 *
 * This is the expensive half of the document panel: `@react-pdf/renderer` is
 * well over a megabyte of JavaScript, and it used to be fetched the moment a
 * quote or invoice was opened, whether or not anyone wanted a PDF. The panel
 * now imports this module when the button is pressed, so the first render here
 * is already a request for a PDF — which is why it starts generating on mount
 * instead of waiting for a second click.
 */
export default function PdfPreview({ document: doc, fileName, ready }: PdfPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [open, setOpen] = useState(false);
  const started = useRef(false);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  // The click that loaded this module was the request; React may mount an
  // effect twice in development, so the first run is the only one.
  useEffect(() => {
    if (started.current || !ready) return;
    started.current = true;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function generate() {
    setState("busy");
    try {
      /* The same document the customer will get, activation note and all. */
      const element =
        doc.kind === "quote" ? (
          <QuotePdf quote={doc.quote} />
        ) : (
          <InvoicePdf invoice={doc.invoice} {...(doc.activates ? { activates: doc.activates } : {})} />
        );
      const blob = await pdf(element).toBlob();
      setUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
      setOpen(true);
      setState("idle");
    } catch (error) {
      console.error("PDF generation failed", error);
      setState("error");
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <AdminButton onClick={generate} disabled={!ready || state === "busy"}>
          {state === "busy" ? "Bezig…" : url ? "PDF opnieuw genereren" : "PDF genereren"}
        </AdminButton>
        {url ? (
          <a href={url} download={fileName} className="link-static text-[0.92rem] text-ink">
            Downloaden
          </a>
        ) : null}
        {url ? (
          <button type="button" onClick={() => setOpen((value) => !value)} className="link-static text-[0.92rem] text-ink" aria-expanded={open} aria-controls="pdf-preview">
            {open ? "Voorbeeld verbergen" : "Voorbeeld tonen"}
          </button>
        ) : null}
      </div>
      {state === "error" ? (
        <p role="alert" className="text-[0.85rem] text-danger">
          Het genereren is mislukt. Controleer de regels en probeer opnieuw.
        </p>
      ) : null}
      {url && open ? (
        <div id="pdf-preview" className="overflow-hidden rounded-sm border border-line bg-paper-deep">
          <iframe src={`${url}#toolbar=0&view=FitH`} title="PDF-voorbeeld" className="block h-[70vh] min-h-[28rem] w-full" />
        </div>
      ) : null}
    </>
  );
}
