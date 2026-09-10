import { SelectField } from "@/components/admin/form-field";
import type { Customer } from "@/lib/admin/customers/types";
import type { CustomerSnapshot } from "@/lib/admin/documents/types";

type CustomerSelectProps = {
  customers: Customer[];
  value: CustomerSnapshot | null;
  onSelect: (customer: Customer | null) => void;
  error?: string;
};

/** Pick the customer; the document keeps a snapshot of the chosen record. */
export default function CustomerSelect({ customers, value, onSelect, error }: CustomerSelectProps) {
  return (
    <div className="space-y-3">
      <SelectField
        id="customer"
        label="Klant"
        value={value?.customerId ?? ""}
        onChange={(event) => onSelect(customers.find((customer) => customer.id === event.target.value) ?? null)}
        error={error}
      >
        <option value="">Kies een klant</option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.companyName}
          </option>
        ))}
      </SelectField>
      {value ? (
        <address className="rounded-sm border border-line bg-surface px-3.5 py-3 text-[0.9rem] not-italic leading-snug text-body">
          <span className="block font-medium text-ink">{value.companyName}</span>
          <span className="block">{value.contactName}</span>
          <span className="block">{value.street}</span>
          <span className="block">
            {value.postalCode} {value.city}
            {value.country !== "Nederland" ? `, ${value.country}` : ""}
          </span>
          {value.kvkNumber ? <span className="block text-muted">KvK {value.kvkNumber}</span> : null}
          {value.vatNumber ? <span className="block text-muted">Btw {value.vatNumber}</span> : null}
          <span className="mt-1 block text-[0.8rem] text-faint">Momentopname op het document; latere klantwijzigingen veranderen dit niet.</span>
        </address>
      ) : null}
    </div>
  );
}
