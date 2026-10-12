-- The term invoice of a monthly direct debit is issued by the system client:
-- the Mollie webhook when a subscription collection arrives, and the daily
-- pre-notification job when it announces the next one. Both run as
-- service_role and go through public.begin_invoice_finalization -- a
-- SECURITY INVOKER function that takes the number from
-- private.next_invoice_number, which takes it from
-- private.next_document_sequence.
--
-- Those two were granted to `authenticated` only (the admin issues invoices
-- on their own session), and service_role never had USAGE on the schema. So
-- the first automatic term after a mandate would have failed to be numbered
-- -- the collection unrecorded, the webhook retried until Mollie gave up.
-- Nothing in production had reached that path yet (no subscription exists).
--
-- Exactly what that path needs and nothing else: the schema, and the two
-- numbering functions. The helpers the portal and admin rely on stay closed
-- to service_role as before.

grant usage on schema private to service_role;
grant execute on function private.next_document_sequence(text, integer) to service_role;
grant execute on function private.next_invoice_number(date) to service_role;
