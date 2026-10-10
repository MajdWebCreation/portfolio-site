-- Changing and ending a monthly service.
--
-- Two things an admin could not do before: change what a collecting service
-- costs per month, and stop it. Both touch the same three records that have
-- to keep agreeing -- our service row, the term invoices, and the subscription
-- at Mollie -- and both are driven by dates on the service's own calendar
-- (`starts_on` plus the periods already invoiced), never by a second one.
--
-- Nothing here changes how a period is billed or announced. A price change
-- says which amount a period costs; an end date says after which period
-- nothing is billed at all. The daily job carries both out at the one
-- moment that is safe at the provider: on the announcement day of the first
-- collection that must differ, fourteen days ahead, when the previous
-- collection at the old amount is long final and the next one has not been
-- created yet.

-- ------------------------------------------------------------ price changes

/*
  One row per change, kept for good: the price history of a service is the
  list of its applied changes, and the amount any period costs follows from
  it without a second column. `old_amount_cents` is written so the row is
  readable on its own and so the very first change still says what came
  before it.

  Three moments, in order, each its own column because each can fail on its
  own and be retried the next day:

    requested_at         the admin confirmed it;
    provider_updated_at  Mollie holds the new amount for future payments.
                         Done on the announcement day of the first period at
                         the new price, before that period's invoice exists;
    applied_at           `recurring_services.amount_cents` was switched over,
                         on the effective date, so that column keeps meaning
                         "the price in effect today".

  A change that never happens is closed with `canceled_at`: withdrawn by the
  admin before Mollie was touched, or lapsed because the service was ended
  before the change would have started.
*/
create table public.recurring_price_changes (
  id                   uuid primary key default gen_random_uuid(),
  recurring_service_id uuid not null,
  customer_id          uuid not null references public.customers (id) on delete restrict,

  old_amount_cents integer not null check (old_amount_cents > 0),
  new_amount_cents integer not null check (new_amount_cents > 0),
  currency         text not null default 'EUR' check (currency = 'EUR'),
  /* Always the first day of a billing period; the code checks that, the
     database only knows it is a date. */
  effective_from   date not null,

  requested_at        timestamptz not null default now(),
  /* auth.uid() of the admin who confirmed it; null for a system job. */
  requested_by        uuid,
  provider_updated_at timestamptz,
  applied_at          timestamptz,
  canceled_at         timestamptz,
  canceled_reason     text check (canceled_reason in ('withdrawn', 'service_ended')),

  /*
    Mollie is asked for the subscription's payments before it is patched. A
    payment that already exists for the first period at the new amount was
    created at the old one, and that period then keeps the old amount: the
    change moves on to the next period, and says here where it came from.
    When no later period is possible, the change is blocked instead and the
    amount it names never applies anywhere, until an admin withdraws it.
  */
  rescheduled_from date,
  reschedule_reason text,
  blocked_at        timestamptz,
  blocked_reason    text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The service and the customer on a change are the same customer.
  constraint recurring_price_changes_same_customer
    foreign key (recurring_service_id, customer_id)
    references public.recurring_services (id, customer_id) on delete cascade,

  constraint recurring_price_changes_amount_differs
    check (new_amount_cents <> old_amount_cents),
  -- Applied presupposes Mollie was updated; a change is either carried out
  -- or closed, never both.
  constraint recurring_price_changes_applied_after_provider
    check (applied_at is null or provider_updated_at is not null),
  constraint recurring_price_changes_not_applied_and_canceled
    check (applied_at is null or canceled_at is null),
  constraint recurring_price_changes_canceled_has_reason
    check ((canceled_at is null) = (canceled_reason is null)),
  constraint recurring_price_changes_rescheduled_has_reason
    check ((rescheduled_from is null) = (reschedule_reason is null)),
  constraint recurring_price_changes_blocked_has_reason
    check ((blocked_at is null) = (blocked_reason is null))
);

comment on table public.recurring_price_changes is
  'Price history of a recurring service; the amount a period costs follows from the changes effective by its start.';
comment on column public.recurring_price_changes.effective_from is
  'First day of the first billing period at the new amount; always a period start on the service''s calendar.';
comment on column public.recurring_price_changes.provider_updated_at is
  'When Mollie was given the new amount; fourteen days before the first collection at that amount.';
comment on column public.recurring_price_changes.applied_at is
  'When recurring_services.amount_cents was switched to the new amount, on or after effective_from.';

/*
  At most one change in flight per service. A double click, or two admins at
  once, end here: the second insert gets 23505 and the code hands back the
  change that already exists. A new change can only be planned once the
  current one is applied or closed.
*/
create unique index recurring_price_changes_pending_unique
  on public.recurring_price_changes (recurring_service_id)
  where applied_at is null and canceled_at is null;

/* Covers the composite reference and the per-service history read. */
create index recurring_price_changes_service_idx
  on public.recurring_price_changes (recurring_service_id, customer_id, effective_from);
create index recurring_price_changes_customer_idx
  on public.recurring_price_changes (customer_id);

create trigger recurring_price_changes_set_updated_at before update on public.recurring_price_changes
  for each row execute function private.set_updated_at();

alter table public.recurring_price_changes enable row level security;
alter table public.recurring_price_changes force row level security;

revoke all on table public.recurring_price_changes from anon, authenticated;
-- No delete: a price change, carried out or withdrawn, is history.
grant select, insert, update on table public.recurring_price_changes to authenticated;

create policy recurring_price_changes_admin_all on public.recurring_price_changes
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- ------------------------------------------------------------- cancellation

/*
  Ending a service is three dates on the service itself; there is nothing to
  list, so there is no table.

    cancellation_requested_at   the admin confirmed the cancellation;
    ends_on                     the last day the service runs: the end of the
                                last billing period that is still collected.
                                Nothing is billed, announced or collected for
                                a period that starts after it;
    subscription_canceled_at    the subscription at Mollie was cancelled, or
                                found cancelled. Done by the daily job on the
                                announcement day of the first collection that
                                must not happen, so the last legitimate one has
                                long been created.

  The status column stays the lifecycle: a service with an end date in the
  future is still `active` (it collects), and becomes `canceled` once the end
  date has passed. Which of the three the screens show follows from the
  dates, not from a fourth column.

  The last day is exactly one month after the request (the general terms:
  one month's notice), so the last billing period is usually a partial one.
  It is billed pro rata by days, and the subscription at Mollie has to
  collect that same pro-rata amount:

    last_term_amount_cents   the net amount the last period is billed and
                             collected at, fixed the moment Mollie was
                             checked: pro rata when Mollie had not created
                             that period's payment yet, the full amount when
                             it had (then the difference is credited by hand);
    last_term_synced_at      when Mollie was checked and, if needed, patched.

  lifecycle_problem is what the daily job could not resolve on its own and
  an admin has to look at: a payment Mollie created past the end that it
  will not let us cancel, for instance. Cleared when the job succeeds.

  When the full last term was announced or collected before the end was
  known, the days not delivered are owed back. The system makes no credit
  note and no refund; it only keeps the amount in view until an admin says
  it was done, which is what credit_settled_at records.
*/
alter table public.recurring_services
  add column cancellation_requested_at timestamptz,
  add column cancellation_requested_by uuid,
  add column ends_on date,
  add column last_term_amount_cents integer check (last_term_amount_cents >= 0),
  add column last_term_synced_at timestamptz,
  add column subscription_canceled_at timestamptz,
  add column lifecycle_problem text,
  add column credit_settled_at timestamptz,
  add column credit_settled_by uuid,
  add constraint recurring_services_cancellation_complete
    check ((cancellation_requested_at is null) = (ends_on is null)),
  add constraint recurring_services_ends_after_start
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  add constraint recurring_services_last_term_complete
    check ((last_term_amount_cents is null) = (last_term_synced_at is null));

comment on column public.recurring_services.ends_on is
  'Last day the service runs; the end of the last billed period. Null while nothing is planned.';
comment on column public.recurring_services.subscription_canceled_at is
  'When the Mollie subscription was cancelled, by the daily job after the last legitimate collection.';
comment on column public.recurring_services.last_term_amount_cents is
  'Net amount of the partial last period, as Mollie will collect it; fixed when Mollie was checked.';
comment on column public.recurring_services.lifecycle_problem is
  'What the daily job could not resolve for this service; shown to the admin until it is.';
comment on column public.recurring_services.credit_settled_at is
  'When an admin recorded that the credit for the undelivered days of the last term was made and refunded, by hand.';

-- The daily job looks for services whose end is planned but not yet carried out.
create index recurring_services_ending_idx
  on public.recurring_services (ends_on) where ends_on is not null;

-- ------------------------------------------------- confirmation mails

-- Both changes are confirmed to the customer in writing, through the same
-- log as every other customer mail. Mirrors CommunicationCategory in
-- lib/admin/communications/types.ts; the two lists are one list.
alter table public.customer_communications
  drop constraint customer_communications_category_check;

alter table public.customer_communications
  add constraint customer_communications_category_check check (category in (
    'quote_sent',
    'invoice_sent',
    'invoice_activation_sent',
    'recurring_invoice_prenotification',
    'recurring_invoice_settled',
    'direct_debit_activation',
    'payment_reminder_first',
    'payment_reminder_second',
    'payment_final_notice',
    'recurring_price_change',
    'recurring_cancellation'
  ));
