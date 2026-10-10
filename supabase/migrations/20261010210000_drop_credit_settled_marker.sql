-- The old manual "credit settled" marker on recurring services.
--
-- Applied after the code that stopped reading these columns is live (see
-- the end of 20261010200000_credit_notes_and_refunds.sql). Whether a
-- cancellation credit is dealt with follows from its credit note and the
-- refunds against it; a second marker that could disagree with them is
-- exactly what the credit note schema exists to avoid. Checked before
-- applying: no production row carried the marker.

alter table public.recurring_services
  drop column if exists credit_settled_at,
  drop column if exists credit_settled_by;
