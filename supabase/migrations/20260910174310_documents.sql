-- Quotes and invoices, with their lines.
--
-- Mirrors lib/admin/{documents,quotes,invoices}/types.ts. Quotes and invoices
-- are not the same object and do not share a table; what they share is the
-- customer snapshot and the line shape.
--
-- The snapshot columns copy what the document needs at issue time, so a later
-- edit to the customer never changes an issued document. customer_id stays a
-- real reference, restricted on delete: a customer that carries documents
-- cannot silently disappear from under them.
--
-- Money is integer cents and quantities are hundredths, matching lib/money;
-- totals are never stored, they are computed from the lines by calculateTotals
-- so there is one implementation of that arithmetic.

create table public.quotes (
  id                     uuid primary key default gen_random_uuid(),
  number_value           text not null,
  number_provisional     boolean not null default true,
  status                 text not null default 'draft'
                         check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired')),

  customer_id            uuid not null references public.customers (id) on delete restrict,
  customer_company_name  text not null,
  customer_contact_name  text not null,
  customer_email         text not null,
  customer_street        text not null,
  customer_postal_code   text not null,
  customer_city          text not null,
  customer_country       text not null,
  customer_kvk_number    text,
  customer_vat_number    text,

  issue_date             date not null,
  valid_until            date not null,
  subject                text not null default '',
  intro                  text not null default '',
  notes                  text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint quotes_valid_until_after_issue check (valid_until >= issue_date)
);

comment on table public.quotes is 'Quotes; customer_* columns are the snapshot taken when the document was made.';

create index quotes_customer_idx on public.quotes (customer_id);
create index quotes_updated_at_idx on public.quotes (updated_at desc);

create table public.quote_lines (
  id                  uuid primary key default gen_random_uuid(),
  quote_id            uuid not null references public.quotes (id) on delete cascade,
  position            integer not null check (position >= 0),
  description         text not null,
  quantity_hundredths integer not null check (quantity_hundredths > 0),
  unit_price_cents    integer not null check (unit_price_cents >= 0),
  vat_rate            integer not null check (vat_rate in (0, 9, 21)),

  constraint quote_lines_position_unique unique (quote_id, position) deferrable initially deferred
);

comment on column public.quote_lines.quantity_hundredths is 'Quantity in hundredths (100 = 1), as in lib/money.';

create index quote_lines_quote_idx on public.quote_lines (quote_id, position);

create table public.invoices (
  id                     uuid primary key default gen_random_uuid(),
  number_value           text not null,
  number_provisional     boolean not null default true,
  status                 text not null default 'draft'
                         check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),

  customer_id            uuid not null references public.customers (id) on delete restrict,
  customer_company_name  text not null,
  customer_contact_name  text not null,
  customer_email         text not null,
  customer_street        text not null,
  customer_postal_code   text not null,
  customer_city          text not null,
  customer_country       text not null,
  customer_kvk_number    text,
  customer_vat_number    text,

  issue_date             date not null,
  due_date               date not null,
  payment_reference      text not null default '',
  notes                  text not null default '',
  -- The quote this invoice follows from, when known.
  quote_id               uuid references public.quotes (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint invoices_due_after_issue check (due_date >= issue_date)
);

comment on table public.invoices is 'Invoices; customer_* columns are the snapshot taken when the document was made.';

create index invoices_customer_idx on public.invoices (customer_id);
create index invoices_updated_at_idx on public.invoices (updated_at desc);
create index invoices_quote_idx on public.invoices (quote_id) where quote_id is not null;

create table public.invoice_lines (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references public.invoices (id) on delete cascade,
  position            integer not null check (position >= 0),
  description         text not null,
  quantity_hundredths integer not null check (quantity_hundredths > 0),
  unit_price_cents    integer not null check (unit_price_cents >= 0),
  vat_rate            integer not null check (vat_rate in (0, 9, 21)),

  constraint invoice_lines_position_unique unique (invoice_id, position) deferrable initially deferred
);

create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id, position);

create trigger quotes_set_updated_at before update on public.quotes
  for each row execute function private.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function private.set_updated_at();

alter table public.quotes enable row level security;
alter table public.quotes force row level security;
alter table public.quote_lines enable row level security;
alter table public.quote_lines force row level security;
alter table public.invoices enable row level security;
alter table public.invoices force row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_lines force row level security;

revoke all on table public.quotes from anon, authenticated;
revoke all on table public.quote_lines from anon, authenticated;
revoke all on table public.invoices from anon, authenticated;
revoke all on table public.invoice_lines from anon, authenticated;

grant select, insert, update, delete on table public.quotes to authenticated;
grant select, insert, update, delete on table public.quote_lines to authenticated;
grant select, insert, update, delete on table public.invoices to authenticated;
grant select, insert, update, delete on table public.invoice_lines to authenticated;

create policy quotes_admin_all on public.quotes
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy quote_lines_admin_all on public.quote_lines
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy invoices_admin_all on public.invoices
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy invoice_lines_admin_all on public.invoice_lines
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
