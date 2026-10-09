/*
  Activating direct debit, apart from any invoice.

  A customer authorises collection through a separate Mollie payment link of
  EUR 0.01 with `sequenceType: first`. That payment exists only to produce a
  mandate. It is not an invoice payment: it never settles, reopens or touches
  an invoice, which is why it has its own table rather than a row in
  `payments` (money against an invoice) or `invoice_payment_links` (the link
  an invoice is paid through).

  One row per link handed out. What the activation's state is follows from
  the columns -- open, paid, replaced -- so there is no status column that
  could disagree with them. The mandate columns are a cache of what Mollie
  last said; Mollie stays the source of truth and is asked again whenever a
  decision depends on it.
*/
create table public.mandate_activations (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  provider    text not null default 'mollie' check (provider in ('mollie')),
  /* The Mollie customer the mandate attaches to; the link was made for it. */
  provider_customer_id text not null check (length(btrim(provider_customer_id)) > 0),
  /* Mollie's pl_... id, and the URL the customer opens. Never constructed here. */
  provider_payment_link_id text not null check (length(btrim(provider_payment_link_id)) > 0),
  checkout_url text not null check (checkout_url ~ '^https://'),
  amount_cents integer not null check (amount_cents > 0),
  /* The tr_... payment that paid the link, once one did. */
  provider_payment_id text,
  paid_at     timestamptz,
  /* Closed at Mollie because it was replaced or could no longer be paid. */
  archived_at timestamptz,
  /* Mollie's answer about the customer's mandate, as last asked. */
  mandate_id         text,
  mandate_status     text check (mandate_status in ('none', 'pending', 'valid', 'invalid')),
  mandate_checked_at timestamptz,
  /* The first moment Mollie called the mandate valid. */
  validated_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint mandate_activations_paid_has_payment
    check ((paid_at is null) = (provider_payment_id is null)),
  constraint mandate_activations_validated_needs_mandate
    check (validated_at is null or mandate_id is not null)
);

comment on table public.mandate_activations is
  'EUR 0.01 first-payment links that only establish a direct debit mandate; never an invoice payment.';
comment on column public.mandate_activations.mandate_status is
  'Cache of Mollie''s mandate state at mandate_checked_at; Mollie is asked again before acting on it.';

/* The webhook resolves Mollie's pl_... and tr_... ids back to a row. */
create unique index mandate_activations_link_unique
  on public.mandate_activations (provider, provider_payment_link_id);
create unique index mandate_activations_payment_unique
  on public.mandate_activations (provider, provider_payment_id) where provider_payment_id is not null;

/*
  At most one payable activation per customer. Two clicks, or two admins at
  once, end here: the second insert gets 23505 and the code hands out the
  link that already exists.
*/
create unique index mandate_activations_open_unique
  on public.mandate_activations (customer_id) where paid_at is null and archived_at is null;
create index mandate_activations_customer_idx on public.mandate_activations (customer_id, created_at desc);

create trigger mandate_activations_set_updated_at before update on public.mandate_activations
  for each row execute function private.set_updated_at();

alter table public.mandate_activations enable row level security;
alter table public.mandate_activations force row level security;
revoke all on table public.mandate_activations from anon, authenticated;
grant select, insert, update on table public.mandate_activations to authenticated;
create policy mandate_activations_admin_all on public.mandate_activations
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
