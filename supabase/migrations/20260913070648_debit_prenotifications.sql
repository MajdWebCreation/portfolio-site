-- SEPA pre-notifications.
--
-- Before money is collected by direct debit the customer is told what will be
-- taken and when. That announcement is not a separate mail: it is the monthly
-- invoice itself, with the PDF attached, because a business customer needs
-- that document for their VAT administration either way. This table is the
-- record that the invoice went out as a pre-notification: not a second
-- schedule, and not a second source of truth for dates.
--
-- The date itself is never stored as a plan. It is derived from what the
-- system already knows -- the service's billing anchor (`starts_on`) and the
-- periods already billed (`invoices.billing_period_start`) -- so there is one
-- calendar, not two. What is stored here is what was announced, so that a
-- later change can be recognised as a change.
--
-- Idempotency is the unique key, and it is deliberately wider than
-- (service, period): it also covers the amount and the date that were
-- announced. Announcing the same thing twice is impossible; announcing a
-- *changed* amount or a moved collection date is a different row and is
-- allowed, which is exactly the behaviour a pre-notification needs.

create table public.debit_prenotifications (
  id                   uuid primary key default gen_random_uuid(),
  recurring_service_id uuid not null references public.recurring_services (id) on delete cascade,
  customer_id          uuid not null references public.customers (id) on delete restrict,
  /* The invoice that was sent. One announcement is one document, so the audit
     trail runs service -> invoice -> payment without a gap. */
  invoice_id           uuid not null references public.invoices (id) on delete restrict,

  -- The period the collection pays for, in the same terms invoices use.
  billing_period_start date not null,
  billing_period_end   date not null,
  -- The day the money is expected to be taken.
  scheduled_debit_on   date not null,

  amount_cents integer not null check (amount_cents > 0),
  currency     text not null default 'EUR' check (currency = 'EUR'),

  -- Who it went to, as it was at the time. A later change of address does not
  -- rewrite what we announced to whom.
  recipient_email text not null check (length(btrim(recipient_email)) > 0),

  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  /* Resend's id for the message, when it accepted one. */
  provider_message_id text,
  /* Why it failed, for the admin. Never a customer's personal data. */
  error text,

  claimed_at timestamptz not null default now(),
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The service and the customer on a pre-notification are the same customer.
  constraint debit_prenotifications_same_customer
    foreign key (recurring_service_id, customer_id)
    references public.recurring_services (id, customer_id) on delete cascade,

  -- And so is the invoice that was sent.
  constraint debit_prenotifications_invoice_same_customer
    foreign key (invoice_id, customer_id)
    references public.invoices (id, customer_id),

  constraint debit_prenotifications_period_ordered
    check (billing_period_end >= billing_period_start),

  -- "sent" is the only status that means a mail went out, so it is the only
  -- one that may carry a send time, and it must carry one.
  constraint debit_prenotifications_sent_at_matches_status
    check ((status = 'sent') = (sent_at is not null))
);

comment on table public.debit_prenotifications is
  'Record that a SEPA pre-notification was sent for one billing period of one recurring service.';
comment on column public.debit_prenotifications.scheduled_debit_on is
  'The collection date as announced; part of the idempotency key so a moved date can be announced again.';

/*
  One announcement per invoice, per announced amount and collection date.

  The invoice already carries the period -- the unique index on
  (recurring_service_id, billing_period_start) over invoices sees to that --
  so keying on the invoice says "this document, announced once" without
  repeating that rule here.

  A repeated run -- a retry, a second cron instance, two workers at once --
  fails to insert and reads the row that exists. A genuine change to the
  amount or the collection date is a different key, so the customer can be
  told again without the identical message ever going out twice.
*/
create unique index debit_prenotifications_announcement_unique
  on public.debit_prenotifications (invoice_id, scheduled_debit_on, amount_cents);

/*
  Customer first, so this one index covers both references: the plain key on
  customer_id, and the composite one on (recurring_service_id, customer_id),
  which Postgres matches on equality regardless of the order. It is also the
  lookup the customer page makes.
*/
create index debit_prenotifications_customer_idx
  on public.debit_prenotifications (customer_id, recurring_service_id);

/* Covers both the plain reference to the invoice and the composite one. */
create index debit_prenotifications_invoice_idx
  on public.debit_prenotifications (invoice_id, customer_id);

create index debit_prenotifications_service_period_idx
  on public.debit_prenotifications (recurring_service_id, billing_period_start);
create index debit_prenotifications_status_idx
  on public.debit_prenotifications (status) where status <> 'sent';

create trigger debit_prenotifications_set_updated_at before update on public.debit_prenotifications
  for each row execute function private.set_updated_at();

-- Row level security: the same standard as every other financial table.
-- Active admins only; nothing for anon. The daily job does not run as a
-- visitor, it uses the server-side elevated client.
alter table public.debit_prenotifications enable row level security;
alter table public.debit_prenotifications force row level security;

revoke all on table public.debit_prenotifications from anon, authenticated;
grant select, insert, update on table public.debit_prenotifications to authenticated;

create policy debit_prenotifications_admin_all on public.debit_prenotifications
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
