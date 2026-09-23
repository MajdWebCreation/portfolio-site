-- One-off clean-up of activation tokens in the communication log.
--
-- Before lib/admin/communications/redact.ts existed, the log kept every
-- customer mail verbatim, and an activation mail carries the raw token of its
-- link -- the value recurring_activations deliberately stores only as a hash.
-- This pass removes that token from rows written earlier. It changes nothing
-- else: the expression matches exactly the link shape the site produces
-- (/<locale>/incasso/<token>) and replaces the token with the same marker the
-- application now writes, so old and new rows read alike.
--
-- Safe to run more than once: a row that carries the marker no longer matches.
-- Restricted to the categories that ever carried such a link, so no other
-- communication is touched at all. Counts only are reported; no body, address
-- or token value is ever printed.
do $$
declare
  affected integer;
begin
  update public.customer_communications
  set
    body_text = regexp_replace(body_text, '(/(nl|en)/incasso/)[A-Za-z0-9_-]{20,200}', '\1[token-verwijderd]', 'g'),
    body_html = case
      when body_html is null then null
      else regexp_replace(body_html, '(/(nl|en)/incasso/)[A-Za-z0-9_-]{20,200}', '\1[token-verwijderd]', 'g')
    end
  where category in ('direct_debit_activation', 'invoice_activation_sent')
    and (
      body_text ~ '/(nl|en)/incasso/[A-Za-z0-9_-]{20,200}'
      or coalesce(body_html, '') ~ '/(nl|en)/incasso/[A-Za-z0-9_-]{20,200}'
    );

  get diagnostics affected = row_count;
  raise notice 'redact_activation_tokens: % communication row(s) redacted', affected;
end $$;
