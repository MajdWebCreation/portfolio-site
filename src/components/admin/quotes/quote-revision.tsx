"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { useSave } from "@/components/admin/save-controls";
import { createQuoteRevision } from "@/lib/admin/quotes/lifecycle";

/**
 * Making a new version of a sent quote.
 *
 * A sent quote cannot change, so a change is a new concept that names the
 * old one as the quote it replaces. The confirmation says what is copied and
 * what is not: the old quote stays exactly as it was, with its file; the new
 * one starts as a concept with today's date and no number.
 */
export default function QuoteRevision({ quoteId, number }: { quoteId: string; number: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { save, pending, error } = useSave();

  return (
    <div className="border-t border-line pt-6">
      <h3 className="label-mono text-ink">Nieuwe versie</h3>

      {confirming ? (
        <div className="mt-3 space-y-3 rounded-sm border border-line bg-paper-deep p-4">
          <p className="text-[0.85rem] leading-snug text-body">
            Er wordt een nieuw concept gemaakt met de regels, het onderwerp en de tekst van {number}, voor dezelfde
            klant en met de klantgegevens van nu. Het concept krijgt een eigen nummer zodra je het verstuurt.
          </p>
          <p className="text-[0.85rem] leading-snug text-muted">
            {number} zelf verandert niet: de verzonden PDF blijft het document dat de klant heeft.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <AdminButton
              onClick={() =>
                save(
                  () => createQuoteRevision(quoteId),
                  (id: string) => router.push(`/admin/offertes/${id}`),
                )
              }
              disabled={pending}
            >
              {pending ? "Bezig…" : "Nieuwe versie maken"}
            </AdminButton>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="link-static text-[0.9rem] text-ink"
            >
              Terug
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 text-[0.85rem] leading-snug text-muted">
            Moet er iets anders in de offerte? Een verzonden offerte wijzigt niet; maak er een nieuwe versie van.
          </p>
          <AdminButton variant="secondary" className="mt-3" onClick={() => setConfirming(true)}>
            Nieuwe versie maken
          </AdminButton>
        </>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-[0.85rem] leading-snug text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
