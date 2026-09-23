import AdminSection from "@/components/admin/admin-section";
import { Empty, Note, dec, num } from "@/components/admin/analytics/parts";
import { HealthBadge } from "@/components/admin/analytics/sync-status";
import { formatDate } from "@/lib/admin/format";
import type { ClarityBlock, ClaritySignalKey, ProviderSyncStatus } from "@/lib/admin/analytics/types";

/**
 * Behaviour, from Microsoft Clarity: the latest 72-hour snapshot of the
 * project and the pages with the most frustration signals, in plain counts.
 * Recordings and heatmaps stay in Clarity; this block only links there.
 */
export const signalLabels: Record<ClaritySignalKey, { title: string; unit: string }> = {
  rageClicks: { title: "Rage clicks", unit: "rage clicks" },
  deadClicks: { title: "Dead clicks", unit: "dead clicks" },
  quickbacks: { title: "Quick backs", unit: "quick backs" },
  excessiveScroll: { title: "Overmatig scrollen", unit: "keer overmatig scrollen" },
  scriptErrors: { title: "Scriptfouten", unit: "scriptfouten" },
  errorClicks: { title: "Klikken op fouten", unit: "klikken op fouten" },
};

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-line py-3">
      <dt className="label-mono text-muted">{label}</dt>
      <dd className="tabular mt-1 text-[1.3rem] font-semibold leading-tight text-ink">{value}</dd>
    </div>
  );
}

export default function ClaritySection({ block, status }: { block: ClarityBlock; status: ProviderSyncStatus | undefined }) {
  const tagConfigured = status?.parts.find((part) => part.variable === "NEXT_PUBLIC_CLARITY_PROJECT_ID")?.configured ?? false;

  return (
    <AdminSection id="clarity" title="Gedrag" note="Microsoft Clarity, laatste 72 uur; alleen bezoekers die toestemming gaven voor gedragsopnames">
      {status ? (
        <p className="flex flex-wrap items-center gap-2 text-[0.85rem] text-muted">
          <HealthBadge health={status.health} />
          {!tagConfigured ? <span>Tracking op de website staat niet aan (NEXT_PUBLIC_CLARITY_PROJECT_ID).</span> : null}
          {!status.configured ? <span>Export-API niet gekoppeld (CLARITY_API_TOKEN); zie Synchronisatie onderaan.</span> : null}
        </p>
      ) : null}

      {block.snapshotDate === null ? (
        <div className="mt-3">
          <Empty>{status?.configured ? "Nog niets gesynchroniseerd." : "Nog geen gegevens uit Clarity."}</Empty>
        </div>
      ) : (
        <div className="mt-3 space-y-8">
          <div>
            <dl className="grid grid-cols-2 gap-x-6 md:grid-cols-4">
              <Tile label="Sessies" value={num(block.sessions)} />
              <Tile label="Gem. scrolldiepte" value={block.scrollDepth === null ? "—" : `${dec(block.scrollDepth)}%`} />
              <Tile label="Actieve tijd (s)" value={num(block.engagementActive)} />
              <Tile label="Totale tijd (s)" value={num(block.engagementTotal)} />
              {(Object.keys(signalLabels) as ClaritySignalKey[]).map((key) => (
                <Tile key={key} label={signalLabels[key].title} value={num(block.signals[key])} />
              ))}
            </dl>
            <Note>
              Momentopname van {formatDate(`${block.snapshotDate}T12:00:00Z`)} (UTC), over de 72 uur daarvoor, zoals Clarity die levert. — betekent dat Clarity dit cijfer
              niet meestuurde. Bots volgens Clarity: {num(block.botSessions)}.
            </Note>
          </div>

          <div>
            <h3 className="text-[0.9rem] font-medium text-ink">Pagina&apos;s met de meeste signalen</h3>
            {block.problemUrls.length === 0 ? (
              <div className="mt-2">
                <Empty>Geen signalen per pagina in deze momentopname.</Empty>
              </div>
            ) : (
              <ul className="mt-2 border-t border-line">
                {block.problemUrls.map((row) => (
                  <li key={row.path} className="border-b border-line py-2 text-[0.92rem]">
                    <span className="tabular text-ink">{row.path}</span>
                    <span className="text-muted">
                      {" — "}
                      {row.signals.map((signal) => `${num(signal.count)} ${signalLabels[signal.key].unit}`).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <aside className="mt-8 rounded-sm border border-line bg-surface p-4">
        <h3 className="text-[0.9rem] font-medium text-ink">Opnames en heatmaps</h3>
        <p className="mt-1 text-[0.85rem] text-muted">
          Blijven in Clarity en worden hier niet gekopieerd. Kies daar het project en open Recordings of Heatmaps. Microsoft bewaart opnames 30 dagen en heatmapgegevens 9
          maanden; de cijfers hierboven bewaren wij zelf 90 dagen.
        </p>
        <a href={block.consoleUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[0.88rem] font-medium text-accent underline-offset-2 hover:underline">
          Open Clarity ↗
        </a>
      </aside>
    </AdminSection>
  );
}
