-- The payment link an invoice mail hands out.
--
-- A Mollie payment link is a URL that stays valid until it is paid, which is
-- what a mail needs: the checkout URL of a Payments-API payment is
-- short-lived, so a customer who opens the mail a week later would find a
-- dead button. The link also carries the sequence -- `oneoff`, or `first`
-- when paying it has to establish a direct debit mandate as well.
--
-- Why a table rather than a column: the Payment Links API has no metadata
-- field, so nothing on Mollie's side can say which invoice a link belongs to.
-- That mapping is ours to keep, and it has to survive a webhook arriving
-- hours later. It is deliberately not on `invoices`: an issued invoice is
-- immutable, and replacing a spent link must not mean touching the document.
--
-- One row per invoice, updated in place: re-sending an invoice reuses the
-- link that is still payable, and only a link that is paid, expired or of the
-- wrong sequence is replaced. That is the whole idempotency story, and it is
-- the unique index that enforces it rather than application code.

create table public.invoice_payment_links (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null,
  customer_id uuid not null references public.customers (id) on delete restrict,

  provider text not null default 'mollie' check (provider in ('mollie')),
  /* Mollie's own id for the link, `pl_...`. Not a secret, but not a URL. */
  provider_payment_link_id text not null check (length(btrim(provider_payment_link_id)) > 0),
  /* The URL the customer opens. Mollie's, never constructed here. */
  checkout_url text not null check (checkout_url ~ '^https://'),
  /* Which question the link asks: just pay, or pay and authorise. */
  sequence_type text not null check (sequence_type in ('oneoff', 'first')),
  /* The gross amount the link asks for, so a partial payment can be spotted
     without asking Mollie. */
  amount_cents integer not null check (amount_cents > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The invoice and the customer on a link are the same customer, the same
  -- composite-key trick the rest of this schema uses. Cascade rather than
  -- restrict: a link is a way to pay, not financial history.
  constraint invoice_payment_links_invoice_same_customer
    foreign key (invoice_id, customer_id) references public.invoices (id, customer_id) on delete cascade
);

comment on table public.invoice_payment_links is 'The Mollie payment link handed out for an invoice; at most one per invoice.';
comment on column public.invoice_payment_links.provider_payment_link_id is 'Mollie''s pl_... id, used to resolve a webhook back to this invoice.';
comment on column public.invoice_payment_links.sequence_type is '"first" when paying this link also establishes the direct debit mandate.';

/*
  One link per invoice. Unique on the pair rather than on invoice_id alone,
  which comes to the same thing -- the composite foreign key above forces
  customer_id to be that invoice's customer -- while also covering that
  foreign key, so one index does both jobs.
*/
create unique index invoice_payment_links_invoice_idx
  on public.invoice_payment_links (invoice_id, customer_id);

/* A link belongs to one invoice, and this is the index the webhook uses to
   get from Mollie's pl_... back to the invoice. */
create unique index invoice_payment_links_provider_idx
  on public.invoice_payment_links (provider, provider_payment_link_id);

create index invoice_payment_links_customer_idx on public.invoice_payment_links (customer_id);

create trigger invoice_payment_links_set_updated_at before update on public.invoice_payment_links
  for each row execute function private.set_updated_at();

-- RLS: same standard as every other financial table. Active admins only,
-- nothing for anon. The webhook uses the server-side privileged client. No
-- delete right for the application; a link disappears with its invoice.
alter table public.invoice_payment_links enable row level security;
alter table public.invoice_payment_links force row level security;

revoke all on table public.invoice_payment_links from anon, authenticated;
grant select, insert, update on table public.invoice_payment_links to authenticated;

create policy invoice_payment_links_admin_all on public.invoice_payment_links
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
