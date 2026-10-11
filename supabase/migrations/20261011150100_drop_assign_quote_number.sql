-- The old quote numbering entry point goes.
--
-- `assign_quote_number` handed out a YM-O number on its own. Since
-- `quote_issuance` that is the first half of `begin_quote_issue`, which takes
-- the number together with the set of general terms and freezes the row; a
-- number taken on its own would leave a half-finished quote. Nothing in the
-- application calls the old function any more, and code that still did would
-- now fail loudly, which is what a rollback should do.
--
-- Its own migration because the production database is maintained through a
-- connection that asks for confirmation on every `drop`, and the rest of
-- `quote_issuance` had to land without waiting for that answer. The function
-- is SECURITY INVOKER and admin-only, so it is harmless while it remains.

drop function if exists public.assign_quote_number(uuid);
