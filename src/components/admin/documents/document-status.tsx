import { SelectField } from "@/components/admin/form-field";
import StatusBadge, { type StatusTone } from "@/components/admin/status-badge";

type DocumentStatusProps<T extends string> = {
  value: T;
  order: readonly T[];
  labels: Record<T, string>;
  tones: Record<T, StatusTone>;
  onChange: (value: T) => void;
  edited: boolean;
};

/** Status of a quote or invoice in the session: badge plus select. */
export default function DocumentStatus<T extends string>({ value, order, labels, tones, onChange, edited }: DocumentStatusProps<T>) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={tones[value]}>{labels[value]}</StatusBadge>
        {edited ? <StatusBadge tone="accent">Gewijzigd in sessie</StatusBadge> : null}
      </div>
      <SelectField id="document-status" label="Status" value={value} onChange={(event) => onChange(event.target.value as T)}>
        {order.map((item) => (
          <option key={item} value={item}>
            {labels[item]}
          </option>
        ))}
      </SelectField>
      <p className="text-[0.82rem] leading-snug text-muted">
        De status is administratief: &quot;Verzonden&quot; of &quot;Betaald&quot; verstuurt of registreert niets.
      </p>
    </div>
  );
}
