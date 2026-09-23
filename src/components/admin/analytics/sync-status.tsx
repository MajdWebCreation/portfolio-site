import AdminSection from "@/components/admin/admin-section";
import { Empty, num } from "@/components/admin/analytics/parts";
import RefreshButton from "@/components/admin/analytics/refresh-button";
import StatusBadge, { type StatusTone } from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/admin/format";
import type { ProviderSyncStatus, SyncStatus } from "@/lib/admin/analytics/types";
import type { ProviderHealth } from "@/lib/analytics-admin/types";

/**
 * The synchronisation per provider: whether it is set up, how its last
 * run went, and per report the latest result. One card per provider from
 * the same model, so a provider added later is another entry in the list,
 * not another block.
 */
export const healthLabels: Record<ProviderHealth, { label: string; tone: StatusTone }> = {
  ok: { label: "Werkt", tone: "success" },
  configured: { label: "Gekoppeld, nog niet gesynct", tone: "neutral" },
  not_configured: { label: "Niet gekoppeld", tone: "neutral" },
  auth_failed: { label: "Toegang geweigerd", tone: "danger" },
  provider_error: { label: "Fout bij ophalen", tone: "danger" },
};

export function HealthBadge({ health }: { health: ProviderHealth }) {
  const { label, tone } = healthLabels[health];
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

function ProviderCard({ status }: { status: ProviderSyncStatus }) {
  return (
    <div className="border-t border-line pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[0.95rem] font-medium text-ink">{status.label}</h3>
        <HealthBadge health={status.health} />
      </div>
      {status.parts.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[0.85rem] text-muted">
          {status.parts.map((part) => (
            <li key={part.variable}>
              {part.label}: <span className={part.configured ? "text-success" : "text-ink"}>{part.configured ? "ingesteld" : "niet ingesteld"}</span>{" "}
              <span className="tabular text-faint">({part.variable})</span>
            </li>
          ))}
        </ul>
      ) : null}
      {!status.configured ? (
        <p className="mt-2 text-[0.88rem] text-muted">
          Ontbrekend of ongeldig in de omgeving: <span className="tabular text-ink">{status.missing.join(", ")}</span>.
        </p>
      ) : (
        <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="label-mono text-muted">Laatste geslaagde sync</dt>
            <dd className="mt-1 text-[0.9rem] text-ink">
              {status.lastSuccess ? (
                <>
                  {formatDateTime(status.lastSuccess.at)}
                  <span className="block text-[0.82rem] text-muted">{num(status.lastSuccess.rows)} rijen</span>
                </>
              ) : (
                <span className="text-muted">Nog geen</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="label-mono text-muted">Laatste fout</dt>
            <dd className="mt-1 text-[0.9rem] text-ink">
              {status.lastFailure ? (
                <>
                  {formatDateTime(status.lastFailure.at)}
                  <span className="tabular block text-[0.82rem] text-danger">
                    {status.lastFailure.report}: {status.lastFailure.error}
                  </span>
                </>
              ) : (
                <span className="text-muted">Geen</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="label-mono text-muted">Laatste run</dt>
            <dd className="mt-1 text-[0.9rem] text-ink">
              {status.lastRun ? (
                <>
                  {formatDateTime(status.lastRun.at)}
                  <span className="tabular block text-[0.82rem] text-muted">
                    {status.lastRun.report} · {status.lastRun.status}
                  </span>
                </>
              ) : (
                <span className="text-muted">Nog geen</span>
              )}
            </dd>
          </div>
        </dl>
      )}
      {status.reports.length > 0 ? (
        <table className="adm-table mt-4">
          <thead>
            <tr>
              <th scope="col">Rapport</th>
              <th scope="col">Status</th>
              <th scope="col">Moment</th>
              <th scope="col" className="adm-num">
                Rijen
              </th>
              <th scope="col">Fout</th>
            </tr>
          </thead>
          <tbody>
            {status.reports.map((report) => (
              <tr key={report.report}>
                <td data-label="Rapport" className="tabular">
                  {report.report}
                </td>
                <td data-label="Status">
                  <StatusBadge tone={report.status === "ok" ? "success" : report.status === "failed" ? "danger" : "neutral"}>{report.status}</StatusBadge>
                </td>
                <td data-label="Moment">{formatDateTime(report.at)}</td>
                <td data-label="Rijen" className="adm-num">
                  {num(report.rows)}
                </td>
                <td data-label="Fout" className="tabular text-muted">
                  {report.error ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export default function SyncStatusSection({ sync }: { sync: SyncStatus }) {
  const anyConfigured = sync.providers.some((provider) => provider.configured);
  return (
    <AdminSection id="sync" title="Synchronisatie" note="Per bron via de dagelijkse job, 06:00 UTC; wekelijkse rapporten op maandag">
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <div className="border-t border-line pt-2">
          <dt className="label-mono text-muted">Schrijven</dt>
          <dd className="mt-1 text-[0.92rem]">
            {sync.enabled ? <StatusBadge tone="success">Aan</StatusBadge> : <StatusBadge tone="neutral">Proefrun</StatusBadge>}
            {!sync.enabled ? <span className="mt-1 block text-[0.85rem] text-muted">ANALYTICS_SYNC_ENABLED is niet &quot;true&quot;: de job telt en slaat niets op.</span> : null}
          </dd>
        </div>
        <div className="border-t border-line pt-2">
          <dt className="label-mono text-muted">Handmatig</dt>
          <dd className="mt-1">{anyConfigured ? <RefreshButton /> : <Empty>Koppel eerst minstens één bron.</Empty>}</dd>
        </div>
      </dl>
      {sync.truncated ? (
        <p className="mt-3 text-[0.85rem] text-danger">De periode bevat meer rijen dan de pagina in één keer leest; de oudste dagen ontbreken mogelijk in de blokken hierboven.</p>
      ) : null}
      <div className="mt-6 space-y-8">
        {sync.providers.map((status) => (
          <ProviderCard key={status.provider} status={status} />
        ))}
      </div>
    </AdminSection>
  );
}
