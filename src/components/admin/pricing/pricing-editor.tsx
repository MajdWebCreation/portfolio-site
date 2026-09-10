"use client";

import { useId, useState } from "react";
import AdminSection from "@/components/admin/admin-section";
import { inputClass } from "@/components/admin/form-field";
import { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { updateAddOnPrice, updatePackagePrice } from "@/lib/admin/pricing/actions";
import {
  parseEuroInput,
  priceModeLabels,
  type AdminPricingPackage,
} from "@/lib/admin/pricing/model";
import type { ActionResult } from "@/lib/admin/action-result";
import { formatAddOnPrice, formatMonthlyFrom, formatStartingPrice } from "@/lib/pricing";

type AmountFieldProps = {
  label: string;
  /** The stored amount in whole euros. */
  value: number;
  /** How the amount reads on the public site. */
  preview: (amount: number) => string;
  save: (euros: number) => Promise<ActionResult>;
};

/**
 * One editable amount. It saves on blur or Enter, which is how the editor
 * already worked; the difference is that the amount now goes to the database
 * instead of a session store.
 */
function AmountField({ label, value, preview, save: saveAmount }: AmountFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const { save, pending, error, savedAt } = useSave();

  function commit(text: string) {
    const parsed = parseEuroInput(text);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(null);
    if (parsed === value) return;
    save(() => saveAmount(parsed));
  }

  return (
    <div className="grid gap-x-4 gap-y-1.5 border-b border-line py-3 sm:grid-cols-[minmax(0,1fr)_7.5rem_11rem] sm:items-center">
      <label htmlFor={id} className="min-w-0 text-[0.92rem] text-ink">
        {label}
      </label>
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[0.9rem] text-muted">
          €
        </span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          disabled={pending}
          value={draft ?? String(value)}
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(event.currentTarget.value);
            }
          }}
          aria-invalid={invalid || Boolean(error) || undefined}
          aria-describedby={`${id}-preview`}
          className={`${inputClass} tabular min-h-10 py-1.5 pl-7 text-right`}
        />
      </div>
      <p id={`${id}-preview`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.85rem] text-muted">
        {invalid ? (
          <span className="text-danger">Alleen hele euro&apos;s.</span>
        ) : error ? (
          <span className="text-danger">{error}</span>
        ) : (
          <>
            <span>{preview(value)}</span>
            {pending ? <span>Opslaan…</span> : savedAt ? <StatusBadge tone="success">Opgeslagen</StatusBadge> : null}
          </>
        )}
      </p>
    </div>
  );
}

export default function PricingEditor({ packages }: { packages: AdminPricingPackage[] }) {
  return (
    <div className="space-y-10">
      <AdminSection id="project-types" title="Projecttypes" note="Eenmalige vanafprijs en technisch beheer per type">
        <div className="grid gap-x-10 gap-y-8 xl:grid-cols-2">
          {packages.map((pkg) => (
            <div key={pkg.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-[1.05rem] font-semibold text-ink">{pkg.name}</h3>
                {pkg.scopeDriven ? <StatusBadge>Scope bepaalt de prijs</StatusBadge> : null}
              </div>
              <p className="mt-0.5 text-[0.85rem] text-muted">{pkg.tagline}</p>
              <div className="mt-2 border-t border-line">
                <AmountField
                  label="Eenmalig vanaf"
                  value={pkg.startingPrice}
                  preview={(amount) => formatStartingPrice(amount, "nl", pkg.scopeDriven)}
                  save={(euros) => updatePackagePrice(pkg.id, "startingPrice", euros)}
                />
                <AmountField
                  label="Technisch beheer vanaf"
                  value={pkg.monthlyManagementFrom}
                  preview={(amount) => formatMonthlyFrom(amount, "nl")}
                  save={(euros) => updatePackagePrice(pkg.id, "monthlyManagementFrom", euros)}
                />
              </div>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection id="add-ons" title="Uitbreidingen" note="Per projecttype; de planner selecteert ze op dezelfde id's">
        <div className="space-y-8">
          {packages.map((pkg) => (
            <div key={pkg.id}>
              <h3 className="text-[1.05rem] font-semibold text-ink">{pkg.name}</h3>
              <div className="mt-2 border-t border-line">
                {pkg.addOns.map((addOn) => (
                  <AmountField
                    key={addOn.id}
                    label={`${addOn.label} · ${addOn.groupLabel}`}
                    value={addOn.amount}
                    preview={(amount) => `${formatAddOnPrice(amount, addOn.mode, "nl")} · ${priceModeLabels[addOn.mode].toLowerCase()}`}
                    save={(euros) => updateAddOnPrice(pkg.id, addOn.id, euros)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </AdminSection>

      <p role="note" className="border-t border-line pt-4 text-[0.85rem] leading-snug text-muted">
        Bedragen worden opgeslagen in de database en zijn daarmee de enige bron. De publieke tarievenpagina en de
        projectplanner tonen na opslaan direct deze bedragen.
      </p>
    </div>
  );
}
