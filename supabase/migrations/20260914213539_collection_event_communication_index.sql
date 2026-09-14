-- The one foreign key in the schema that had no index under it.
--
-- `invoice_collection_events.communication_id` points at the customer
-- communication a reminder produced, with ON DELETE SET NULL. Clearing that
-- link means finding the rows that hold it, and without an index that is a
-- sequential scan of the whole table.
--
-- Today it could never fire: `customer_communications` is append-only and
-- carries no delete grant, so nothing deletes a row for the link to follow.
-- The index is here because "nothing can reach this path right now" is a
-- statement about the current grants, not about the shape of the table -- and
-- because every other foreign key in this schema has cover.
--
-- Partial on purpose. Most reminder events carry no communication: a claim
-- that is still pending has none yet, and one that failed never gets one. The
-- lookup is always `communication_id = <id>`, which implies NOT NULL, so the
-- planner can use this index for it while it stays as small as the number of
-- reminders that actually went out.

create index invoice_collection_events_communication_id_idx
  on public.invoice_collection_events (communication_id)
  where communication_id is not null;
