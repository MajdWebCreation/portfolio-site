-- Outbound customer communication.
--
-- One row per message that actually left the building. Not a plan, not a
-- queue and not a second copy of the documents: the quote, the invoice and
-- the mandate keep their own tables and their own truth. This is the record
-- that a customer was told something, in the words they were told it in.
--
-- Every row is an event. Sending the same invoice twice is two rows, because
-- the customer really did receive two mails; nothing here is ever updated to
-- "the latest send". That is why the table has no updated_at and no update
-- grant -- it is append-only by construction, not by convention.
--
-- Written only after the provider accepted the message. A send that failed
-- leaves nothing behind, so a filled table can be read as "this went out"
-- without qualification. The failure is reported to the admin where it
-- happened, and for a pre-notification it is already kept on
-- debit_prenotifications.error.
--
-- The body is stored as it was sent. A later change to a template, a price or
-- an address does not rewrite what the customer has in their inbox.

/*
  The key the quote link below needs.

  `quotes (id, customer_id)` existed once. It went in 20260912201703 together
  with the one-quote-per-project link, which was the only reference using it;
  the invoice's own quote link is keyed on (id, project_id) instead. A
  communication belongs to a customer, not to a project, so it needs the pair
  that names the customer. `id` is already the primary key, so this adds a
  guarantee, not a restriction.
*/
alter table public.quotes
  add constraint quotes_id_customer_unique unique (id, customer_id);

create table public.customer_communications (
  id uuid primary key default gen_random_uuid(),

  -- Restricted, like every other record that hangs off a customer: a customer
  -- carrying history cannot quietly disappear from under it.
  customer_id uuid not null references public.customers (id) on delete restrict,

  /* One channel and one direction for now, and both are checked rather than
     assumed. A second channel is a widened check plus the code that fills it,
     which is a smaller change than discovering that half the rows meant
     something else. */
  channel   text not null default 'email'    check (channel = 'email'),
  direction text not null default 'outbound' check (direction = 'outbound'),

  -- What kind of mail this was. Mirrors CommunicationCategory in
  -- lib/admin/communications/types.ts; the two lists are one list.
  category text not null check (category in (
    'quote_sent',
    'invoice_sent',
    'invoice_activation_sent',
    'recurring_invoice_prenotification',
    'recurring_invoice_settled',
    'direct_debit_activation'
  )),

  -- The address it went to, as it was at the time. A later change of e-mail
  -- address does not rewrite where we delivered.
  recipient text not null check (length(btrim(recipient)) > 0),
  subject   text not null check (length(btrim(subject)) > 0),
  body_text text not null,
  /* The HTML as sent. Kept so the admin can see the mail the customer saw;
     it is rendered in a sandboxed frame, never into the admin's own page. */
  body_html text,

  /* Only what the provider actually tells us at send time. Resend reports
     acceptance or refusal and nothing further, so there is no delivered,
     opened or clicked here -- those would be states nobody measures. */
  status text not null default 'sent' check (status in ('sent', 'failed')),
  /* Resend's own id for the message, for tracing a single mail back. */
  provider_message_id text,
  /* Why it failed, for the admin. Never a customer's personal data. */
  error text,

  /* What the mail was about, when it was about something with its own
     record. The references are the composite ones below -- a plain one would
     add nothing, since a pair that has to match (id, customer_id) already has
     to exist. */
  invoice_id           uuid,
  quote_id             uuid,
  project_id           uuid,
  recurring_service_id uuid,

  sent_at    timestamptz,
  created_at timestamptz not null default now(),

  /*
    A communication of customer A can never point at the document of customer
    B. Stated to the database rather than to the code that inserts, because
    the code that inserts is not the only way in. MATCH SIMPLE means a null
    link satisfies these outright, which is what makes them optional.

    The delete action names the one column it may clear, so customer_id --
    NOT NULL, and the row's whole reason to exist -- is never part of it.
    Removing a document therefore clears the link and nothing else: the log
    keeps saying what was sent and to whom, which is the point of it. Same
    form as quotes_project_same_customer.
  */
  constraint customer_communications_invoice_same_customer
    foreign key (invoice_id, customer_id) references public.invoices (id, customer_id)
    on delete set null (invoice_id),
  constraint customer_communications_quote_same_customer
    foreign key (quote_id, customer_id) references public.quotes (id, customer_id)
    on delete set null (quote_id),
  constraint customer_communications_project_same_customer
    foreign key (project_id, customer_id) references public.projects (id, customer_id)
    on delete set null (project_id),
  constraint customer_communications_service_same_customer
    foreign key (recurring_service_id, customer_id) references public.recurring_services (id, customer_id)
    on delete set null (recurring_service_id),

  -- "sent" is the only status that means a mail went out, so it is the only
  -- one that may carry a send time, and it must carry one.
  constraint customer_communications_sent_at_matches_status
    check ((status = 'sent') = (sent_at is not null)),
  constraint customer_communications_error_only_when_failed
    check (error is null or status = 'failed')
);

comment on table public.customer_communications is
  'Append-only log of e-mail this system sent to a customer; one row per send.';
comment on column public.customer_communications.category is
  'Which mail flow produced this; mirrors CommunicationCategory in lib/admin/communications/types.ts.';
comment on column public.customer_communications.body_html is
  'The HTML as sent. Rendered in a sandboxed frame in the admin, never inlined.';

-- The one query the customer page makes: this customer, newest first.
create index customer_communications_customer_idx
  on public.customer_communications (customer_id, sent_at desc);

-- Customer second, matching the composite references above: Postgres uses
-- these when a document is deleted and its link has to be cleared.
create index customer_communications_invoice_idx
  on public.customer_communications (invoice_id, customer_id) where invoice_id is not null;
create index customer_communications_quote_idx
  on public.customer_communications (quote_id, customer_id) where quote_id is not null;
create index customer_communications_project_idx
  on public.customer_communications (project_id, customer_id) where project_id is not null;
create index customer_communications_service_idx
  on public.customer_communications (recurring_service_id, customer_id) where recurring_service_id is not null;

-- Row level security: the same standard as every other customer table. Active
-- admins only, nothing for anon, and no public exposure of any kind. The
-- webhook and the daily job carry no session; they write through the
-- server-side elevated client, as they already do elsewhere.
alter table public.customer_communications enable row level security;
alter table public.customer_communications force row level security;

revoke all on table public.customer_communications from anon, authenticated;
-- Read and append. Deliberately no update and no delete: a sent mail is a
-- fact, and a log you can edit is not a log.
grant select, insert on table public.customer_communications to authenticated;

create policy customer_communications_admin_all on public.customer_communications
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
