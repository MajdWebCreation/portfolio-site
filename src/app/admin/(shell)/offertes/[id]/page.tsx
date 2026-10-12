import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import QuoteBuilder from "@/components/admin/quotes/quote-builder";
import QuoteIssued from "@/components/admin/quotes/quote-issued";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";
import { listProjects } from "@/lib/admin/projects/repository";
import { getQuoteDecision } from "@/lib/admin/quotes/decisions";
import { findQuoteSuccessor } from "@/lib/admin/quotes/repository";
import { isQuoteFrozen } from "@/lib/admin/quotes/types";
import { readCustomerRecipient, readQuote } from "@/lib/admin/readers";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const item = await readQuote(id);
  return { title: item ? `${item.number.value} · Offertes` : "Offerte" };
}

export default async function QuotesDetailPage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  /* The quote and the lists the builder offers are independent reads. */
  const [item, customers, projects] = await Promise.all([readQuote(id), listCustomers(), listProjects()]);

  if (!item) {
    notFound();
  }

  /*
    Where a send would go: the customer as they are now, by the same resolver
    the send action runs. Reopening a concept after the customer's address
    changed shows the new address, not the one the concept copied.

    The chain this quote sits in is only asked about once it is numbered: a
    concept may be a new version of something, but nothing can be a new
    version of a concept.
  */
  const [recipient, successor, predecessor, decision] = await Promise.all([
    readCustomerRecipient(item.customer.customerId, "general"),
    isQuoteFrozen(item) ? findQuoteSuccessor(item.id) : undefined,
    item.supersedesQuoteId ? readQuote(item.supersedesQuoteId) : undefined,
    item.sentAt ? getQuoteDecision(item.id) : undefined,
  ]);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label={`Offerte · ${item.number.value}`}
        title={item.customer.companyName}
        text={item.subject}
        actions={
          <Link href="/admin/offertes" className="link-static text-[0.92rem] text-ink">
            Alle offertes
          </Link>
        }
      />
      {/*
        Two screens, one page. A concept is something to write, so it gets the
        builder; a numbered quote is something to check, send and decide on,
        so it gets the document. The database refuses every edit from the
        moment the number is taken, and a form that cannot save is worse than
        no form.
      */}
      {isQuoteFrozen(item) ? (
        <QuoteIssued
          quote={item}
          recipient={recipient}
          successor={successor}
          predecessor={predecessor}
          decision={decision}
          todayKey={toDateKey(new Date())}
        />
      ) : (
        /*
          Keyed on what sending changes. Issuing a number happens on the
          server, so the builder has to start again from the stored record
          rather than keep showing the concept it was mounted with.
        */
        <QuoteBuilder
          key={`${item.number.value}-${item.status}`}
          stored={item}
          customers={customers}
          projects={projects}
          todayKey={toDateKey(new Date())}
          recipient={recipient}
          predecessor={predecessor}
        />
      )}
    </div>
  );
}
