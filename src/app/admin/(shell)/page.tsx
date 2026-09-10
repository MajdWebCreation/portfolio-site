import Link from "next/link";
import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import AdminSection from "@/components/admin/admin-section";
import StatusBadge, { type StatusTone } from "@/components/admin/status-badge";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";
import { listInquiries } from "@/lib/admin/inquiries/repository";
import { listInvoices } from "@/lib/admin/invoices/repository";
import { listLeads } from "@/lib/admin/leads/repository";
import { listQuotes } from "@/lib/admin/quotes/repository";
import { getFollowUpState } from "@/lib/admin/leads/types";
import { adminModules, getAdminModulePath } from "@/lib/admin/modules";

export const metadata: Metadata = {
  title: "Dashboard",
};

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Amsterdam",
});

type QueueRow = { key: string; label: string; state: string; count: number; tone: StatusTone; href: string };

export default async function AdminDashboardPage() {
  await requireAdminAccess();

  const now = new Date();
  const todayKey = toDateKey(now);
  const inquiries = await listInquiries();
  const leads = await listLeads();
  const customers = await listCustomers();
  const quotes = await listQuotes();
  const invoices = await listInvoices();

  const queue: QueueRow[] = [
    {
      key: "inquiries-new",
      label: "Aanvragen",
      state: "Nieuw",
      count: inquiries.filter((inquiry) => inquiry.status === "new").length,
      tone: "accent",
      href: "/admin/aanvragen",
    },
    {
      key: "inquiries-follow-up",
      label: "Aanvragen",
      state: "Opvolgen",
      count: inquiries.filter((inquiry) => inquiry.status === "follow_up").length,
      tone: "neutral",
      href: "/admin/aanvragen",
    },
    {
      key: "leads-due",
      label: "Leads",
      state: "Opvolging vandaag of te laat",
      count: leads.filter((lead) => ["overdue", "today"].includes(getFollowUpState(lead, todayKey))).length,
      tone: "danger",
      href: "/admin/leads",
    },
    {
      key: "leads-to-contact",
      label: "Leads",
      state: "Te benaderen",
      count: leads.filter((lead) => lead.status === "new" || lead.status === "to_contact").length,
      tone: "neutral",
      href: "/admin/leads",
    },
    {
      key: "quotes-open",
      label: "Offertes",
      state: "Concept of verzonden",
      count: quotes.filter((quote) => quote.status === "draft" || quote.status === "sent").length,
      tone: "neutral",
      href: "/admin/offertes",
    },
    {
      key: "invoices-open",
      label: "Facturen",
      state: "Openstaand",
      count: invoices.filter((invoice) => invoice.status === "sent" || invoice.status === "overdue").length,
      tone: invoices.some((invoice) => invoice.status === "overdue") ? "danger" : "neutral",
      href: "/admin/facturen",
    },
  ];

  const modules = adminModules.filter((module) => module.key !== "dashboard");

  return (
    <div className="space-y-10">
      <AdminPageHeader
        label={dateFormatter.format(now)}
        title="Dashboard"
        text="Wat aandacht vraagt, per werkstroom."
      />

      <AdminSection id="work-queue" title="Werkvoorraad">
        {inquiries.length + leads.length + quotes.length + invoices.length === 0 ? (
          <p className="border-b border-line pb-4 text-[0.95rem] text-muted">Geen werkvoorraad: er zijn nog geen aanvragen of leads.</p>
        ) : (
          <ul>
            {queue.map((row) => (
              <li key={row.key} className="border-b border-line">
                <Link href={row.href} className="group grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 py-3 sm:gap-x-6">
                  <span className="min-w-0 truncate font-medium text-ink transition-colors group-hover:text-accent">{row.label}</span>
                  <StatusBadge tone={row.count > 0 ? row.tone : "neutral"}>{row.state}</StatusBadge>
                  <span className="tabular w-8 text-right text-[1.15rem] font-semibold text-ink">{row.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection id="modules" title="Modules" note={`${modules.length} beschikbaar`}>
        <ol className="grid gap-x-10 md:grid-cols-2">
          {modules.map((module) => (
            <li key={module.key} className="border-b border-line py-3">
              <Link href={getAdminModulePath(module)} className="group flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="block font-medium text-ink transition-colors group-hover:text-accent">
                    {module.label}
                    {module.key === "customers" && customers.length > 0 ? (
                      <span className="ml-2 text-[0.85rem] font-normal text-muted">{customers.length}</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[0.9rem] text-muted">{module.description}</span>
                </span>
                {module.status === "available" ? <StatusBadge tone="success">Beschikbaar</StatusBadge> : <StatusBadge>Gepland</StatusBadge>}
              </Link>
            </li>
          ))}
        </ol>
      </AdminSection>
    </div>
  );
}
