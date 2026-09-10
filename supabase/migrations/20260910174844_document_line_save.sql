-- Replacing the lines of a document in one statement.
--
-- Saving a quote or invoice rewrites its whole line set. Done from the client
-- that is a delete followed by an insert, two round trips: if the second one
-- fails the document is left without lines. A function body is one
-- transaction, so either the new lines are there or the old ones still are.
--
-- SECURITY INVOKER on purpose: the function runs with the caller's rights, so
-- the same row level security policies apply to the delete and the insert.
-- A non-admin calling this over /rest/v1/rpc changes nothing.
--
-- `position` follows the array order, which is the order the admin arranged.

create or replace function public.save_quote_lines(p_quote_id uuid, p_lines jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.quote_lines where quote_id = p_quote_id;

  insert into public.quote_lines
    (quote_id, position, description, quantity_hundredths, unit_price_cents, vat_rate)
  select p_quote_id,
         (t.ordinality - 1)::int,
         t.line ->> 'description',
         (t.line ->> 'quantityHundredths')::int,
         (t.line ->> 'unitPriceCents')::int,
         (t.line ->> 'vatRate')::int
  from jsonb_array_elements(p_lines) with ordinality as t(line, ordinality);
end;
$$;

create or replace function public.save_invoice_lines(p_invoice_id uuid, p_lines jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.invoice_lines where invoice_id = p_invoice_id;

  insert into public.invoice_lines
    (invoice_id, position, description, quantity_hundredths, unit_price_cents, vat_rate)
  select p_invoice_id,
         (t.ordinality - 1)::int,
         t.line ->> 'description',
         (t.line ->> 'quantityHundredths')::int,
         (t.line ->> 'unitPriceCents')::int,
         (t.line ->> 'vatRate')::int
  from jsonb_array_elements(p_lines) with ordinality as t(line, ordinality);
end;
$$;

revoke all on function public.save_quote_lines(uuid, jsonb) from public, anon;
revoke all on function public.save_invoice_lines(uuid, jsonb) from public, anon;
grant execute on function public.save_quote_lines(uuid, jsonb) to authenticated;
grant execute on function public.save_invoice_lines(uuid, jsonb) to authenticated;
