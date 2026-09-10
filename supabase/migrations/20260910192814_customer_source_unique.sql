-- One customer per source.
--
-- Converting an inquiry or a lead into a customer must not be able to run
-- twice. The application checks first and returns the existing customer, but
-- two clicks a millisecond apart would both pass that check, so the rule is
-- stated where it cannot be raced: a unique index. The second insert fails
-- with 23505 and the action reports the customer that already exists.
--
-- These replace the plain lookup indexes from the business-core migration;
-- a unique index serves that lookup just as well.

drop index if exists public.customers_source_inquiry_idx;
drop index if exists public.customers_source_lead_idx;

create unique index customers_source_inquiry_unique
  on public.customers (source_inquiry_id) where source_inquiry_id is not null;
create unique index customers_source_lead_unique
  on public.customers (source_lead_id) where source_lead_id is not null;
