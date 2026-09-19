-- The artifact requirement, without its temporary exemption.
--
-- `invoices_issued_has_document` was written with a dated escape clause:
-- invoices issued before the finalization migration ran were allowed to have
-- no stored PDF, because they predated the idea of one. There were none of
-- those, and fabricating a document for them would have been the one thing
-- an artifact store must never do -- so the clause was a safety net for other
-- environments, not for this database.
--
-- It has a cost here: the cutoff is a moment in time, so between the
-- migration running and that moment passing, an invoice could in principle
-- have been issued with no file and stayed exempt forever. Nothing in the
-- application can produce that state -- `complete_invoice_finalization`
-- writes `issued_at` and the document columns in one statement -- but an
-- invariant that depends on the clock being past a certain point is not an
-- invariant. This removes the clause and states the rule plainly.
--
-- Nothing else changes: no columns, no functions, no triggers, no policies,
-- no rows.

/*
  First, prove the strict rule already holds. If any invoice is issued
  without a document, this migration must not run: the answer to such a row
  is a deliberate decision about that invoice, not a constraint that quietly
  refuses to apply. The transaction aborts and the schema is untouched.
*/
do $$
declare
  v_offenders bigint;
begin
  select count(*) into v_offenders
  from public.invoices
  where issued_at is not null
    and document_path is null;

  if v_offenders > 0 then
    raise exception
      'Er zijn % facturen die uitgegeven zijn zonder opgeslagen document; los die eerst op.',
      v_offenders
      using errcode = 'check_violation';
  end if;
end;
$$;

/*
  The rule itself, permanently: a document exists, or the invoice is not
  issued.

  Deliberately only about the path. What that path has to come with -- a
  lowercase SHA-256, a positive byte count and a generation moment, all four
  present or all four absent -- is already `invoices_document_complete`, and
  saying it twice would give two places to change it.
*/
alter table public.invoices
  drop constraint invoices_issued_has_document;

alter table public.invoices
  add constraint invoices_issued_has_document
  check (issued_at is null or document_path is not null);
