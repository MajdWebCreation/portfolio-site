-- Credit notes and refunds.
--
-- Three things that are not the same and never share a table:
--
--   credit note   a document that corrects an invoice: it names the invoice,
--                 carries its own number in its own series, and says how much
--                 of the invoice is no longer owed. The invoice itself does
--                 not move -- an issued invoice is frozen, and a credit note
--                 is the only way to correct one.
--   refund        money that actually went back to the customer, because the
--                 invoice had already been paid. A credit note against an
--                 unpaid invoice needs no refund: it simply lowers what is
--                 still owed.
--   the amounts   computed by `calculateTotals` in lib/money, the one VAT
--                 arithmetic. The totals a credit note carries are the
--                 frozen result of that computation, written once by the
--                 application and refused thereafter, so the database can
--                 cap refunds against them without reimplementing VAT.
--
-- What the database guarantees on its own, whatever the application does:
--
--   1. an issued credit note's figures, lines and reference cannot change;
--   2. the net amount credited on an invoice, per VAT rate, never exceeds
--      what the invoice charged at that rate (`create_credit_note`);
--   3. the amount refunded against a credit note never exceeds its total,
--      and the amount refunded against an invoice never exceeds what was
--      actually paid on it (`refuse_excess_refund`);
--   4. a refund always points at a credit note, and both point at one
--      customer's one invoice (composite foreign keys);
--   5. one credit note per cancellation credit of a service, and at most
--      one Mollie refund in flight per credit note (partial unique indexes);
--   6. the same Mollie refund is never recorded twice (unique on its id).
--
-- Mollie's refund API is called by the application; this schema only makes
-- sure that a retry cannot produce a second refund: the local row is the
-- claim, taken before Mollie is called, and the Mollie refund id is recorded
-- on that same row afterwards.

-- ------------------------------------------------------------- numbering

alter table public.document_counters
  drop constraint document_counters_kind_check;
alter table public.document_counters
  add constraint document_counters_kind_check check (kind in ('quote', 'invoice', 'credit_note'));

create or replace function private.next_credit_note_number(p_issue_date date)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_year     integer := extract(year from p_issue_date)::integer;
  v_sequence integer := private.next_document_sequence('credit_note', v_year);
begin
  return 'YM-C-' || v_year::text || '-' || lpad(v_sequence::text, 6, '0');
end;
$$;
revoke all on function private.next_credit_note_number(date) from public, anon;
grant execute on function private.next_credit_note_number(date) to authenticated;

-- ---------------------------------------------------------- credit notes

create table public.credit_notes (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.customers (id) on delete restrict,
  invoice_id          uuid not null,
  number_value        text not null,
  number_provisional  boolean not null default true,
  /* issued: numbered and frozen; sent: mailed to the customer. Whether the
     money side is done is never a column: it follows from the refunds and
     the payments on the invoice (see lib/admin/credit-notes/settlement). */
  status              text not null default 'issued' check (status in ('issued', 'sent')),
  reason              text not null check (length(btrim(reason)) > 0),
  issue_date          date not null,
  /* Where it came from. A credit note for the undelivered days of a
     cancelled monthly service names its service, and there is at most one
     of those per service. */
  source              text not null default 'manual' check (source in ('manual', 'cancellation_credit')),
  recurring_service_id uuid,
  /* The customer as it was on the invoice: a credit note corrects a document
     and is addressed to whom that document was addressed. */
  customer_company_name text not null,
  customer_contact_name text not null,
  customer_email        text not null,
  customer_street       text not null,
  customer_postal_code  text not null,
  customer_city         text not null,
  customer_country      text not null,
  customer_kvk_number   text,
  customer_vat_number   text,
  /* Frozen result of calculateTotals over the lines, written by the
     application. The refund cap below reads these. */
  subtotal_cents integer not null check (subtotal_cents > 0),
  vat_cents      integer not null check (vat_cents >= 0),
  total_cents    integer not null check (total_cents = subtotal_cents + vat_cents),
  currency       text not null default 'EUR' check (currency = 'EUR'),
  /* Two halves of issuing, as for invoices: the number first, the stored
     PDF second. Between the two the note is numbered but not yet a document. */
  finalizing_at         timestamptz,
  issued_at             timestamptz,
  document_path         text,
  document_sha256       text,
  document_bytes        integer,
  document_generated_at timestamptz,
  sent_at         timestamptz,
  recipient_email text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_notes_invoice_same_customer
    foreign key (invoice_id, customer_id) references public.invoices (id, customer_id) on delete restrict,
  constraint credit_notes_service_same_customer
    foreign key (recurring_service_id, customer_id) references public.recurring_services (id, customer_id) on delete set null (recurring_service_id),
  constraint credit_notes_source_has_service
    check (source <> 'cancellation_credit' or recurring_service_id is not null),
  constraint credit_notes_id_customer_unique unique (id, customer_id),
  constraint credit_notes_finalizing_matches_number check ((finalizing_at is null) = number_provisional),
  constraint credit_notes_issued_after_finalizing check (issued_at is null or finalizing_at is not null),
  constraint credit_notes_sent_after_issued check (sent_at is null or issued_at is not null),
  constraint credit_notes_document_complete check (
    (document_path is null and document_sha256 is null and document_bytes is null and document_generated_at is null)
    or (document_path is not null and document_sha256 ~ '^[0-9a-f]{64}$' and document_bytes > 0 and document_generated_at is not null)
  ),
  constraint credit_notes_issued_has_document check (issued_at is null or document_path is not null)
);

comment on table public.credit_notes is
  'Corrections of issued invoices; a credit note never changes the invoice it answers.';
comment on column public.credit_notes.total_cents is
  'Frozen total incl. VAT from calculateTotals over the lines; the cap for refunds against this note.';
comment on column public.credit_notes.source is
  'manual: made by an admin on the invoice; cancellation_credit: the undelivered days of a cancelled monthly service.';

create unique index credit_notes_definitive_number_unique
  on public.credit_notes (number_value) where not number_provisional;
/* One credit note per cancellation credit: a double click ends in 23505. */
create unique index credit_notes_cancellation_unique
  on public.credit_notes (recurring_service_id) where source = 'cancellation_credit';
create index credit_notes_invoice_idx on public.credit_notes (invoice_id, customer_id);
create index credit_notes_customer_idx on public.credit_notes (customer_id, issue_date desc);

create table public.credit_note_lines (
  id                  uuid primary key default gen_random_uuid(),
  credit_note_id      uuid not null references public.credit_notes (id) on delete cascade,
  position            integer not null check (position >= 0),
  description         text not null,
  quantity_hundredths integer not null check (quantity_hundredths > 0),
  /* The amount credited, as a positive figure: the document says it is a
     credit. Storing negatives would make every sum a second convention. */
  unit_price_cents    integer not null check (unit_price_cents >= 0),
  vat_rate            integer not null check (vat_rate in (0, 9, 21)),
  constraint credit_note_lines_position_unique unique (credit_note_id, position) deferrable initially deferred
);
comment on column public.credit_note_lines.unit_price_cents is 'Credited unit amount excl. VAT, positive; the note as a whole is the correction.';
create index credit_note_lines_note_idx on public.credit_note_lines (credit_note_id, position);

create trigger credit_notes_set_updated_at before update on public.credit_notes
  for each row execute function private.set_updated_at();

/* Frozen from the moment the number is taken, as an invoice is. What may
   still move: issued_at and the document (once), status, sent_at,
   recipient_email. */
create or replace function private.refuse_issued_credit_note_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.finalizing_at is null then
    return new;
  end if;
  if new.finalizing_at is distinct from old.finalizing_at then
    raise exception 'Creditnota % heeft al een definitief nummer; het moment daarvan ligt vast.', old.number_value
      using errcode = 'check_violation';
  end if;
  if old.issued_at is not null and (
       new.issued_at is distinct from old.issued_at
    or new.document_path is distinct from old.document_path
    or new.document_sha256 is distinct from old.document_sha256
    or new.document_bytes is distinct from old.document_bytes
    or new.document_generated_at is distinct from old.document_generated_at
  ) then
    raise exception 'Creditnota % is al uitgegeven; het document ervan ligt vast.', old.number_value
      using errcode = 'check_violation';
  end if;
  if new.number_value is distinct from old.number_value
     or new.number_provisional is distinct from old.number_provisional
     or new.customer_id is distinct from old.customer_id
     or new.invoice_id is distinct from old.invoice_id
     or new.reason is distinct from old.reason
     or new.issue_date is distinct from old.issue_date
     or new.source is distinct from old.source
     or new.recurring_service_id is distinct from old.recurring_service_id
     or new.subtotal_cents is distinct from old.subtotal_cents
     or new.vat_cents is distinct from old.vat_cents
     or new.total_cents is distinct from old.total_cents
     or new.customer_company_name is distinct from old.customer_company_name
     or new.customer_contact_name is distinct from old.customer_contact_name
     or new.customer_email is distinct from old.customer_email
     or new.customer_street is distinct from old.customer_street
     or new.customer_postal_code is distinct from old.customer_postal_code
     or new.customer_city is distinct from old.customer_city
     or new.customer_country is distinct from old.customer_country
     or new.customer_kvk_number is distinct from old.customer_kvk_number
     or new.customer_vat_number is distinct from old.customer_vat_number
  then
    raise exception 'Creditnota % is al definitief; de gegevens ervan liggen vast.', old.number_value
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger credit_notes_refuse_issued_changes
  before update on public.credit_notes
  for each row execute function private.refuse_issued_credit_note_changes();

create or replace function private.refuse_issued_credit_note_line_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_finalizing timestamptz;
  v_number     text;
begin
  select finalizing_at, number_value into v_finalizing, v_number
  from public.credit_notes where id = coalesce(new.credit_note_id, old.credit_note_id);
  if v_finalizing is not null then
    raise exception 'Creditnota % is al definitief; de regels ervan liggen vast.', v_number
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger credit_note_lines_refuse_issued_changes
  before insert or update or delete on public.credit_note_lines
  for each row execute function private.refuse_issued_credit_note_line_changes();

/*
  Creating a credit note is one statement: header and lines together, under
  a lock on the invoice, with the cap checked against everything already
  credited on that invoice. Two admins crediting the same invoice at once
  serialise on the invoice row, so the second sees the first's lines.

  The cap is compared on net amounts per VAT rate, which needs no VAT
  arithmetic at all: a line's net is quantity x unit price, rounded to the
  cent exactly as lib/money rounds it (half away from zero). The frozen
  totals the application hands in are checked for consistency with the
  lines at the net level too; the VAT figure itself is the application's,
  by design (see the header of this file).

  Only an invoice the customer actually received can be credited: one that
  was never sent is cancelled instead (see lib/admin/invoices/finalize).
*/
create or replace function public.create_credit_note(
  p_invoice_id          uuid,
  p_reason              text,
  p_issue_date          date,
  p_lines               jsonb,
  p_subtotal_cents      integer,
  p_vat_cents           integer,
  p_total_cents         integer,
  p_source              text default 'manual',
  p_recurring_service_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice      public.invoices%rowtype;
  v_id           uuid := gen_random_uuid();
  v_line         jsonb;
  v_position     integer := 0;
  v_net          integer := 0;
  v_rate         integer;
  v_invoice_net  integer;
  v_credited_net integer;
  v_new_net      integer;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Onbekende factuur.' using errcode = 'P0002';
  end if;
  if v_invoice.sent_at is null then
    raise exception 'Factuur % is nooit verstuurd; een niet-verstuurde factuur annuleer je in plaats van hem te crediteren.', v_invoice.number_value
      using errcode = 'check_violation';
  end if;
  if v_invoice.status = 'cancelled' then
    raise exception 'Factuur % is geannuleerd en kan niet worden gecrediteerd.', v_invoice.number_value
      using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Een creditnota heeft minstens één regel.' using errcode = 'check_violation';
  end if;

  insert into public.credit_notes (
    id, customer_id, invoice_id, number_value, number_provisional, status, reason, issue_date,
    source, recurring_service_id,
    customer_company_name, customer_contact_name, customer_email, customer_street,
    customer_postal_code, customer_city, customer_country, customer_kvk_number, customer_vat_number,
    subtotal_cents, vat_cents, total_cents, created_by
  ) values (
    v_id, v_invoice.customer_id, v_invoice.id, 'CN-CONCEPT-' || upper(left(replace(v_id::text, '-', ''), 8)), true, 'issued',
    btrim(p_reason), p_issue_date,
    p_source, p_recurring_service_id,
    v_invoice.customer_company_name, v_invoice.customer_contact_name, v_invoice.customer_email, v_invoice.customer_street,
    v_invoice.customer_postal_code, v_invoice.customer_city, v_invoice.customer_country, v_invoice.customer_kvk_number, v_invoice.customer_vat_number,
    p_subtotal_cents, p_vat_cents, p_total_cents, auth.uid()
  );

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.credit_note_lines (credit_note_id, position, description, quantity_hundredths, unit_price_cents, vat_rate)
    values (
      v_id, v_position,
      coalesce(v_line->>'description', ''),
      (v_line->>'quantityHundredths')::integer,
      (v_line->>'unitPriceCents')::integer,
      (v_line->>'vatRate')::integer
    );
    v_position := v_position + 1;
  end loop;

  /* The frozen subtotal must be the lines' own sum. */
  select coalesce(sum(round(quantity_hundredths * unit_price_cents / 100.0))::integer, 0) into v_net
  from public.credit_note_lines where credit_note_id = v_id;
  if v_net <> p_subtotal_cents or v_net <= 0 then
    raise exception 'Het subtotaal van de creditnota komt niet overeen met de regels.' using errcode = 'check_violation';
  end if;

  /* Cap: per VAT rate, credited net (all notes on this invoice) <= invoiced net. */
  for v_rate in select distinct vat_rate from public.credit_note_lines where credit_note_id = v_id loop
    select coalesce(sum(round(quantity_hundredths * unit_price_cents / 100.0))::integer, 0) into v_invoice_net
    from public.invoice_lines where invoice_id = v_invoice.id and vat_rate = v_rate;
    select coalesce(sum(round(l.quantity_hundredths * l.unit_price_cents / 100.0))::integer, 0) into v_credited_net
    from public.credit_note_lines l
    join public.credit_notes n on n.id = l.credit_note_id
    where n.invoice_id = v_invoice.id and l.vat_rate = v_rate and n.id <> v_id;
    select coalesce(sum(round(quantity_hundredths * unit_price_cents / 100.0))::integer, 0) into v_new_net
    from public.credit_note_lines where credit_note_id = v_id and vat_rate = v_rate;
    if v_credited_net + v_new_net > v_invoice_net then
      raise exception 'Er wordt meer gecrediteerd dan factuur % bij % %% btw in rekening bracht (al gecrediteerd: % cent, deze creditnota: % cent, gefactureerd: % cent).',
        v_invoice.number_value, v_rate, v_credited_net, v_new_net, v_invoice_net
        using errcode = 'check_violation';
    end if;
  end loop;

  return v_id;
end;
$$;
comment on function public.create_credit_note(uuid, text, date, jsonb, integer, integer, integer, text, uuid) is
  'Creates a credit note with its lines in one statement, under a lock on the invoice, refusing to credit more than the invoice charged per VAT rate.';
revoke all on function public.create_credit_note(uuid, text, date, jsonb, integer, integer, integer, text, uuid) from public, anon;
grant execute on function public.create_credit_note(uuid, text, date, jsonb, integer, integer, integer, text, uuid) to authenticated;

/* The number, exactly once; a second call returns the number already taken. */
create or replace function public.begin_credit_note_issue(p_credit_note_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_number     text;
  v_finalizing timestamptz;
  v_issue_date date;
begin
  select number_value, finalizing_at, issue_date into v_number, v_finalizing, v_issue_date
  from public.credit_notes where id = p_credit_note_id for update;
  if not found then
    raise exception 'Onbekende creditnota.' using errcode = 'P0002';
  end if;
  if v_finalizing is not null then
    return v_number;
  end if;
  v_number := private.next_credit_note_number(v_issue_date);
  update public.credit_notes
     set number_value = v_number, number_provisional = false, finalizing_at = now()
   where id = p_credit_note_id;
  return v_number;
end;
$$;
revoke all on function public.begin_credit_note_issue(uuid) from public, anon;
grant execute on function public.begin_credit_note_issue(uuid) to authenticated;

/* The stored PDF, exactly once; a different artifact is refused. */
create or replace function public.complete_credit_note_issue(
  p_credit_note_id uuid,
  p_path   text,
  p_sha256 text,
  p_bytes  integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_number     text;
  v_finalizing timestamptz;
  v_issued     timestamptz;
  v_path       text;
  v_sha256     text;
  v_bytes      integer;
begin
  select number_value, finalizing_at, issued_at, document_path, document_sha256, document_bytes
    into v_number, v_finalizing, v_issued, v_path, v_sha256, v_bytes
  from public.credit_notes where id = p_credit_note_id for update;
  if not found then
    raise exception 'Onbekende creditnota.' using errcode = 'P0002';
  end if;
  if v_finalizing is null then
    raise exception 'Creditnota % heeft nog geen definitief nummer.', v_number using errcode = 'check_violation';
  end if;
  if v_issued is not null then
    if p_path is distinct from v_path or p_sha256 is distinct from v_sha256 or p_bytes is distinct from v_bytes then
      raise exception 'Creditnota % heeft al een definitieve PDF (%); een afwijkend document wordt niet vastgelegd.', v_number, v_sha256
        using errcode = 'check_violation';
    end if;
    return jsonb_build_object('number', v_number, 'path', v_path, 'sha256', v_sha256, 'bytes', v_bytes, 'adopted', true);
  end if;
  update public.credit_notes
     set issued_at = now(), document_path = p_path, document_sha256 = p_sha256, document_bytes = p_bytes, document_generated_at = now()
   where id = p_credit_note_id and issued_at is null;
  return jsonb_build_object('number', v_number, 'path', p_path, 'sha256', p_sha256, 'bytes', p_bytes, 'adopted', false);
end;
$$;
revoke all on function public.complete_credit_note_issue(uuid, text, text, integer) from public, anon;
grant execute on function public.complete_credit_note_issue(uuid, text, text, integer) to authenticated;

-- --------------------------------------------------------------- refunds

create table public.refunds (
  id             uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null,
  invoice_id     uuid not null,
  customer_id    uuid not null references public.customers (id) on delete restrict,
  amount_cents   integer not null check (amount_cents > 0),
  currency       text not null default 'EUR' check (currency = 'EUR'),
  method         text not null check (method in ('mollie', 'manual')),
  /* pending / processing: Mollie has it; refunded: money went back;
     failed / canceled: it did not. A manual refund is refunded on entry. */
  status         text not null check (status in ('pending', 'processing', 'refunded', 'failed', 'canceled')),
  /* The local payment that is refunded, for a Mollie refund. */
  payment_id          uuid references public.payments (id) on delete restrict,
  provider            text check (provider in ('mollie')),
  provider_payment_id text,
  provider_refund_id  text,
  /* Sent to Mollie as the Idempotency-Key and in the refund's metadata, so
     a refund Mollie made for us is recognisable afterwards. */
  idempotency_key text not null,
  /* Taken before Mollie is called; cleared when its answer is written. A
     claim older than a few minutes without an answer is an attempt that
     died in between, and is recovered by asking Mollie, never by a second
     refund. */
  claimed_at     timestamptz,
  settled_at     timestamptz,
  settled_by     uuid,
  note           text not null default '',
  failure_reason text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint refunds_note_same_customer
    foreign key (credit_note_id, customer_id) references public.credit_notes (id, customer_id) on delete restrict,
  constraint refunds_invoice_same_customer
    foreign key (invoice_id, customer_id) references public.invoices (id, customer_id) on delete restrict,
  constraint refunds_mollie_has_payment
    check (method <> 'mollie' or (payment_id is not null and provider = 'mollie' and provider_payment_id is not null)),
  constraint refunds_manual_is_settled
    check (method <> 'manual' or (status = 'refunded' and settled_at is not null and provider_refund_id is null)),
  constraint refunds_refunded_has_settled_at
    check ((status = 'refunded') = (settled_at is not null)),
  constraint refunds_idempotency_key_unique unique (idempotency_key)
);
comment on table public.refunds is 'Money returned to a customer against a credit note; via Mollie or recorded by hand.';
comment on column public.refunds.claimed_at is 'Set before Mollie is asked; a Mollie refund without an id and a claim older than a few minutes is recovered, never repeated.';

create unique index refunds_provider_refund_unique
  on public.refunds (provider, provider_refund_id) where provider_refund_id is not null;
/* At most one Mollie refund being created per credit note: a double click
   gets 23505 and is told the first one is in progress. */
create unique index refunds_in_flight_unique
  on public.refunds (credit_note_id) where method = 'mollie' and provider_refund_id is null and status = 'pending';
create index refunds_note_idx on public.refunds (credit_note_id, customer_id);
create index refunds_invoice_idx on public.refunds (invoice_id, customer_id);
create index refunds_customer_idx on public.refunds (customer_id, created_at desc);

create trigger refunds_set_updated_at before update on public.refunds
  for each row execute function private.set_updated_at();

/*
  The caps, checked at every insert and every change of amount or status,
  and all of them under one lock: the invoice row. Every refund of an
  invoice -- whichever of its credit notes it belongs to -- takes that lock
  first, so two refunds written at the same moment are checked one after
  the other against a sum that includes the other one. Locking the credit
  note alone would let two notes of one invoice be refunded past what the
  invoice was paid, each within its own cap.

    1. the credit note is a document: numbered and with its PDF stored.
       A note whose issue did not finish corrects nothing and refunds
       nothing;
    2. sum of live refunds on the note            <= the note's total;
    3. sum of live refunds on the invoice, over   <= sum of the totals of
       every credit note of that invoice             the invoice's issued notes;
    4. sum of live refunds on the invoice         <= what was actually paid
                                                     on the invoice.

  "Live" is every status that has moved money or still may: pending,
  processing, refunded. A failed or cancelled refund moved nothing and
  frees its amount. A Mollie refund that is pending counts in full the
  moment its local row exists -- before Mollie has answered -- because that
  row is the claim, and a claim that did not reserve its amount would let
  a second one slip under the cap while the first is in flight.
*/
create or replace function private.refuse_excess_refund()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice_id     uuid;
  v_note_total     integer;
  v_note_issued    boolean;
  v_number         text;
  v_on_note        integer;
  v_issued_credits integer;
  v_paid           integer;
  v_on_invoice     integer;
begin
  if new.status in ('failed', 'canceled') then
    return new;
  end if;

  /* One lock for the whole invoice; every refund of it queues here. */
  select id into v_invoice_id from public.invoices where id = new.invoice_id for update;
  if v_invoice_id is null then
    raise exception 'Onbekende factuur.' using errcode = 'P0002';
  end if;

  select total_cents, (issued_at is not null and document_path is not null), number_value
    into v_note_total, v_note_issued, v_number
  from public.credit_notes where id = new.credit_note_id and invoice_id = new.invoice_id;
  if v_note_total is null then
    raise exception 'De creditnota hoort niet bij deze factuur.' using errcode = 'check_violation';
  end if;
  if not v_note_issued then
    raise exception 'Creditnota % is nog niet afgerond; er kan pas worden terugbetaald als het document bestaat.', v_number
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(amount_cents), 0) into v_on_note
  from public.refunds where credit_note_id = new.credit_note_id and id <> new.id and status not in ('failed', 'canceled');
  if v_on_note + new.amount_cents > v_note_total then
    raise exception 'Er wordt meer terugbetaald (% cent) dan creditnota % crediteert (% cent).',
      v_on_note + new.amount_cents, v_number, v_note_total using errcode = 'check_violation';
  end if;

  select coalesce(sum(amount_cents), 0) into v_on_invoice
  from public.refunds where invoice_id = new.invoice_id and id <> new.id and status not in ('failed', 'canceled');

  select coalesce(sum(total_cents), 0) into v_issued_credits
  from public.credit_notes where invoice_id = new.invoice_id and issued_at is not null and document_path is not null;
  if v_on_invoice + new.amount_cents > v_issued_credits then
    raise exception 'Er wordt meer terugbetaald (% cent) dan er op de factuur is gecrediteerd (% cent).',
      v_on_invoice + new.amount_cents, v_issued_credits using errcode = 'check_violation';
  end if;

  select coalesce(sum(amount_cents), 0) into v_paid
  from public.payments where invoice_id = new.invoice_id and status = 'paid';
  if v_on_invoice + new.amount_cents > v_paid then
    raise exception 'Er wordt meer terugbetaald (% cent) dan er op de factuur is betaald (% cent).',
      v_on_invoice + new.amount_cents, v_paid using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger refunds_refuse_excess
  before insert or update of amount_cents, status, credit_note_id, invoice_id on public.refunds
  for each row execute function private.refuse_excess_refund();

-- ----------------------------------------------------------- rights

alter table public.credit_notes enable row level security;
alter table public.credit_notes force row level security;
alter table public.credit_note_lines enable row level security;
alter table public.credit_note_lines force row level security;
alter table public.refunds enable row level security;
alter table public.refunds force row level security;

revoke all on table public.credit_notes from anon, authenticated;
revoke all on table public.credit_note_lines from anon, authenticated;
revoke all on table public.refunds from anon, authenticated;
grant select, insert, update on table public.credit_notes to authenticated;
grant select, insert on table public.credit_note_lines to authenticated;
grant select, insert, update on table public.refunds to authenticated;

create policy credit_notes_admin_all on public.credit_notes
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy credit_note_lines_admin_all on public.credit_note_lines
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy refunds_admin_all on public.refunds
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- ------------------------------------------------------ communications

alter table public.customer_communications
  drop constraint customer_communications_category_check;
alter table public.customer_communications
  add constraint customer_communications_category_check check (category in (
    'quote_sent',
    'invoice_sent',
    'invoice_activation_sent',
    'recurring_invoice_prenotification',
    'recurring_invoice_settled',
    'direct_debit_activation',
    'payment_reminder_first',
    'payment_reminder_second',
    'payment_final_notice',
    'recurring_price_change',
    'recurring_cancellation',
    'credit_note_sent'
  ));

-- ------------------------------------------- the old manual marker

/*
  `credit_settled_at` / `credit_settled_by` recorded, by hand, that the
  credit for a cancelled service's last term had been dealt with outside the
  system. That fact now follows from the credit note and its refunds. The
  columns are dropped by the next migration, applied only once the code
  that no longer reads them is live: this migration goes first, and the
  code that was running at that moment still selects those columns.
*/
