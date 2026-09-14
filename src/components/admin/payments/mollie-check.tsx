"use client";

import { useState, useTransition } from "react";
import AdminButton from "@/components/admin/admin-button";
import StatusBadge from "@/components/admin/status-badge";
import MollieLiveCheck from "@/components/admin/payments/mollie-live-check";
import type { MollieMode } from "@/lib/mollie/config";
import { runMollieIntegrationCheck, type IntegrationCheckResult } from "@/lib/payments/integration-check";

/**
 * The Mollie connection, checked by hand.
 *
 * The mode comes from the server, because the key is not something a browser
 * may see -- only the word "test", "live" or "not configured" travels. The
 * button exists only in test mode; the server refuses a live key regardless,
 * so this is the readable half of that rule, not the rule itself.
 */
const modeLabels: Record<MollieMode, string> = {
  not_configured: "Mollie niet geconfigureerd",
  test: "Testmodus actief",
  live: "Live-modus actief",
};

const modeTones: Record<MollieMode, "neutral" | "accent" | "success"> = {
  not_configured: "neutral",
  test: "accent",
  live: "success",
};

const modeText: Record<MollieMode, string> = {
  not_configured:
    "Er staat geen MOLLIE_API_KEY ingesteld. Facturen gaan gewoon uit, maar zonder betaalknop, en incasso kan niet worden geactiveerd.",
  test: "Er staat een testsleutel ingesteld. Je kunt de verbinding hier controleren; er beweegt geen echt geld.",
  live:
    "Er staat een live sleutel ingesteld. De testbetaling is daarmee uitgeschakeld: een betaling die hier wordt aangemaakt zou een echte zijn. De controle hieronder leest alleen.",
};

export default function MollieCheck({ mode }: { mode: MollieMode }) {
  const [result, setResult] = useState<IntegrationCheckResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={modeTones[mode]}>{modeLabels[mode]}</StatusBadge>
        {result?.ok ? <StatusBadge tone="success">Verbinding geslaagd</StatusBadge> : null}
        {result && !result.ok ? <StatusBadge tone="danger">Verbinding mislukt</StatusBadge> : null}
      </div>

      <p className="max-w-[60ch] text-[0.92rem] leading-relaxed text-muted">{modeText[mode]}</p>

      {mode === "test" ? (
        <>
          <AdminButton
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setResult(null);
                setResult(await runMollieIntegrationCheck());
              })
            }
          >
            {pending ? "Controleren…" : "Verbinding controleren"}
          </AdminButton>

          <p className="max-w-[60ch] text-[0.85rem] leading-snug text-faint">
            De controle maakt één testbetaling van één cent bij Mollie en leest die meteen terug. Er komt geen factuur,
            geen factuurnummer, geen dienst en geen klant aan te pas, en er wordt niets in de YM-administratie
            geschreven.
          </p>
        </>
      ) : null}

      {result?.ok ? (
        <dl className="max-w-[34rem] border-t border-line text-[0.9rem]">
          <Row term="Mollie-betaling" value={result.paymentId} mono />
          <Row term="Status" value={result.status} />
          <Row term="Bedrag" value={result.amount} />
          <Row term="Betaalpagina" value={result.checkoutAvailable ? "Aangemaakt" : "Niet teruggegeven"} />
          <Row term="Teruggelezen" value={result.readBack ? "Ja" : "Nee, alleen schrijven werkte"} />
        </dl>
      ) : null}

      {result && !result.ok ? (
        <p role="alert" className="max-w-[60ch] border-l-2 border-danger pl-3 text-[0.9rem] leading-snug text-danger">
          {result.reason}
        </p>
      ) : null}

      {/*
        Only on a live key, and only for an admin -- this component renders
        inside a page that already required one. The server action checks both
        again, because a rendered button is not an authorisation.
      */}
      {mode === "live" ? <MollieLiveCheck /> : null}
    </div>
  );
}

function Row({ term, value, mono = false }: { term: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line py-2.5">
      <dt className="text-muted">{term}</dt>
      <dd className={`min-w-0 break-all text-ink ${mono ? "font-mono text-[0.85rem]" : ""}`}>{value}</dd>
    </div>
  );
}
