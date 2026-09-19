-- Making an invoice definitive, as a step of its own, with one PDF.
--
-- Until now an invoice became a real document at the moment it was mailed:
-- `send` assigned the number, derived the payment reference, rendered a PDF
-- and sent it, all in one action. The admin could never look at what would
-- leave the building -- the preview still said FAC-CONCEPT-… -- and the
-- preview and the attachment were two separate renders of the same data.
--
-- So issuing is split off, and the document becomes a file:
--
--   1. `begin_invoice_finalization` takes the number, settles the payment
--      reference, freezes the monthly-service note and stamps
--      `finalizing_at`. From that moment the row is frozen.
--   2. The application renders the PDF once, hashes it and stores it in the
--      `invoice-documents` bucket.
--   3. `complete_invoice_finalization` records the object path, its SHA-256
--      and its size, and stamps `issued_at`.
--
-- Two steps because storage and Postgres are not one transaction. Between
-- them the invoice is *finalizing*: numbered, frozen, not yet a document.
-- That state is deliberate and recoverable.
--
-- Which render becomes the document is decided here and not in the bucket.
-- Storage cannot arbitrate between two simultaneous writers -- measured on a
-- real stack: two uploads issued at one instant to the same key are both
-- accepted, and the later one wins -- so it is never asked to. Every render
-- is stored under a path containing its own SHA-256, where nothing can
-- overwrite anything, and `complete_invoice_finalization` records exactly
-- one of them, once, together with `issued_at`.
--
-- Why columns and not a status:
--
--   finalizing_at   is set with the number and never cleared. It is what the
--                   immutability triggers key on: the PDF is rendered from
--                   this row between the two steps, so nothing may move from
--                   the moment the number exists.
--   issued_at       says the document exists and has a file. Set once.
--   status          gains 'issued' for what the screens and lists show. It
--                   cannot carry either invariant: 'cancelled' does not tell
--                   you whether the document ever existed.

alter table public.invoices
  add column finalizing_at         timestamptz,
  add column issued_at             timestamptz,
  add column activation_note       jsonb,
  add column document_path         text,
  add column document_sha256       text,
  add column document_bytes        integer,
  add column document_generated_at timestamptz;

comment on column public.invoices.finalizing_at is
  'When this invoice was given its definitive number. Set once; the point from which the document is frozen.';
comment on column public.invoices.issued_at is
  'When this invoice became a document with a stored PDF. Set once, together with the document_* columns.';
comment on column public.invoices.activation_note is
  'The monthly-service figures frozen into the document, or null. Keys: serviceId, serviceName, monthlyNetCents, monthlyGrossCents, firstDebitOn.';
comment on column public.invoices.document_path is
  'Object path of the definitive PDF in the invoice-documents bucket.';
comment on column public.invoices.document_sha256 is
  'SHA-256 of that exact file, in lowercase hex. Verified before the file is mailed.';

/*
  Every invoice that already carries a definitive number was issued under the
  old flow, when a document was whatever `send` rendered at the time. They are
  stamped so the lifecycle reads correctly, and deliberately left without an
  artifact: fabricating one now would mean generating a PDF today and filing
  it as the document the customer received, which is exactly the claim this
  whole change exists to make honest.
*/
update public.invoices
   set finalizing_at = coalesce(sent_at, created_at),
       issued_at     = coalesce(sent_at, created_at)
 where not number_provisional
   and issued_at is null;

alter table public.invoices
  drop constraint invoices_status_check;

alter table public.invoices
  add constraint invoices_status_check
  check (status in ('draft', 'issued', 'sent', 'paid', 'overdue', 'cancelled'));

/*
  The lifecycle, stated once. A provisional number means a concept, and a
  concept has neither moment; a definitive number means finalization started.
  Nothing is issued that was not numbered, and nothing is sent that was not
  issued.
*/
alter table public.invoices
  add constraint invoices_finalizing_matches_number
  check ((finalizing_at is null) = number_provisional);

alter table public.invoices
  add constraint invoices_issued_after_finalizing
  check (issued_at is null or finalizing_at is not null);

alter table public.invoices
  add constraint invoices_sent_after_issued
  check (sent_at is null or issued_at is not null);

/* An artifact is four facts or none of them, and a hash is a hash. */
alter table public.invoices
  add constraint invoices_document_complete check (
    (document_path is null and document_sha256 is null and document_bytes is null and document_generated_at is null)
    or (
      document_path is not null
      and document_sha256 ~ '^[0-9a-f]{64}$'
      and document_bytes > 0
      and document_generated_at is not null
    )
  );

/*
  No invoice counts as definitive without its file.

  The exemption is dated, and names exactly what it exempts: rows issued
  before this migration ran, under the flow that had no artifacts. There are
  none of those in production -- checked before this was written -- and the
  clause is here so the constraint is still true in an environment that has
  some. They cannot be mailed either: the send flow reads the artifact and
  refuses without one, rather than quietly rendering a new PDF and passing it
  off as the original.
*/
alter table public.invoices
  add constraint invoices_issued_has_document check (
    issued_at is null
    or document_path is not null
    or issued_at < timestamptz '2026-09-19 21:00:00+00'
  );

create index invoices_issued_at_idx on public.invoices (issued_at desc) where issued_at is not null;

-- The definitive PDFs.
--
-- Private, unlike article-media: an invoice is one customer's business, and
-- an object path that could be guessed is not an access rule. Nothing reads
-- from this bucket anonymously; the admin downloads through the authenticated
-- API, and the mail attachment is read server-side.
--
-- Type and size are the bucket's own business, so an upload that goes around
-- the application is refused too. There is deliberately no delete policy: the
-- PDF of a definitive invoice is a record, and a cancelled invoice keeps
-- both its number and its document.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-documents', 'invoice-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists invoice_documents_admin_read   on storage.objects;
drop policy if exists invoice_documents_admin_insert on storage.objects;
drop policy if exists invoice_documents_admin_update on storage.objects;

create policy invoice_documents_admin_read
  on storage.objects for select to authenticated
  using (bucket_id = 'invoice-documents' and private.is_admin());

create policy invoice_documents_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'invoice-documents' and private.is_admin());

/*
  Deliberately no update and no delete policy.

  A stored PDF is a record: it is never replaced and never removed. Object
  paths carry the SHA-256 of their own contents, so a second render cannot
  aim at an existing object in the first place; this is the same rule one
  level down, where a mistake in the application cannot get around it. An
  overwrite attempt is refused here with 403 AccessDenied, which is a
  different answer from the 409 a genuine collision gives -- the application
  tells those two apart on purpose.
*/

-- The next number in the invoice series, composed and not written.
--
-- Split off from the old `assign_invoice_number` so that issuing can write
-- the number together with everything else that becomes true at the same
-- moment. The year comes from the document's own issue date, not from the
-- clock, so an invoice dated last December is numbered in that year's series.
create or replace function private.next_invoice_number(p_issue_date date)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_year     integer := extract(year from p_issue_date)::integer;
  v_sequence integer := private.next_document_sequence('invoice', v_year);
begin
  return 'YM-F-' || v_year::text || '-' || lpad(v_sequence::text, 6, '0');
end;
$$;

revoke all on function private.next_invoice_number(date) from public, anon;
grant execute on function private.next_invoice_number(date) to authenticated;

-- Step one: the number, the reference and the note, in one statement.
--
-- `for update` makes a second call safe: it waits, then sees a row that is
-- already numbered and returns the number it has. A double click, two tabs
-- and a retried request all get the same number, and the counter moves once.
--
-- The payment reference rule, which `isProvisionalDocumentNumber` in
-- lib/admin/documents/numbering.ts mirrors for the screens:
--
--   empty, or still one of the provisional FAC-CONCEPT-… / OFF-CONCEPT-…
--   values a concept is given automatically  ->  the invoice number,
--   anything else, which is a reference the admin typed  ->  left alone.
--
-- The concept reference may never reach a customer: it is what a bank
-- transfer is matched on, and a document numbered YM-F-2026-000001 that asks
-- for FAC-CONCEPT-OUSHO gives one debt two names.
--
-- SECURITY INVOKER: the caller's own rights apply, so the admin policies on
-- invoices and on the counter decide. Anon holds no rights on either.
create or replace function public.begin_invoice_finalization(p_invoice_id uuid, p_activation jsonb default null)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_number        text;
  v_finalizing_at timestamptz;
  v_status        text;
  v_reference     text;
  v_issue_date    date;
begin
  select number_value, finalizing_at, status, payment_reference, issue_date
    into v_number, v_finalizing_at, v_status, v_reference, v_issue_date
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Onbekende factuur.' using errcode = 'P0002';
  end if;

  -- Already numbered: this is a retry, and the answer is the number it has.
  if v_finalizing_at is not null then
    return v_number;
  end if;

  if v_status = 'cancelled' then
    raise exception 'Een geannuleerde factuur wordt niet definitief gemaakt.' using errcode = 'check_violation';
  end if;

  v_number := private.next_invoice_number(v_issue_date);

  if coalesce(btrim(v_reference), '') = ''
     or v_reference like 'FAC-CONCEPT-%'
     or v_reference like 'OFF-CONCEPT-%'
  then
    v_reference := v_number;
  end if;

  update public.invoices
     set number_value       = v_number,
         number_provisional = false,
         finalizing_at      = now(),
         payment_reference  = v_reference,
         activation_note    = p_activation
   where id = p_invoice_id;

  return v_number;
end;
$$;

comment on function public.begin_invoice_finalization(uuid, jsonb) is
  'Numbers an invoice and freezes it: number, payment reference, activation note and finalizing_at, in one statement. A second call returns the number already taken.';

revoke all on function public.begin_invoice_finalization(uuid, jsonb) from public, anon;
grant execute on function public.begin_invoice_finalization(uuid, jsonb) to authenticated;

-- Step two: the document exists.
--
-- Recording the file and stamping `issued_at` is one statement, so there is
-- no instant in which an invoice is issued without its PDF -- that pair is
-- what `invoices_issued_has_document` states.
--
-- Two callers can arrive here at once, having both rendered. `for update`
-- puts them in a queue, and the one that arrives second finds a document
-- already recorded. It does not write: the first artifact is the invoice's
-- artifact, for good. What it gets back is that artifact, so the caller
-- continues with the file that actually exists rather than the one it made.
--
-- It only gets that far if it is offering the same file. Because the upload
-- never overwrites, a second caller has adopted the stored object and
-- hashed those very bytes, so its arguments match by construction. Arguments
-- that differ mean the object was replaced behind our backs, which is not a
-- thing to accept quietly: it is refused, and the invoice keeps the document
-- it was issued with.
create or replace function public.complete_invoice_finalization(
  p_invoice_id uuid,
  p_path       text,
  p_sha256     text,
  p_bytes      integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_number        text;
  v_finalizing_at timestamptz;
  v_issued_at     timestamptz;
  v_path          text;
  v_sha256        text;
  v_bytes         integer;
begin
  select number_value, finalizing_at, issued_at, document_path, document_sha256, document_bytes
    into v_number, v_finalizing_at, v_issued_at, v_path, v_sha256, v_bytes
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Onbekende factuur.' using errcode = 'P0002';
  end if;

  if v_finalizing_at is null then
    raise exception 'Factuur % heeft nog geen definitief nummer.', v_number using errcode = 'check_violation';
  end if;

  -- Already a document: the file it was issued with stays its file.
  if v_issued_at is not null then
    if p_path is distinct from v_path
       or p_sha256 is distinct from v_sha256
       or p_bytes is distinct from v_bytes
    then
      raise exception
        'Factuur % heeft al een definitieve PDF (%); een afwijkend document wordt niet vastgelegd.',
        v_number, v_sha256
        using errcode = 'check_violation';
    end if;

    return jsonb_build_object(
      'number', v_number, 'path', v_path, 'sha256', v_sha256, 'bytes', v_bytes, 'adopted', true
    );
  end if;

  update public.invoices
     set issued_at             = now(),
         document_path         = p_path,
         document_sha256       = p_sha256,
         document_bytes        = p_bytes,
         document_generated_at = now(),
         status                = case when status = 'draft' then 'issued' else status end
   where id = p_invoice_id
     and issued_at is null;

  return jsonb_build_object(
    'number', v_number, 'path', p_path, 'sha256', p_sha256, 'bytes', p_bytes, 'adopted', false
  );
end;
$$;

comment on function public.complete_invoice_finalization(uuid, text, text, integer) is
  'Records the stored PDF and stamps issued_at, in one statement. A second call writes nothing and returns the artifact the invoice already has; a different one is refused.';

revoke all on function public.complete_invoice_finalization(uuid, text, text, integer) from public, anon;
grant execute on function public.complete_invoice_finalization(uuid, text, text, integer) to authenticated;

/*
  The old entry point is removed rather than kept as a wrapper. Assigning a
  number is no longer a thing on its own: it is the first half of issuing a
  document, and a caller that took a number without ever storing a PDF would
  leave exactly the half-finished invoice this design is built to avoid. Code
  that still calls it fails loudly, which is what a rollback should do.
*/
drop function if exists public.assign_invoice_number(uuid);

/*
  The immutability boundary moves from "sent" to "numbered".

  It used to be `sent_at`, because that was the only moment a document became
  real. Now the document is rendered from this row between the two halves of
  finalization, and mailed from the file that render produced, so the row may
  not move from the moment the number exists.

  What stays allowed on a frozen invoice, and why:

    issued_at, document_*  written exactly once, by step two, and never again.
    status                 the payment system moves issued -> sent -> paid ->
                           overdue, and an invoice that is never sent can be
                           cancelled. Going back to 'draft' is refused.
    sent_at                sending it, and resending the same document.
    recipient_email        it records where that send went.
    updated_at             written by the trigger that keeps it honest.

  Correcting an issued invoice is deliberately not possible. That needs a
  credit note, which is its own flow and its own document.
*/
create or replace function private.refuse_issued_invoice_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Not numbered yet: still a concept, still editable.
  if old.finalizing_at is null then
    return new;
  end if;

  if new.finalizing_at is distinct from old.finalizing_at then
    raise exception
      'Factuur % heeft al een definitief nummer; het moment daarvan ligt vast.',
      old.number_value
      using errcode = 'check_violation';
  end if;

  /*
    The document itself. While the invoice is still finalizing these are
    empty and step two fills them in; once it is issued, the file it was
    issued with is the file, and the stamp on it does not move.
  */
  if old.issued_at is not null then
    if new.issued_at             is distinct from old.issued_at
       or new.document_path      is distinct from old.document_path
       or new.document_sha256    is distinct from old.document_sha256
       or new.document_bytes     is distinct from old.document_bytes
       or new.document_generated_at is distinct from old.document_generated_at
    then
      raise exception
        'Factuur % is al uitgegeven; het document ervan ligt vast.',
        old.number_value
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'draft' then
    raise exception
      'Factuur % is al definitief en kan geen concept meer worden.',
      old.number_value
      using errcode = 'check_violation';
  end if;

  if new.number_value          is distinct from old.number_value
     or new.number_provisional is distinct from old.number_provisional
     or new.customer_id        is distinct from old.customer_id
     or new.customer_company_name is distinct from old.customer_company_name
     or new.customer_contact_name is distinct from old.customer_contact_name
     or new.customer_email        is distinct from old.customer_email
     or new.customer_street       is distinct from old.customer_street
     or new.customer_postal_code  is distinct from old.customer_postal_code
     or new.customer_city         is distinct from old.customer_city
     or new.customer_country      is distinct from old.customer_country
     or new.customer_kvk_number   is distinct from old.customer_kvk_number
     or new.customer_vat_number   is distinct from old.customer_vat_number
     or new.issue_date            is distinct from old.issue_date
     or new.due_date              is distinct from old.due_date
     or new.payment_reference     is distinct from old.payment_reference
     or new.notes                 is distinct from old.notes
     or new.activation_note       is distinct from old.activation_note
     or new.recurring_service_id  is distinct from old.recurring_service_id
     or new.billing_period_start  is distinct from old.billing_period_start
     or new.billing_period_end    is distinct from old.billing_period_end
     or new.quote_id              is distinct from old.quote_id
     or new.project_id            is distinct from old.project_id
  then
    raise exception
      'Factuur % is al definitief; de gegevens ervan liggen vast. Corrigeren kan alleen met een creditfactuur.',
      old.number_value
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function private.refuse_issued_invoice_changes() is
  'Freezes an invoice from the moment it is numbered; the stored document is written once and never changed.';

/*
  The lines are the invoice's figures, so they are frozen with it, from the
  same moment -- the PDF is rendered from them. Replacing them is how
  `save_invoice_lines` works, which is exactly the operation this has to stop
  once the number exists.
*/
create or replace function private.refuse_issued_invoice_line_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  v_frozen_at  timestamptz;
  v_number     text;
begin
  select finalizing_at, number_value into v_frozen_at, v_number
  from public.invoices where id = v_invoice_id;

  if v_frozen_at is not null then
    raise exception
      'Factuur % is al definitief; de regels ervan liggen vast. Corrigeren kan alleen met een creditfactuur.',
      v_number
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function private.refuse_issued_invoice_line_changes() is
  'Freezes the lines of an invoice once it has been numbered.';
