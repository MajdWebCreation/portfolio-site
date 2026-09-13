import Link from "next/link";
import StatusBadge from "@/components/admin/status-badge";
import { activationStatusLabels, activationStatusTone } from "@/lib/payments/activation-decision";
import type { ActivationSummary } from "@/lib/payments/activation-view";

/**
 * Where switching a monthly service on has got to, in the admin's own terms.
 *
 * Two facts and no jargon: whether the one-off invoice that authorises the
 * collection has been paid, and what the collection itself is doing. Nothing
 * here names a sequence type, a Mollie customer or a mandate id -- those are
 * the provider's business, and knowing them changes nothing an admin can do.
 */
export default function ActivationLines({ summary }: { summary?: ActivationSummary }) {
  if (!summary || summary.status === "not_applicable") return null;

  return (
    <dl className="mt-2 space-y-1 text-[0.82rem]">
      {summary.invoice ? (
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <dt className="text-muted">Eenmalige factuur</dt>
          <dd className="text-ink">
            <Link href={`/admin/facturen/${summary.invoice.id}`} className="link-static font-mono">
              {summary.invoice.number}
            </Link>{" "}
            · {summary.invoice.paid ? "betaald" : "open"}
          </dd>
        </div>
      ) : null}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <dt className="text-muted">Incasso</dt>
        <dd>
          <StatusBadge tone={activationStatusTone[summary.status]}>{activationStatusLabels[summary.status]}</StatusBadge>
        </dd>
      </div>
    </dl>
  );
}
