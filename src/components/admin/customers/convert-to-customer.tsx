"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminButton from "@/components/admin/admin-button";
import { useSave } from "@/components/admin/save-controls";
import { createCustomerFromInquiry, createCustomerFromLead } from "@/lib/admin/customers/conversion";

type ConvertToCustomerProps = {
  source: "inquiry" | "lead";
  sourceId: string;
  /** The customer this source already produced, when it has one. */
  customerId: string | null;
};

const copy = {
  inquiry: {
    explanation: "Maakt een klant van deze aanvraag, met de aanvraag als herkomst. Adresgegevens vul je daarna aan.",
    action: "Klant maken",
    done: "Deze aanvraag is al een klant.",
  },
  lead: {
    explanation: "Maakt een klant van deze lead, met de lead als herkomst. Adresgegevens vul je daarna aan.",
    action: "Omzetten naar klant",
    done: "Deze lead is al een klant.",
  },
} as const;

/**
 * One conversion, once. The button disappears as soon as a customer exists
 * for this source and is replaced by a link to it, so a second conversion is
 * not something the screen even offers — and the action and a unique index
 * refuse it anyway.
 */
export default function ConvertToCustomer({ source, sourceId, customerId }: ConvertToCustomerProps) {
  const router = useRouter();
  const { save, pending, error } = useSave();
  const text = copy[source];

  if (customerId) {
    return (
      <div className="border-t border-line pt-6">
        <h2 className="label-mono text-ink">Klant</h2>
        <p className="mt-3 text-[0.88rem] leading-snug text-muted">{text.done}</p>
        <Link href={`/admin/klanten/${customerId}`} className="link-static mt-3 inline-block text-[0.92rem] text-ink">
          Klant openen
        </Link>
      </div>
    );
  }

  function convert() {
    save(
      () => (source === "inquiry" ? createCustomerFromInquiry(sourceId) : createCustomerFromLead(sourceId)),
      (value: { customerId: string; created: boolean }) => router.push(`/admin/klanten/${value.customerId}`),
    );
  }

  return (
    <div className="border-t border-line pt-6">
      <h2 className="label-mono text-ink">Vervolg</h2>
      <p className="mt-3 text-[0.88rem] leading-snug text-muted">{text.explanation}</p>
      <AdminButton variant="secondary" className="mt-4" onClick={convert} disabled={pending}>
        {pending ? "Bezig…" : text.action}
      </AdminButton>
      {error ? (
        <p role="alert" className="mt-2 text-[0.85rem] leading-snug text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
