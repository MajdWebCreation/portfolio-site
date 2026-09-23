"use client";

import { useId, useState } from "react";
import AdminSection from "@/components/admin/admin-section";
import { inputClass } from "@/components/admin/form-field";
import SaveControls, { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { updateAddOnPrice, updateDevelopmentDiscount, updatePackagePrice } from "@/lib/admin/pricing/actions";
import {
  parseEuroInput,
  parsePercentInput,
  priceModeLabels,
  type AdminPricingPackage,
  type AdminPricingSettings,
} from "@/lib/admin/pricing/model";
import type { ActionResult } from "@/lib/admin/action-result";
import {
  developmentDiscountFromSettings,
  developmentPrice,
  formatAddOnPrice,
  formatEuro,
  formatMonthlyFrom,
  formatStartingPrice,
  isValidDevelopmentDiscountPercent,
  maxDevelopmentDiscountPercent,
  minDevelopmentDiscountPercent,
} from "@/lib/pricing";

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

/**
 * The temporary discount on development costs: one switch and one percentage,
 * saved together. The preview runs the typed values through the same rule the
 * public site uses; what the site shows is decided by the stored values and
 * the server action, not by this preview.
 */
function DevelopmentDiscountSettings({
  packages,
  settings,
}: {
  packages: AdminPricingPackage[];
  settings: AdminPricingSettings;
}) {
  const switchId = useId();
  const percentId = useId();
  const [enabled, setEnabled] = useState(settings.developmentDiscountEnabled);
  const [percentText, setPercentText] = useState(
    settings.developmentDiscountPercent === null ? "" : String(settings.developmentDiscountPercent),
  );
  const { save, pending, error, savedAt } = useSave();

  const percent = parsePercentInput(percentText);
  const percentValid = isValidDevelopmentDiscountPercent(percent);
  const changed =
    enabled !== settings.developmentDiscountEnabled || percent !== settings.developmentDiscountPercent;
  const preview = developmentDiscountFromSettings(percentValid ? { enabled, percent } : null);

  return (
    <AdminSection
      id="development-discount"
      title="Tijdelijke korting op ontwikkelkosten"
      note="Alleen eenmalige bedragen; technisch beheer blijft ongewijzigd"
    >
      {settings.loadError ? (
        <p role="alert" className="mb-4 border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
          Instelling niet gelezen: {settings.loadError}. De site toont nu de gewone prijzen.
        </p>
      ) : null}
      <div className="grid gap-x-10 gap-y-6 xl:grid-cols-2">
        <div className="space-y-5">
          <label htmlFor={switchId} className="flex items-center gap-3 text-[0.95rem] text-ink">
            <input
              id={switchId}
              type="checkbox"
              role="switch"
              checked={enabled}
              disabled={pending}
              onChange={(event) => setEnabled(event.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            Korting tonen op de site
          </label>
          <div className="max-w-[12rem]">
            <label htmlFor={percentId} className="label-mono mb-1.5 block">
              Percentage
            </label>
            <div className="relative">
              <input
                id={percentId}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                disabled={pending}
                value={percentText}
                onChange={(event) => setPercentText(event.target.value)}
                aria-invalid={(percentText !== "" && !percentValid) || undefined}
                aria-describedby={`${percentId}-hint`}
                className={`${inputClass} tabular pr-8 text-right`}
              />
              <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.9rem] text-muted">
                %
              </span>
            </div>
            <p id={`${percentId}-hint`} className={`mt-1.5 text-[0.82rem] ${percentText !== "" && !percentValid ? "text-danger" : "text-muted"}`}>
              Heel getal van {minDevelopmentDiscountPercent} tot en met {maxDevelopmentDiscountPercent}.
            </p>
          </div>
          <SaveControls
            label="Korting opslaan"
            pending={pending}
            error={error}
            savedAt={savedAt}
            disabled={!changed || !percentValid}
            onSave={() => {
              if (percent !== null) save(() => updateDevelopmentDiscount(enabled, percent));
            }}
            className="max-w-[16rem]"
          />
        </div>

        <div>
          <p className="label-mono">{preview ? "Voorbeeld eenmalig vanaf" : "Zonder korting"}</p>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {packages.map((pkg) => {
              const price = developmentPrice(pkg.startingPrice, preview);
              return (
                <li key={pkg.id} className="flex items-baseline justify-between gap-4 py-2 text-[0.9rem]">
                  <span className="text-body">{pkg.name}</span>
                  <span className="tabular shrink-0 text-ink">
                    {price.percent === null ? (
                      formatEuro(price.amount, "nl")
                    ) : (
                      <>
                        <span className="text-muted">{formatEuro(price.baseAmount, "nl")}</span>
                        {" → "}
                        {formatEuro(price.amount, "nl")}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[0.82rem] text-muted">
            De opgeslagen bedragen blijven ongewijzigd. Uitbreidingen en de planner volgen dezelfde regel.
          </p>
        </div>
      </div>
    </AdminSection>
  );
}

export default function PricingEditor({
  packages,
  settings,
}: {
  packages: AdminPricingPackage[];
  settings: AdminPricingSettings;
}) {
  return (
    <div className="space-y-10">
      <DevelopmentDiscountSettings packages={packages} settings={settings} />

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
