-- A sent quote becomes a document: frozen, stored once, under a known set of
-- terms, and replaced only by a new quote that says which one it replaces.
--
-- Until now a quote was a proposal and nothing was frozen around it: `send`
-- took the number, rendered a PDF into the mail and set `sent_at`, and the
-- row stayed editable afterwards. For a quote the customer only ever reads
-- in their inbox that was tolerable. For a quote the customer will later be
-- asked to accept, it is not: "what you accepted" has to be a file with a
-- hash, under terms that can be named, and a row that cannot have moved
-- since.
--
-- So sending a quote now follows the shape invoices already have (see
-- `invoice_finalization`), with one difference in where the freeze starts:
--
--   1. `begin_quote_issue` takes the number and snapshots the set of general
--      terms that applies. From that moment the row is frozen.
--   2. The application renders the PDF once, hashes it and stores it in the
--      `invoice-documents` bucket under a path that contains its own hash.
--   3. `complete_quote_issue` records path, hash and size. Once.
--   4. The mail goes out with that stored file, and `sent_at` is written
--      after the mailer accepted it. Once: a resend reads the same file and
--      moves nothing.
--
-- The freeze keys on `number_provisional`, not on `sent_at`: the PDF is
-- rendered from the row between steps 1 and 3, and a mail that fails after
-- step 3 is retried from the stored file. The row may not move from the
-- moment the number exists, exactly as for invoices.
--
-- A quote that has to change after it was sent is not edited; it is
-- superseded by a new quote that names it in `supersedes_quote_id`. There is
-- deliberately no 'superseded' status: "replaced" is the existence of a sent
-- successor, and a status that said the same thing would be a second place
-- for the fact to be wrong.

-- The artifact, the terms and the chain.
alter table public.quotes
  add column document_path                text,
  add column document_sha256              text,
  add column document_bytes               integer,
  add column document_generated_at        timestamptz,
  add column terms_edition                text check (terms_edition ~ '^\d{4}$'),
  add column terms_published_on           date,
  add column supersedes_quote_id          uuid,
  add column legacy_sent_without_document boolean not null default false;

comment on column public.quotes.document_path is
  'Object path of the PDF that was sent, in the invoice-documents bucket. Written once, with the other document_* columns.';
comment on column public.quotes.document_sha256 is
  'SHA-256 of that exact file, in lowercase hex. Verified before the file is mailed or shown.';
comment on column public.quotes.terms_edition is
  'The set of general terms this quote was issued under, as docs/legal/voorwaarden registers it; snapshotted when the number was taken and never moved.';
comment on column public.quotes.terms_published_on is
  'Publication date of that set, as the register names it.';
comment on column public.quotes.supersedes_quote_id is
  'The sent quote this one replaces, when it is a new version of one. Set at insert, never changed; at most one successor per quote.';
comment on column public.quotes.legacy_sent_without_document is
  'True only for quotes sent before documents were stored. Set by the migration that introduced the artifact, never by the application; such a quote cannot be resent and is not a document.';

/*
  The quote that was sent under the old flow. Its PDF was rendered into a mail
  and nowhere else, so there is nothing to record: generating a PDF today and
  filing it as the document the customer received last month is exactly the
  claim this migration exists to make honest. It is marked for what it is,
  and the send flow refuses to mail it again -- the way forward is a new
  version, made from it.
*/
update public.quotes
   set legacy_sent_without_document = true
 where sent_at is not null
   and document_path is null;

/* An artifact is four facts or none of them, and a hash is a hash. */
alter table public.quotes
  add constraint quotes_document_complete check (
    (document_path is null and document_sha256 is null and document_bytes is null and document_generated_at is null)
    or (
      document_path is not null
      and document_sha256 ~ '^[0-9a-f]{64}$'
      and document_bytes > 0
      and document_generated_at is not null
    )
  );

/* The set of terms is named by both columns or by neither. */
alter table public.quotes
  add constraint quotes_terms_set_complete check (
    (terms_edition is null) = (terms_published_on is null)
  );

/*
  The lifecycle, stated once. Nothing has a document that was not numbered,
  nothing has a document without the terms it was issued under, and nothing
  was sent that was not numbered. A sent quote has its document -- or is the
  one that predates documents.
*/
alter table public.quotes
  add constraint quotes_document_needs_number check (document_path is null or not number_provisional);

alter table public.quotes
  add constraint quotes_document_has_terms check (document_path is null or terms_edition is not null);

alter table public.quotes
  add constraint quotes_sent_after_number check (sent_at is null or not number_provisional);

alter table public.quotes
  add constraint quotes_sent_has_document check (
    sent_at is null or document_path is not null or legacy_sent_without_document
  );

/* The marker describes exactly one situation, and cannot be borrowed for another. */
alter table public.quotes
  add constraint quotes_legacy_marker_shape check (
    not legacy_sent_without_document or (sent_at is not null and document_path is null)
  );

/*
  A concept is a concept. The statuses past 'draft' are the flow's to give:
  'sent' comes from the mailer accepting a numbered document, and a decision
  on a quote nobody received is not a decision. Stated once, on the send:
  `sent_at` already implies a number (above), so a status past 'draft' means
  the customer has the quote.

  A quote that was never mailed is a concept, whatever the old status
  dropdown was set to -- a concept with a provisional number, or a numbered
  one whose mail never left. It is recorded as one before the rule is stated.
  Production holds no such row (checked before this was written); the
  statement is here so the rule is still true in an environment that has some.
*/
update public.quotes
   set status = 'draft'
 where sent_at is null
   and status <> 'draft';

alter table public.quotes
  add constraint quotes_status_follows_send check (status = 'draft' or sent_at is not null);

/*
  The chain. A successor points at its predecessor with the same customer, so
  a quote can never be "replaced" by one for somebody else; `restrict` keeps
  a replaced quote from disappearing from under its successor. One successor
  per quote: two admins making a new version at the same moment cannot both
  land, and a chain never forks.
*/
alter table public.quotes
  add constraint quotes_supersedes_same_customer
    foreign key (supersedes_quote_id, customer_id) references public.quotes (id, customer_id)
    on delete restrict;

create unique index quotes_supersedes_unique
  on public.quotes (supersedes_quote_id) where supersedes_quote_id is not null;

create index quotes_document_idx on public.quotes (document_path) where document_path is not null;

-- The next number in the quote series, composed and not written.
--
-- Split off from the old `assign_quote_number` the way `next_invoice_number`
-- was, so that issuing can write the number together with the terms.
create or replace function private.next_quote_number(p_issue_date date)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_year     integer := extract(year from p_issue_date)::integer;
  v_sequence integer := private.next_document_sequence('quote', v_year);
begin
  return 'YM-O-' || v_year::text || '-' || lpad(v_sequence::text, 6, '0');
end;
$$;

revoke all on function private.next_quote_number(date) from public, anon;
grant execute on function private.next_quote_number(date) to authenticated;

-- Step one: the number and the terms, in one statement.
--
-- `for update` makes a second call safe: it waits, then sees a row that is
-- already numbered and returns the number it has. A double click, a retried
-- send and two tabs all get the same number, and the counter moves once.
--
-- The terms are the application's to name -- lib/content/terms.ts is the
-- legal source and the database has no copy of it -- so they come in as
-- arguments, and are written only while the row has none. A numbered quote
-- that reaches this with a set already recorded keeps that set, whatever is
-- offered: the set a quote was issued under does not follow a later edition.
--
-- SECURITY INVOKER: the caller's own rights apply, so the admin policies on
-- quotes and on the counter decide. Anon holds no rights on either.
create or replace function public.begin_quote_issue(
  p_quote_id          uuid,
  p_terms_edition     text,
  p_terms_published_on date
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_number      text;
  v_provisional boolean;
  v_legacy      boolean;
  v_status      text;
  v_edition     text;
  v_issue_date  date;
begin
  if p_terms_edition is null or p_terms_edition !~ '^\d{4}$' or p_terms_published_on is null then
    raise exception 'De toepasselijke voorwaardenversie ontbreekt; zonder die wordt geen offerte uitgegeven.'
      using errcode = 'check_violation';
  end if;

  select number_value, number_provisional, legacy_sent_without_document, status, terms_edition, issue_date
    into v_number, v_provisional, v_legacy, v_status, v_edition, v_issue_date
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'Onbekende offerte.' using errcode = 'P0002';
  end if;

  if v_legacy then
    raise exception
      'Offerte % is verzonden voordat documenten werden opgeslagen en wordt niet opnieuw uitgegeven; maak een nieuwe versie.',
      v_number
      using errcode = 'check_violation';
  end if;

  if v_status <> 'draft' and v_edition is not null then
    -- Numbered, issued and past 'draft': there is nothing left for this step.
    return v_number;
  end if;

  if v_provisional then
    v_number := private.next_quote_number(v_issue_date);

    update public.quotes
       set number_value       = v_number,
           number_provisional = false,
           terms_edition      = p_terms_edition,
           terms_published_on = p_terms_published_on
     where id = p_quote_id;

    return v_number;
  end if;

  /*
    Already numbered. A retry of an interrupted send finds its terms recorded
    and changes nothing. A quote numbered under the old flow and never mailed
    has no set yet; its first send under this flow is when it gets one.
  */
  if v_edition is null then
    update public.quotes
       set terms_edition      = p_terms_edition,
           terms_published_on = p_terms_published_on
     where id = p_quote_id;
  end if;

  return v_number;
end;
$$;

comment on function public.begin_quote_issue(uuid, text, date) is
  'Numbers a quote and records the set of general terms it is issued under, in one statement; from then on the row is frozen. A second call returns the number already taken and leaves the terms alone.';

revoke all on function public.begin_quote_issue(uuid, text, date) from public, anon;
grant execute on function public.begin_quote_issue(uuid, text, date) to authenticated;

-- Step two: the document exists.
--
-- Recording the file is one statement, and it happens once. Two callers can
-- arrive here having both rendered; `for update` queues them, and the second
-- finds a document already recorded. It does not write: the first artifact
-- is the quote's artifact, for good. It is handed that artifact, so it
-- continues with the file that exists rather than the one it made.
--
-- Arguments that differ from a recorded document are refused outright. The
-- upload never overwrites, so a second caller that adopted the stored object
-- hashed those very bytes and matches by construction; a mismatch means
-- something else is going on, and the quote keeps the document it has.
create or replace function public.complete_quote_issue(
  p_quote_id uuid,
  p_path     text,
  p_sha256   text,
  p_bytes    integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_number      text;
  v_provisional boolean;
  v_legacy      boolean;
  v_path        text;
  v_sha256      text;
  v_bytes       integer;
begin
  select number_value, number_provisional, legacy_sent_without_document, document_path, document_sha256, document_bytes
    into v_number, v_provisional, v_legacy, v_path, v_sha256, v_bytes
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'Onbekende offerte.' using errcode = 'P0002';
  end if;

  if v_provisional then
    raise exception 'Offerte % heeft nog geen definitief nummer.', v_number using errcode = 'check_violation';
  end if;

  if v_legacy then
    raise exception
      'Offerte % is verzonden voordat documenten werden opgeslagen; er wordt geen document achteraf aan toegekend.',
      v_number
      using errcode = 'check_violation';
  end if;

  if v_path is not null then
    if p_path is distinct from v_path
       or p_sha256 is distinct from v_sha256
       or p_bytes is distinct from v_bytes
    then
      raise exception
        'Offerte % heeft al een definitieve PDF (%); een afwijkend document wordt niet vastgelegd.',
        v_number, v_sha256
        using errcode = 'check_violation';
    end if;

    return jsonb_build_object(
      'number', v_number, 'path', v_path, 'sha256', v_sha256, 'bytes', v_bytes, 'adopted', true
    );
  end if;

  update public.quotes
     set document_path         = p_path,
         document_sha256       = p_sha256,
         document_bytes        = p_bytes,
         document_generated_at = now()
   where id = p_quote_id
     and document_path is null;

  return jsonb_build_object(
    'number', v_number, 'path', p_path, 'sha256', p_sha256, 'bytes', p_bytes, 'adopted', false
  );
end;
$$;

comment on function public.complete_quote_issue(uuid, text, text, integer) is
  'Records the stored PDF of a numbered quote, in one statement and once. A second call writes nothing and returns the artifact the quote already has; a different one is refused.';

revoke all on function public.complete_quote_issue(uuid, text, text, integer) from public, anon;
grant execute on function public.complete_quote_issue(uuid, text, text, integer) to authenticated;

/*
  The old entry point, `assign_quote_number`, is retired in the migration that
  follows this one (`drop_assign_quote_number`). Nothing calls it any more:
  taking a number is now the first half of issuing a document, and a caller
  that numbered a quote without recording terms or a file would leave exactly
  the half-finished quote this design is built to avoid.
*/

/*
  The freeze.

  From the moment a quote is numbered, what it says is fixed. What stays
  allowed, and why:

    terms_*            written once by step one, on a row that has none.
    document_*         written once by step two, on a row that has none.
    sent_at            written once, after the mailer accepted the first
                       send. A resend mails the same file and moves nothing;
                       the communication log holds every send.
    status             the flow moves draft -> sent, and a sent quote is later
                       accepted, rejected or expired. Back to 'draft' is
                       refused: a number was spent and a file exists.
    recipient_email    where the latest send went; a customer whose address
                       changed is mailed at the new one.
    updated_at         written by the trigger that keeps it honest.

  Two columns are fixed on every quote, concept or not: which quote this one
  supersedes is said at insert and never again, and the legacy marker is the
  migration's to set and nobody else's.
*/
create or replace function private.refuse_frozen_quote_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.supersedes_quote_id is distinct from old.supersedes_quote_id then
    raise exception
      'Welke offerte % opvolgt ligt vast sinds het aanmaken.',
      old.number_value
      using errcode = 'check_violation';
  end if;

  if new.legacy_sent_without_document is distinct from old.legacy_sent_without_document then
    raise exception
      'De herkomstmarkering van offerte % wordt niet gewijzigd.',
      old.number_value
      using errcode = 'check_violation';
  end if;

  -- Not numbered yet: still a concept, still editable.
  if old.number_provisional then
    return new;
  end if;

  if new.number_value is distinct from old.number_value
     or new.number_provisional is distinct from old.number_provisional
  then
    raise exception
      'Offerte % heeft al een definitief nummer; dat ligt vast.',
      old.number_value
      using errcode = 'check_violation';
  end if;

  if old.terms_edition is not null and (
       new.terms_edition      is distinct from old.terms_edition
    or new.terms_published_on is distinct from old.terms_published_on
  ) then
    raise exception
      'Offerte % is uitgegeven onder voorwaarden %; die versie ligt vast.',
      old.number_value, old.terms_edition
      using errcode = 'check_violation';
  end if;

  /*
    A quote sent before terms were recorded has no set, and is not given one
    after the fact: which set the customer was offered is not in the data, and
    writing today's set there would claim otherwise. The same goes for its
    document, which the marker's own constraint already refuses.
  */
  if old.legacy_sent_without_document and (
       new.terms_edition      is distinct from old.terms_edition
    or new.terms_published_on is distinct from old.terms_published_on
  ) then
    raise exception
      'Offerte % is verzonden voordat de voorwaardenversie werd vastgelegd; die wordt niet achteraf ingevuld.',
      old.number_value
      using errcode = 'check_violation';
  end if;

  if old.document_path is not null and (
       new.document_path         is distinct from old.document_path
    or new.document_sha256       is distinct from old.document_sha256
    or new.document_bytes        is distinct from old.document_bytes
    or new.document_generated_at is distinct from old.document_generated_at
  ) then
    raise exception
      'Offerte % heeft een definitieve PDF; het document ervan ligt vast.',
      old.number_value
      using errcode = 'check_violation';
  end if;

  if old.sent_at is not null and new.sent_at is distinct from old.sent_at then
    raise exception
      'Offerte % is verzonden op %; dat moment ligt vast.',
      old.number_value, old.sent_at
      using errcode = 'check_violation';
  end if;

  /*
    A numbered quote may still *be* a concept by status -- between taking the
    number and the mailer accepting the first send -- but it can never become
    one again once it moved on.
  */
  if new.status = 'draft' and old.status <> 'draft' then
    raise exception
      'Offerte % is al definitief en kan geen concept meer worden.',
      old.number_value
      using errcode = 'check_violation';
  end if;

  if new.customer_id            is distinct from old.customer_id
     or new.customer_company_name is distinct from old.customer_company_name
     or new.customer_contact_name is distinct from old.customer_contact_name
     or new.customer_email        is distinct from old.customer_email
     or new.customer_street       is distinct from old.customer_street
     or new.customer_postal_code  is distinct from old.customer_postal_code
     or new.customer_city         is distinct from old.customer_city
     or new.customer_country      is distinct from old.customer_country
     or new.customer_kvk_number   is distinct from old.customer_kvk_number
     or new.customer_vat_number   is distinct from old.customer_vat_number
     or new.project_id            is distinct from old.project_id
     or new.issue_date            is distinct from old.issue_date
     or new.valid_until           is distinct from old.valid_until
     or new.subject               is distinct from old.subject
     or new.intro                 is distinct from old.intro
     or new.notes                 is distinct from old.notes
     or new.created_at            is distinct from old.created_at
  then
    raise exception
      'Offerte % is al definitief; de inhoud ervan ligt vast. Een wijziging is een nieuwe versie.',
      old.number_value
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function private.refuse_frozen_quote_changes() is
  'Freezes a quote from the moment it is numbered; terms, document and first send are each written once, and the chain link never changes.';

create trigger quotes_refuse_frozen_changes
  before update on public.quotes
  for each row execute function private.refuse_frozen_quote_changes();

/*
  A quote begins as a concept, whatever is handed in: provisional number, no
  send, no document, no terms, no legacy marker. The flow writes each of
  those at its own moment, and a row inserted with them already set would be
  a document nobody issued.

  The chain is checked here too. A successor is made from a predecessor that
  was really sent and was not accepted -- an accepted quote is an agreement,
  and what follows an agreement is not a new version of it. The composite
  foreign key already keeps the two with one customer; the check repeats it
  so the refusal has a sentence instead of a constraint name. A new row
  cannot be anyone's predecessor yet, so a chain cannot close on itself.
*/
create or replace function private.check_new_quote()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_predecessor public.quotes%rowtype;
begin
  if not new.number_provisional
     or new.sent_at is not null
     or new.document_path is not null
     or new.terms_edition is not null
     or new.legacy_sent_without_document
  then
    raise exception 'Een nieuwe offerte begint als concept: zonder nummer, document, voorwaardenversie of verzending.'
      using errcode = 'check_violation';
  end if;

  if new.supersedes_quote_id is null then
    return new;
  end if;

  select * into v_predecessor from public.quotes where id = new.supersedes_quote_id for share;

  if not found then
    raise exception 'De offerte die wordt opgevolgd bestaat niet.' using errcode = 'foreign_key_violation';
  end if;
  if v_predecessor.customer_id <> new.customer_id then
    raise exception 'De offerte die wordt opgevolgd hoort bij een andere klant.' using errcode = 'check_violation';
  end if;
  if v_predecessor.sent_at is null then
    raise exception 'Offerte % is nog niet verzonden; een nieuwe versie maak je van een verzonden offerte.',
      v_predecessor.number_value
      using errcode = 'check_violation';
  end if;
  if v_predecessor.status = 'accepted' then
    raise exception 'Offerte % is geaccepteerd; een geaccepteerde offerte krijgt geen nieuwe versie.',
      v_predecessor.number_value
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function private.check_new_quote() is
  'A new quote is a concept; when it supersedes another, that one is a sent quote of the same customer that was not accepted.';

create trigger quotes_check_new
  before insert on public.quotes
  for each row execute function private.check_new_quote();

/*
  A numbered quote is a record and stays. Its number was spent, its file
  exists, and a successor may point at it. Only a concept can be removed.
*/
create or replace function private.refuse_frozen_quote_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not old.number_provisional then
    raise exception
      'Offerte % is definitief en wordt niet verwijderd.',
      old.number_value
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger quotes_refuse_frozen_delete
  before delete on public.quotes
  for each row execute function private.refuse_frozen_quote_delete();

/*
  The lines are the quote's figures, so they freeze with it, from the same
  moment -- the PDF is rendered from them. Replacing them is how
  `save_quote_lines` works, which is exactly the operation this has to stop
  once the number exists.
*/
create or replace function private.refuse_frozen_quote_line_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote_id    uuid := coalesce(new.quote_id, old.quote_id);
  v_provisional boolean;
  v_number      text;
begin
  /*
    A line belongs to one quote for good. Moving it would take a figure out
    of a frozen document while only the destination was looked at.
  */
  if tg_op = 'UPDATE' and new.quote_id is distinct from old.quote_id then
    raise exception 'Een offerteregel hoort bij één offerte en verhuist niet.' using errcode = 'check_violation';
  end if;

  select number_provisional, number_value into v_provisional, v_number
  from public.quotes where id = v_quote_id;

  if v_provisional is not null and not v_provisional then
    raise exception
      'Offerte % is al definitief; de regels ervan liggen vast. Een wijziging is een nieuwe versie.',
      v_number
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function private.refuse_frozen_quote_line_changes() is
  'Freezes the lines of a quote once it has been numbered.';

create trigger quote_lines_refuse_frozen_changes
  before insert or update or delete on public.quote_lines
  for each row execute function private.refuse_frozen_quote_line_changes();
