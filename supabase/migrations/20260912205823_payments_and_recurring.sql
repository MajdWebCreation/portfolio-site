-- Payments and recurring services.
--
-- Three things that are not the same and never share a table:
--
--   invoice            what YM Creations charges, and the document of record
--   payment            money that actually moved
--   recurring service  a periodic service, e.g. website management per month
--
-- Mollie is a provider, not the domain. `payments.source` names where a
-- payment came from and `provider_payment_id` is its id at that provider, so
-- a bank transfer entered by hand later is the same row shape with
-- source = 'manual_bank_transfer' and no provider id. Nothing about Mollie is
-- baked into the payment model itself; the Mollie-specific identifiers on
-- recurring services are prefixed `mollie_` so the boundary stays visible.
--
-- What is deliberately NOT here: any total. A document's total is computed
-- from its lines by `calculateTotals` in lib/money, and that stays the single
-- implementation of that arithmetic -- recomputing VAT rounding in SQL would
-- be a second one that can drift. Settlement therefore compares stored
-- payment amounts against a total the application computes.

-- Documents need a key the payment can point at together with the customer,
-- the same composite-key trick the project links use.
alter table public.invoices
  add constraint invoices_id_customer_unique unique (id, customer_id);

-- ------------------------------------------------- provider customers

/*
  One YM customer is one customer at a provider, however many services they
  buy. Keeping `mollie_customer_id` on each recurring service would make that
  a coincidence rather than a rule -- two services could quietly end up with
  two Mollie customers and two mandates for the same company.

  So the link lives here, once per (customer, provider), and the unique keys
  say it in both directions: a customer has at most one identity at a
  provider, and a provider identity belongs to at most one customer.

  The mandate sits here too. A SEPA mandate authorises collection from a
  customer's account, not from one particular service, so a second service
  reuses the mandate that already exists. If a genuinely service-specific
  mandate is ever needed, that is a column on the service at that point, with
  a reason; there is none today.
*/
create table public.customer_payment_providers (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references public.customers (id) on delete restrict,
  provider             text not null check (provider in ('mollie')),
  provider_customer_id text not null check (length(btrim(provider_customer_id)) > 0),
  provider_mandate_id  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint customer_payment_providers_one_per_customer unique (customer_id, provider),
  constraint customer_payment_providers_one_per_identity unique (provider, provider_customer_id)
);

comment on table public.customer_payment_providers is 'A customer''s identity at a payment provider; at most one per provider.';
comment on column public.customer_payment_providers.provider_mandate_id is 'The mandate to collect from this customer; belongs to the customer, not to one service.';

create index customer_payment_providers_customer_idx on public.customer_payment_providers (customer_id);

-- ---------------------------------------------------------------- recurring

create table public.recurring_services (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers (id) on delete restrict,
  name             text not null check (length(btrim(name)) > 0),
  description      text not null default '',
  amount_cents     integer not null check (amount_cents > 0),
  currency         text not null default 'EUR' check (currency = 'EUR'),
  vat_rate         integer not null default 21 check (vat_rate in (0, 9, 21)),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly')),
  starts_on        date,
  status           text not null default 'draft'
                   check (status in ('draft', 'awaiting_mandate', 'active', 'paused', 'canceled')),

  /* Provider side, kept apart from the domain above. Only what genuinely
     belongs to this service: the subscription. The customer and the mandate
     belong to the customer and live in customer_payment_providers. */
  mollie_subscription_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recurring_services_id_customer_unique unique (id, customer_id)
);

comment on table public.recurring_services is 'Periodic services sold to a customer; one customer may have several.';
comment on column public.recurring_services.mollie_subscription_id is 'Set once, when the subscription is created at the provider.';

-- One Mollie subscription belongs to exactly one recurring service. This is
-- what makes a double activation impossible to persist: a second attempt that
-- creates a second subscription cannot store it.
create unique index recurring_services_subscription_unique
  on public.recurring_services (mollie_subscription_id) where mollie_subscription_id is not null;

create index recurring_services_customer_idx on public.recurring_services (customer_id);
create index recurring_services_status_idx on public.recurring_services (status);

-- An invoice may be the monthly bill for a recurring service, which is what
-- makes `recurring service -> invoice -> payment` traceable without copying
-- anything. Same customer, enforced the same way as the project link.
alter table public.invoices
  add column recurring_service_id uuid,
  add column billing_period_start date,
  add column billing_period_end date,
  add constraint invoices_recurring_same_customer
    foreign key (recurring_service_id, customer_id)
    references public.recurring_services (id, customer_id)
    on delete set null (recurring_service_id),

  /* An invoice that bills a service bills a period, and that period is a
     range. Both stated here so neither can be forgotten by a caller. */
  add constraint invoices_recurring_period_required
    check (recurring_service_id is null or (billing_period_start is not null and billing_period_end is not null)),
  add constraint invoices_billing_period_ordered
    check (billing_period_end is null or billing_period_start is null or billing_period_end >= billing_period_start);

comment on column public.invoices.recurring_service_id is 'The recurring service this invoice bills, when it bills one.';
comment on column public.invoices.billing_period_start is 'First day of the period billed; with recurring_service_id it is the idempotency key.';

/*
  One invoice per service per period, enforced here and not in application
  code. Webhook retries and genuinely concurrent deliveries both end at this
  index: the second writer gets 23505 and reads the invoice the first one
  made, instead of producing a second bill for the same month.
*/
create unique index invoices_recurring_period_unique
  on public.invoices (recurring_service_id, billing_period_start) where recurring_service_id is not null;

create index invoices_recurring_idx
  on public.invoices (recurring_service_id, customer_id) where recurring_service_id is not null;

-- ---------------------------------------------------------------- payments

create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,

  amount_cents integer not null check (amount_cents > 0),
  currency     text not null default 'EUR' check (currency = 'EUR'),
  status       text not null
               check (status in ('open', 'pending', 'paid', 'failed', 'expired', 'canceled')),

  -- Where the money came from. Provider-independent by construction: adding a
  -- source later is one value in this list, not a new table.
  source text not null check (source in ('mollie', 'manual_bank_transfer')),
  /* The id at that provider. A Mollie payment always has one; a payment
     entered by hand has none, which is why the requirement is conditional. */
  provider_payment_id text,
  /* ideal, creditcard, directdebit, ... as reported by the provider. Free
     text on purpose: a provider adding a method must not break an insert. */
  method  text,
  paid_at timestamptz,

  description text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- The invoice and the customer on a payment are the same customer.
  constraint payments_invoice_same_customer
    foreign key (invoice_id, customer_id) references public.invoices (id, customer_id),

  constraint payments_provider_id_required
    check (source <> 'mollie' or provider_payment_id is not null),

  -- "paid" is the only status that means money arrived, so it is the only one
  -- that may carry a payment date, and it must carry one.
  constraint payments_paid_at_matches_status
    check ((status = 'paid') = (paid_at is not null))
);

comment on table public.payments is 'Money that actually moved, per invoice. Provider-independent.';

/*
  The idempotency key of the whole webhook design: one payment row per
  provider payment. A retried webhook updates that row; it cannot insert a
  second one, whatever the application does.
*/
create unique index payments_provider_unique
  on public.payments (source, provider_payment_id) where provider_payment_id is not null;

create index payments_invoice_idx on public.payments (invoice_id, customer_id);
create index payments_customer_idx on public.payments (customer_id);
create index payments_status_idx on public.payments (status);

-- ------------------------------------------------- recurring activations

/*
  The link a customer opens to set up direct debit. The token itself is never
  stored: only its SHA-256 hash, so a leaked table row cannot be replayed as a
  link. Single use and time limited, and the first Mollie payment that
  establishes the mandate is recorded here so a reopened link resumes the
  attempt that already exists instead of starting a second one.
*/
create table public.recurring_activations (
  id                   uuid primary key default gen_random_uuid(),
  recurring_service_id uuid not null references public.recurring_services (id) on delete cascade,
  token_hash           text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at           timestamptz not null,
  used_at              timestamptz,
  mollie_payment_id    text,
  created_at           timestamptz not null default now()
);

comment on table public.recurring_activations is 'Single-use, expiring links for setting up direct debit on a recurring service.';
comment on column public.recurring_activations.token_hash is 'SHA-256 of the token; the token itself exists only in the link.';

create unique index recurring_activations_payment_unique
  on public.recurring_activations (mollie_payment_id) where mollie_payment_id is not null;

-- At most one activation attempt outstanding per service: a second "send
-- link" reuses or replaces the open one rather than opening a parallel route
-- to a second mandate.
create unique index recurring_activations_open_unique
  on public.recurring_activations (recurring_service_id) where used_at is null;

create index recurring_activations_service_idx on public.recurring_activations (recurring_service_id);

-- ---------------------------------------------------------------- upkeep

create trigger customer_payment_providers_set_updated_at before update on public.customer_payment_providers
  for each row execute function private.set_updated_at();
create trigger recurring_services_set_updated_at before update on public.recurring_services
  for each row execute function private.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------------------- RLS
--
-- Same standard as every other business table: active admins only, nothing
-- for anon. The webhook and the activation route do not run as a visitor;
-- they use a server-side privileged client, so `anon` needs no access here
-- and gets none. No delete right is handed out: financial history is not
-- something the application removes.

alter table public.customer_payment_providers enable row level security;
alter table public.customer_payment_providers force row level security;
alter table public.recurring_services enable row level security;
alter table public.recurring_services force row level security;
alter table public.payments enable row level security;
alter table public.payments force row level security;
alter table public.recurring_activations enable row level security;
alter table public.recurring_activations force row level security;

revoke all on table public.customer_payment_providers from anon, authenticated;
revoke all on table public.recurring_services from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.recurring_activations from anon, authenticated;

grant select, insert, update on table public.customer_payment_providers to authenticated;
grant select, insert, update on table public.recurring_services to authenticated;
grant select, insert, update on table public.payments to authenticated;
grant select, insert, update on table public.recurring_activations to authenticated;

create policy customer_payment_providers_admin_all on public.customer_payment_providers
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy recurring_services_admin_all on public.recurring_services
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy payments_admin_all on public.payments
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy recurring_activations_admin_all on public.recurring_activations
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
