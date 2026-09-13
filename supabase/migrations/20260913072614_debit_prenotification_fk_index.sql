-- Covering index for the composite foreign key on debit_prenotifications.
--
-- `debit_prenotifications_same_customer` references
-- recurring_services (id, customer_id), so the check that runs when a service
-- is removed looks rows up by (recurring_service_id, customer_id) in that
-- order. No index led with that pair: `debit_prenotifications_customer_idx`
-- leads with customer_id, which serves the plain reference to customers but
-- not this one. The database linter reports it as an unindexed foreign key.
--
-- This also replaces `debit_prenotifications_service_period_idx`, and that is
-- deliberate rather than incidental. That index was on
-- (recurring_service_id, billing_period_start), and nothing queries this table
-- by billing period: the announcement is looked up by invoice, date and
-- amount -- which is the unique index -- the customer page reads by
-- customer_id, and the runner writes by id. Its only remaining job was
-- covering the single-column reference to recurring_services through its
-- leading column, and the index below does that just as well while also
-- covering the composite one. Keeping both would be two indexes leading with
-- the same column where one is never used for its second.
--
-- Created before the old one is dropped, so the reference is never uncovered.

create index debit_prenotifications_service_idx
  on public.debit_prenotifications (recurring_service_id, customer_id);

drop index if exists public.debit_prenotifications_service_period_idx;
