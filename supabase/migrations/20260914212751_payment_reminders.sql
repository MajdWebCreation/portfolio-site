-- Betalingsopvolging: reminders on an invoice that stayed open.
--
-- Invoice-driven on purpose. Whether a customer gets chased follows from the
-- invoice -- its due date, its status and what has been paid against it --
-- and never from how the money was supposed to arrive. A direct debit that
-- bounced and a bank transfer that never came are the same situation to a
-- customer with an unpaid invoice, so they walk the same path. There is no
-- second reminder engine for SEPA, and no second invoice status system.
--
-- Two tables, with two different jobs, and neither one repeats what the
-- invoices and payments already say:
--
--   invoice_collection_events   what the automation did. One row per stage
--                               per invoice, and the unique index is what
--                               makes the daily job safe to run twice.
--
--   invoice_collections         what a human decided. Paused, disputed, a
--                               payment plan, handed over. None of that can
--                               be derived from anything, so it is stored --
--                               and nothing else here is.
--
-- What is deliberately NOT stored: how far along an invoice is, and whether
-- it is ready for collection. Both follow from the events plus the invoice's
-- own due date and settlement, so storing them would be a second truth that
-- drifts the moment a customer pays on day 25. Same reasoning as
-- customer_status.ts and prenotification.ts, which derive rather than keep.
--
-- Money: nothing in this migration charges anything. The EUR 20 mentioned in
-- the day-7 mail is copy and only copy -- it is not a line, not a payment,
-- not a balance, and there is no column here that could hold it.

/*
  Three more things this system can mail a customer. The check constraint and
  CommunicationCategory in lib/admin/communications/types.ts are one list, so
  widening one means widening the other.
*/
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
    'payment_final_notice'
  ));

create table public.invoice_collection_events (
  id uuid primary key default gen_random_uuid(),

  invoice_id  uuid not null,
  customer_id uuid not null,

  /*
    Which step of the ladder this is. Only steps that send a mail appear here:
    "ready for collection" is a conclusion drawn from the final notice plus
    the calendar, not an event anybody performs.
  */
  stage text not null check (stage in ('first_reminder', 'second_reminder', 'final_notice')),

  -- The day this stage became due, counted from the invoice's own due date.
  -- Kept so a later look at the row explains itself without recomputing.
  eligible_on  date not null,
  days_overdue integer not null check (days_overdue >= 0),

  -- Who it went to and what it said, as it was at the time.
  recipient text not null check (length(btrim(recipient)) > 0),
  subject   text not null check (length(btrim(subject)) > 0),

  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  /* Resend's id for the message, when it accepted one. */
  provider_message_id text,
  /* The customer communication this send produced, so the two agree. */
  communication_id uuid references public.customer_communications (id) on delete set null,
  /* Why it failed, for the admin. Never a customer's personal data. */
  error text,

  claimed_at timestamptz not null default now(),
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The invoice being chased and the customer being chased are one customer.
  constraint invoice_collection_events_invoice_same_customer
    foreign key (invoice_id, customer_id) references public.invoices (id, customer_id),

  constraint invoice_collection_events_sent_at_matches_status
    check ((status = 'sent') = (sent_at is not null)),
  constraint invoice_collection_events_error_only_when_failed
    check (error is null or status = 'failed')
);

comment on table public.invoice_collection_events is
  'One row per reminder stage per invoice; the unique index is what makes the daily run idempotent.';
comment on column public.invoice_collection_events.stage is
  'first_reminder (day 1), second_reminder (day 7), final_notice (day 14). Mirrors ReminderStage in lib/payments/collection-policy.ts.';
comment on column public.invoice_collection_events.communication_id is
  'The customer_communications row this send produced, when the log accepted one.';

/*
  One stage, one row, one successful send.

  A run that crashed between claiming and sending leaves the row `pending`;
  the next run recognises a stale claim and retries that same row. A run that
  failed at the provider leaves it `failed` and tomorrow retries it. Neither
  ever inserts a second row, because this index will not have it -- which is
  what lets the cron run twice, or twice at once, without mailing twice.
*/
create unique index invoice_collection_events_stage_unique
  on public.invoice_collection_events (invoice_id, stage);

/* Covers the composite reference, and the per-invoice read the admin does. */
create index invoice_collection_events_invoice_idx
  on public.invoice_collection_events (invoice_id, customer_id);

/* The daily job's own lookup: what is still waiting or went wrong. */
create index invoice_collection_events_unfinished_idx
  on public.invoice_collection_events (status) where status <> 'sent';

create trigger invoice_collection_events_set_updated_at before update on public.invoice_collection_events
  for each row execute function private.set_updated_at();

/*
  What a human decided about chasing this invoice.

  One row per invoice -- the primary key says so -- and no row at all for the
  overwhelming majority, which are simply `active`. Deliberately without a
  customer_id: a hold is about an invoice, and a column that repeats who the
  invoice belongs to is a column that can disagree with it.
*/
create table public.invoice_collections (
  invoice_id uuid primary key references public.invoices (id) on delete cascade,

  state text not null default 'active'
        check (state in ('active', 'paused', 'disputed', 'payment_plan', 'handed_over')),
  /* Why, in the admin's own words. Shown only in the admin, never mailed. */
  note text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.invoice_collections is
  'Per-invoice human decision about payment chasing; absent means active. Mirrors CollectionState in lib/payments/collection-state.ts.';
comment on column public.invoice_collections.state is
  'active chases; paused, disputed, payment_plan and handed_over all stop the automation.';

create trigger invoice_collections_set_updated_at before update on public.invoice_collections
  for each row execute function private.set_updated_at();

-- Row level security: the same standard as every other financial table.
-- Active admins only, nothing for anon. The daily job carries no session and
-- writes through the server-side elevated client, as it already does.
alter table public.invoice_collection_events enable row level security;
alter table public.invoice_collection_events force row level security;
alter table public.invoice_collections enable row level security;
alter table public.invoice_collections force row level security;

revoke all on table public.invoice_collection_events from anon, authenticated;
revoke all on table public.invoice_collections from anon, authenticated;

/* Events are a log: read and append, never edited by an admin. The daily job
   updates its own claims through the elevated client. */
grant select, insert on table public.invoice_collection_events to authenticated;
/* A hold is a decision an admin makes and changes, so this one they may write. */
grant select, insert, update, delete on table public.invoice_collections to authenticated;

create policy invoice_collection_events_admin_all on public.invoice_collection_events
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy invoice_collections_admin_all on public.invoice_collections
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
