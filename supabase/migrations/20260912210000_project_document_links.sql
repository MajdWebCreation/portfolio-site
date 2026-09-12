-- Projects and documents: many quotes and many invoices per project.
--
-- The projects migration gave a project one optional quote. That was the
-- wrong way round. A project is the thing the work belongs to, and over its
-- life it collects several quotes and several invoices; an invoice that never
-- had a quote could not be filed under a project at all. So the link moves to
-- the documents: each document may name at most one project, and a project
-- reaches its documents by being named.
--
-- No data to migrate: projects, quotes and invoices are all empty, and
-- projects.quote_id was never written by the application. This migration is
-- forward-only and leaves the earlier ones untouched.
--
-- The invariants, all stated in the database rather than in TypeScript:
--
--  1. A document's project belongs to the same customer as the document.
--     Same composite-key trick the projects migration used for the old link:
--     (project_id, customer_id) is matched against the same pair on projects,
--     so a project of another customer has no row to point at. MATCH SIMPLE
--     means a null project_id skips the check, which keeps the link optional
--     and every existing document without a project valid.
--
--  2. An invoice that names both a quote and a project may not contradict
--     itself. (quote_id, project_id) is matched against the same pair on
--     quotes, so the quote it follows from has to sit in the same project.
--     Null on either side skips the check, so "a quote and no project" and
--     "a project and no quote" both stay allowed. This is deliberately a
--     foreign key and not a trigger: a trigger reading the other table would
--     be racy, and this is checked with the same locking as any reference.
--
--  3. Deletes preserve history. Removing a project clears project_id on its
--     documents and nothing else; removing a quote clears quote_id on its
--     invoices and leaves their project in place. Both are SET NULL on the
--     one column, never on customer_id, which stays NOT NULL.

-- The key the documents point at.
alter table public.projects
  add constraint projects_id_customer_unique unique (id, customer_id);

-- A quote may belong to one project of its own customer.
alter table public.quotes
  add column project_id uuid,
  add constraint quotes_project_same_customer
    foreign key (project_id, customer_id) references public.projects (id, customer_id)
    on delete set null (project_id);

comment on column public.quotes.project_id is 'Optional project this quote belongs to; always a project of the same customer.';

-- An invoice may belong to one project of its own customer, with or without
-- a quote of its own.
alter table public.invoices
  add column project_id uuid,
  add constraint invoices_project_same_customer
    foreign key (project_id, customer_id) references public.projects (id, customer_id)
    on delete set null (project_id);

comment on column public.invoices.project_id is 'Optional project this invoice belongs to; always a project of the same customer.';

-- Quote and project on the same invoice have to agree.
alter table public.quotes
  add constraint quotes_id_project_unique unique (id, project_id);

alter table public.invoices
  add constraint invoices_quote_same_project
    foreign key (quote_id, project_id) references public.quotes (id, project_id)
    on delete set null (quote_id);

comment on constraint invoices_quote_same_project on public.invoices is
  'When an invoice names both, the quote must sit in the same project as the invoice.';

-- The old one-quote-per-project link, and the unique key that only existed to
-- support it.
alter table public.projects drop constraint projects_quote_same_customer;
drop index if exists public.projects_quote_idx;
alter table public.projects drop column quote_id;

alter table public.quotes drop constraint quotes_id_customer_unique;

-- Covering indexes for the new foreign keys, partial because a document
-- without the link has nothing to look up. The invoice index leads with
-- quote_id so it serves invoices_quote_id_fkey as well, which is why the
-- single-column index it replaces can go.
create index quotes_project_idx
  on public.quotes (project_id, customer_id) where project_id is not null;

create index invoices_project_idx
  on public.invoices (project_id, customer_id) where project_id is not null;

drop index if exists public.invoices_quote_idx;
create index invoices_quote_idx
  on public.invoices (quote_id, project_id) where quote_id is not null;
