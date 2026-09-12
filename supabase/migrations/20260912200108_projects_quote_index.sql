-- Covering index for the composite foreign key on projects.
--
-- projects_quote_same_customer references quotes (id, customer_id), so the
-- referential check that runs when a quote is removed looks projects up by
-- both columns. The partial index from the projects migration named only
-- quote_id and did not cover it, which the database linter reports as an
-- unindexed foreign key.
--
-- Still partial: a project without a quote has nothing to look up, and
-- leading with quote_id keeps this usable for quote_id lookups on their own.

drop index if exists public.projects_quote_idx;

create index projects_quote_idx
  on public.projects (quote_id, customer_id) where quote_id is not null;
