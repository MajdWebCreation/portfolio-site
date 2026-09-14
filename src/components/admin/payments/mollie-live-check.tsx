"use client";

import { useState, useTransition } from "react";
import AdminButton from "@/components/admin/admin-button";
import StatusBadge from "@/components/admin/status-badge";
import { companyProfile } from "@/lib/admin/documents/company";
import { runMollieLiveCheck } from "@/lib/payments/live-check-actions";
import { liveCheckReady, type LiveCheckResult, type MethodAvailability } from "@/lib/payments/live-check";

/**
 * The live Mollie koppeling, checked before the first real invoice.
 *
 * Read-only on the server side, and read-only in what it shows: a name and
 * some yes/no. No key, no token, no profile id, no customer id -- none of
 * that would help an admin and all of it would be a thing to leak.
 *
 * A method Mollie does not report as usable is shown as a blocker rather than
 * a warning, because that is what it is: an invoice sent in that state is an
 * invoice the customer cannot pay.
 */
const methodLabels: Record<MethodAvailability["status"], string> = {
  activated: "beschikbaar",
  "pending-boarding": "nog niet afgerond",
  "pending-review": "wacht op goedkeuring",
  "pending-external": "wacht op externe partij",
  rejected: "afgewezen",
  unavailable: "niet beschikbaar",
};

function methodTone(state: MethodAvailability): "success" | "accent" | "danger" {
  if (state.activated && state.usable) return "success";
  if (state.status === "rejected" || state.status === "unavailable") return "danger";
  return "accent";
}

export default function MollieLiveCheck() {
  const [result, setResult] = useState<LiveCheckResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-5 border-t border-line pt-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="label-mono text-ink">Live-controle</h3>
        {result?.keyValid && liveCheckReady(result) ? <StatusBadge tone="success">Klaar voor echte betalingen</StatusBadge> : null}
        {result?.keyValid && !liveCheckReady(result) ? <StatusBadge tone="danger">Nog niet klaar</StatusBadge> : null}
        {result && !result.keyValid ? <StatusBadge tone="danger">Controle mislukt</StatusBadge> : null}
      </div>

      <p className="max-w-[60ch] text-[0.92rem] leading-relaxed text-muted">
        Leest bij Mollie welk profiel aan de ingestelde sleutel hangt en welke betaalmethodes daarvoor openstaan. De
        controle leest alleen; er wordt niets aangemaakt, gewijzigd of geïncasseerd.
      </p>

      <AdminButton
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(null);
            setResult(await runMollieLiveCheck());
          })
        }
      >
        {pending ? "Controleren…" : "Live-koppeling controleren"}
      </AdminButton>

      {result?.keyValid ? (
        <>
          <dl className="max-w-[34rem] border-t border-line text-[0.9rem]">
            <Row term="Live API-key" tone="success" value="geldig" />
            <Row
              term="Profiel"
              value={result.profileName}
              tone={result.profileMatchesCompany ? "success" : "danger"}
              note={result.profileMatchesCompany ? undefined : `verwacht: ${companyProfile.name}`}
            />
            <Row
              term="Profielstatus"
              value={
                result.profileStatus === "verified"
                  ? "geverifieerd"
                  : result.profileStatus === "unverified"
                    ? "nog niet geverifieerd"
                    : "geblokkeerd"
              }
              tone={result.profileStatus === "verified" ? "success" : "danger"}
              {...(result.profileReview ? { note: `beoordeling: ${result.profileReview === "pending" ? "loopt" : "afgewezen"}` } : {})}
            />
            <Row term="iDEAL" value={methodLabels[result.ideal.status]} tone={methodTone(result.ideal)} />
            <Row
              term="SEPA Incasso"
              value={methodLabels[result.directDebit.status]}
              tone={methodTone(result.directDebit)}
            />
          </dl>

          {result.blockers.length > 0 ? (
            <div role="alert" className="max-w-[60ch] border-l-2 border-danger pl-3">
              <p className="text-[0.9rem] font-medium text-danger">
                Dit moet eerst geregeld zijn voordat je echte facturen verstuurt:
              </p>
              <ul className="mt-1.5 space-y-1 text-[0.9rem] leading-snug text-danger">
                {result.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="max-w-[60ch] text-[0.9rem] leading-snug text-muted">
              Het profiel klopt en beide betaalmethodes staan open. Je kunt echte facturen versturen.
            </p>
          )}
        </>
      ) : null}

      {result && !result.keyValid ? (
        <p role="alert" className="max-w-[60ch] border-l-2 border-danger pl-3 text-[0.9rem] leading-snug text-danger">
          {result.reason}
        </p>
      ) : null}
    </div>
  );
}

function Row({
  term,
  value,
  tone,
  note,
}: {
  term: string;
  value: string;
  tone: "success" | "accent" | "danger";
  note?: string;
}) {
  const colour = tone === "success" ? "text-ink" : tone === "danger" ? "text-danger" : "text-ink";
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line py-2.5">
      <dt className="text-muted">{term}</dt>
      <dd className={`min-w-0 text-right ${colour}`}>
        {value}
        {note ? <span className="block text-[0.82rem] text-muted">{note}</span> : null}
      </dd>
    </div>
  );
}
