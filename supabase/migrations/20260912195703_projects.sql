-- Projects: the work YM does for a customer.
--
-- A project belongs to exactly one customer and may follow from one quote. It
-- is not a document: no lines, no numbering, no money. What the work is worth
-- is already written down in the quotes and invoices that hang off it, so
-- nothing of that is copied here.
--
-- Two business rules are kept here rather than in the form alone:
--
--  1. A deadline never falls before the start date. Either may be absent; the
--     check only has something to say when both are present.
--
--  2. A linked quote belongs to the same customer as the project. A plain
--     foreign key on quote_id cannot express that, so the reference is
--     composite -- (quote_id, customer_id) against the matching pair on
--     quotes -- and a quote from another customer simply has no row to point
--     at. That needs a unique key on quotes (id, customer_id): id is already
--     the primary key, so the constraint adds a guarantee, not a restriction.
--     With MATCH SIMPLE a null quote_id skips the check, which is what makes
--     the link optional.
--
-- Deletes: the admin has no delete path for projects and this migration hands
-- out no delete right. The references still state what would have to hold: a
-- customer carrying projects cannot be removed, and a removed quote clears
-- only the link column -- customer_id is not nullable and stays put.

alter table public.quotes
  add constraint quotes_id_customer_unique unique (id, customer_id);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  quote_id    uuid,
  name        text not null check (length(btrim(name)) > 0),
  status      text not null default 'planned'
              check (status in ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
  start_date  date,
  deadline    date,
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint projects_deadline_after_start
    check (deadline is null or start_date is null or deadline >= start_date),

  constraint projects_quote_same_customer
    foreign key (quote_id, customer_id) references public.quotes (id, customer_id)
    on delete set null (quote_id)
);

comment on table public.projects is 'Work YM does for one customer; optionally following from one of that customer''s quotes.';
comment on constraint projects_quote_same_customer on public.projects is 'The linked quote must belong to the same customer as the project.';

create index projects_customer_idx on public.projects (customer_id);
create index projects_status_idx on public.projects (status);
create index projects_deadline_idx on public.projects (deadline) where deadline is not null;
create index projects_quote_idx on public.projects (quote_id) where quote_id is not null;

create trigger projects_set_updated_at before update on public.projects
  for each row execute function private.set_updated_at();

-- Row level security: active admins only, nothing for anon.
alter table public.projects enable row level security;
alter table public.projects force row level security;

revoke all on table public.projects from anon, authenticated;
grant select, insert, update on table public.projects to authenticated;

create policy projects_admin_all on public.projects
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
