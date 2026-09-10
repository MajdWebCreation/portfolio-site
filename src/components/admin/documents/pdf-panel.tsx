"use client";

import { useEffect, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import AdminButton from "@/components/admin/admin-button";
import { useSave } from "@/components/admin/save-controls";
import { sendInvoiceToCustomer, sendQuoteToCustomer } from "@/lib/admin/documents/send";
import { formatDateTime } from "@/lib/admin/format";
import type { Invoice } from "@/lib/admin/invoices/types";
import InvoicePdf from "@/lib/admin/pdf/invoice-pdf";
import QuotePdf from "@/lib/admin/pdf/quote-pdf";
import type { Quote } from "@/lib/admin/quotes/types";

type PdfDocument = { kind: "quote"; quote: Quote } | { kind: "invoice"; invoice: Invoice };

type PdfPanelProps = { document: PdfDocument; fileName: string; ready: boolean };

function record(doc: PdfDocument): Quote | Invoice {
  return doc.kind === "quote" ? doc.quote : doc.invoice;
}

/**
 * Sending the saved document to its customer.
 *
 * Deliberately two steps: the first click asks, the second sends. A quote or
 * invoice leaving for a customer cannot be taken back, and it is the moment
 * the definitive number is issued, so it should not be one stray click away.
 *
 * The server action reads the document from the database, not from this
 * screen — so the panel says what is about to be sent, and refuses while the
 * document has never been saved.
 */
function SendPanel({ doc }: { doc: PdfDocument }) {
  const document = record(doc);
  const [confirming, setConfirming] = useState(false);
  const [sentNumber, setSentNumber] = useState<string | null>(null);
  const { save: run, pending, error } = useSave();

  const kindLabel = doc.kind === "quote" ? "offerte" : "factuur";
  const recipient = document.customer.email.trim();
  const saved = Boolean(document.id);
  const blocked = !saved
    ? `Sla de ${kindLabel} eerst op.`
    : !recipient
      ? "Deze klant heeft geen e-mailadres."
      : null;

  function send() {
    run(
      () => (doc.kind === "quote" ? sendQuoteToCustomer(document.id) : sendInvoiceToCustomer(document.id)),
      (number: string) => {
        setSentNumber(number);
        setConfirming(false);
      },
    );
  }

  return (
    <div className="border-t border-line pt-4">
      <h3 className="label-mono text-ink">Versturen</h3>

      {document.sentAt ? (
        <p className="mt-3 text-[0.85rem] leading-snug text-muted">
          Verstuurd op {formatDateTime(document.sentAt)}
          {document.recipientEmail ? ` naar ${document.recipientEmail}` : ""}.
        </p>
      ) : null}

      {sentNumber ? (
        <p role="status" className="mt-3 text-[0.85rem] leading-snug text-success">
          Verstuurd naar {recipient} met nummer {sentNumber}.
        </p>
      ) : null}

      {confirming ? (
        <div className="mt-3 space-y-3 rounded-sm border border-line bg-paper-deep p-4">
          <p className="text-[0.85rem] leading-snug text-body">
            De opgeslagen {kindLabel} gaat als PDF naar <span className="text-ink">{recipient}</span>.
            {document.number.provisional
              ? " Daarbij wordt het definitieve nummer toegekend."
              : ` Het nummer blijft ${document.number.value}.`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <AdminButton onClick={send} disabled={pending}>
              {pending ? "Versturen…" : "Definitief versturen"}
            </AdminButton>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="link-static text-[0.9rem] text-ink"
            >
              Annuleren
            </button>
          </div>
        </div>
      ) : (
        <AdminButton
          variant="secondary"
          className="mt-3"
          disabled={Boolean(blocked)}
          onClick={() => {
            setSentNumber(null);
            setConfirming(true);
          }}
        >
          {document.sentAt ? "Opnieuw versturen" : "Versturen naar klant"}
        </AdminButton>
      )}

      {blocked ? <p className="mt-2 text-[0.82rem] text-muted">{blocked}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 text-[0.85rem] leading-snug text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Generates the PDF in the browser from the current document and shows it in
 * a preview frame with a download link. Loaded only on the client (see the
 * dynamic import in the builders).
 */
export default function PdfPanel({ document: doc, fileName, ready }: PdfPanelProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [open, setOpen] = useState(false);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  async function generate() {
    setState("busy");
    try {
      const element = doc.kind === "quote" ? <QuotePdf quote={doc.quote} /> : <InvoicePdf invoice={doc.invoice} />;
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
    <section aria-labelledby="pdf-heading" className="space-y-4">
      <h2 id="pdf-heading" className="label-mono text-ink">
        PDF
      </h2>
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
      {!ready ? <p className="text-[0.85rem] text-muted">Vul een klant en minstens één volledige regel in om een PDF te maken.</p> : null}
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
      <SendPanel doc={doc} />
    </section>
  );
}
