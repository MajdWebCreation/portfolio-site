"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import AdminButton from "@/components/admin/admin-button";
import SendPanel from "@/components/admin/documents/send-panel";
import type { DocumentView } from "@/lib/admin/documents/view";

/**
 * The PDF renderer, fetched when someone asks for a PDF and not before.
 *
 * `ssr: false` alone was not enough: a dynamic component still loads its chunk
 * as soon as it is rendered, and this one was rendered on every quote and
 * invoice that was opened — over a megabyte of JavaScript for a button most
 * visits never press. Rendering it behind a click moves that cost to the
 * moment it buys something.
 */
const PdfPreview = dynamic(() => import("@/components/admin/documents/pdf-preview"), {
  ssr: false,
  loading: () => <p className="text-[0.85rem] text-muted">PDF-module laden…</p>,
});

type DocumentPanelProps = {
  document: DocumentView;
  fileName: string;
  ready: boolean;
  /**
   * What this document's next step is, under the PDF. A quote and a sent
   * invoice offer the mail; a concept invoice offers making it definitive
   * first, because sending is not what it needs next.
   */
  action?: ReactNode;
};

/** What a quote or invoice can become: a PDF, and whatever comes after it. */
export default function DocumentPanel({ document, fileName, ready, action }: DocumentPanelProps) {
  const [wantsPdf, setWantsPdf] = useState(false);

  return (
    <section aria-labelledby="pdf-heading" className="space-y-4">
      <h2 id="pdf-heading" className="label-mono text-ink">
        PDF
      </h2>

      {wantsPdf ? (
        <PdfPreview document={document} fileName={fileName} ready={ready} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <AdminButton onClick={() => setWantsPdf(true)} disabled={!ready}>
            PDF genereren
          </AdminButton>
        </div>
      )}

      {!ready ? <p className="text-[0.85rem] text-muted">Vul een klant en minstens één volledige regel in om een PDF te maken.</p> : null}

      {action ?? <SendPanel doc={document} />}
    </section>
  );
}
