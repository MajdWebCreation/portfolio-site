-- Business core: inquiries, leads, customers.
--
-- Columns and machine values follow the existing TypeScript models
-- (lib/admin/{inquiries,leads,customers}/types.ts) exactly; this is the same
-- model persisted, not a second one. Every check constraint below lists the
-- same strings as the corresponding `*Order` array in TypeScript.
--
-- Access: business data is for active admins only. Every table gets RLS with
-- FORCE, so even the table owner is subject to the policy, and the only role
-- that can read or write is `authenticated` while private.is_admin() holds.

-- Website requests. Two origins with different shapes: the contact form, and
-- the project planner, which adds a phone number and the structured payload
-- exactly as the public form posted it.
create table public.inquiries (
  id            uuid primary key default gen_random_uuid(),
  origin        text not null check (origin in ('contact', 'project_planner')),
  status        text not null default 'new'
                check (status in ('new', 'viewed', 'follow_up', 'qualified', 'completed', 'rejected')),
  received_at   timestamptz not null default now(),
  locale        text not null check (locale in ('nl', 'en')),
  name          text not null check (length(btrim(name)) > 0),
  email         text not null check (length(btrim(email)) > 0),
  company       text,
  message       text not null,
  internal_note text,
  phone         text,
  -- The planner block as posted; prices arrive pre-formatted, so the admin
  -- never recalculates them.
  planner       jsonb,
  updated_at    timestamptz not null default now(),

  constraint inquiries_origin_shape check (
    (origin = 'project_planner' and planner is not null)
    or (origin = 'contact' and planner is null and phone is null)
  )
);

comment on table public.inquiries is 'Incoming website requests: contact form and project planner.';
comment on column public.inquiries.planner is 'Original structured planner payload, stored verbatim.';

create index inquiries_received_at_idx on public.inquiries (received_at desc);
create index inquiries_status_idx on public.inquiries (status);

-- Prospects YM approaches itself. A different thing from an inquiry; the two
-- never share a model or a list.
create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  company_name       text not null check (length(btrim(company_name)) > 0),
  contact_name       text not null check (length(btrim(contact_name)) > 0),
  email              text,
  phone              text,
  website            text,
  source             text not null
                     check (source in ('cold_email', 'cold_call', 'linkedin', 'referral', 'network', 'other')),
  status             text not null default 'new'
                     check (status in ('new', 'to_contact', 'contacted', 'follow_up', 'interested', 'quote', 'won', 'lost')),
  notes              text not null default '',
  last_contact_at    date,
  next_follow_up_at  date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.leads is 'Outbound prospects, added and followed up by hand.';

create index leads_next_follow_up_idx on public.leads (next_follow_up_at) where next_follow_up_at is not null;
create index leads_status_idx on public.leads (status);

-- Companies YM works for. A customer may come from an inquiry or a lead; both
-- references are optional and survive the source being removed.
create table public.customers (
  id                uuid primary key default gen_random_uuid(),
  company_name      text not null check (length(btrim(company_name)) > 0),
  contact_name      text not null check (length(btrim(contact_name)) > 0),
  email             text not null check (length(btrim(email)) > 0),
  phone             text,
  street            text not null,
  postal_code       text not null,
  city              text not null,
  country           text not null default 'Nederland',
  kvk_number        text,
  vat_number        text,
  notes             text not null default '',
  status            text not null default 'active' check (status in ('active', 'inactive')),
  source_inquiry_id uuid references public.inquiries (id) on delete set null,
  source_lead_id    uuid references public.leads (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.customers is 'Companies YM works for; carries quotes and invoices.';

create index customers_company_name_idx on public.customers (company_name);
create index customers_source_inquiry_idx on public.customers (source_inquiry_id) where source_inquiry_id is not null;
create index customers_source_lead_idx on public.customers (source_lead_id) where source_lead_id is not null;

-- updated_at, using the trigger function from the admin auth migration.
create trigger inquiries_set_updated_at before update on public.inquiries
  for each row execute function private.set_updated_at();
create trigger leads_set_updated_at before update on public.leads
  for each row execute function private.set_updated_at();
create trigger customers_set_updated_at before update on public.customers
  for each row execute function private.set_updated_at();

-- Row level security: active admins only, nothing for anon.
alter table public.inquiries enable row level security;
alter table public.inquiries force row level security;
alter table public.leads enable row level security;
alter table public.leads force row level security;
alter table public.customers enable row level security;
alter table public.customers force row level security;

revoke all on table public.inquiries from anon, authenticated;
revoke all on table public.leads from anon, authenticated;
revoke all on table public.customers from anon, authenticated;

grant select, insert, update, delete on table public.inquiries to authenticated;
grant select, insert, update, delete on table public.leads to authenticated;
grant select, insert, update, delete on table public.customers to authenticated;

create policy inquiries_admin_all on public.inquiries
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy leads_admin_all on public.leads
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy customers_admin_all on public.customers
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
