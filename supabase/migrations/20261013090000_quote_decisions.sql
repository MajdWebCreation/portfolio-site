-- A decision on a quote: accepted or rejected, once, on record for good.
--
-- Until now "accepted" was a value in a dropdown: the admin set quotes.status
-- and nothing remembered by whom, when, on which document or under which
-- terms -- and the same dropdown could set it back. Now that a customer can
-- accept a quote in the portal, the acceptance is evidence, and evidence is a
-- record, not a status:
--
--   quote_decisions                  one row per decided quote, never changed
--                                    or removed: the decision, its source,
--                                    who made or recorded it, and a copy of
--                                    exactly what was decided on -- the hash
--                                    of the stored PDF and the set of terms
--                                    the quote was issued under.
--   portal_decide_quote(...)         the customer's decision, from the portal.
--   admin_record_quote_decision(...) a decision that reached YM Creations by
--                                    mail, phone or a signed copy, recorded
--                                    by an admin. Same table, same snapshot.
--   portal_quote_decision(...)       what the portal shows about it.
--   quote_decision_notifications     the mails a portal decision produces,
--                                    tracked apart so the decision itself
--                                    never needs an update.
--
-- quotes.status stays: the admin lists, the funnel and the service agreement
-- read it. But 'accepted' and 'rejected' are now written by exactly one
-- thing -- inserting a decision -- and by nothing else: a trigger on quotes
-- refuses either value without the matching decision, and refuses every
-- change once a quote is decided. So "status accepted, no decision" cannot
-- exist, through this application, the REST API or a hand-written UPDATE.
--
-- No IP address, no user agent, no fingerprint: the actor is the signed-in
-- account (auth.uid() and the address of that account), nothing more.

-- ---------------------------------------------------------------- the record

create table public.quote_decisions (
  id                     uuid primary key default gen_random_uuid(),
  quote_id               uuid not null,
  customer_id            uuid not null,
  decision               text not null check (decision in ('accepted', 'rejected')),
  source                 text not null check (source in ('portal', 'email', 'phone', 'signed', 'other')),
  /* The customer's own words, when they gave a reason for rejecting. */
  rejection_reason       text,
  /* An admin's note on a decision recorded outside the portal. Internal; never shown to the customer. */
  note                   text,
  /* Who acted: the portal member who decided, or the admin who recorded it. */
  actor_user_id          uuid not null,
  actor_email            text,
  /* The membership the portal member acted under. */
  membership_id          uuid,
  /* The customer ticked "gelezen en akkoord" for the offer and its terms (portal acceptances). */
  terms_confirmed        boolean not null default false,
  /* What was decided on, copied from the frozen quote in the same statement. */
  quote_number           text not null,
  quote_document_path    text not null,
  quote_document_sha256  text not null check (quote_document_sha256 ~ '^[0-9a-f]{64}$'),
  terms_edition          text not null check (terms_edition ~ '^\d{4}$'),
  terms_published_on     date not null,
  decided_at             timestamptz not null default now(),

  constraint quote_decisions_one_per_quote unique (quote_id),
  constraint quote_decisions_quote_same_customer
    foreign key (quote_id, customer_id) references public.quotes (id, customer_id) on delete restrict,
  constraint quote_decisions_reason_only_on_reject check (rejection_reason is null or decision = 'rejected'),
  constraint quote_decisions_reason_shape check (rejection_reason is null or char_length(rejection_reason) between 1 and 2000),
  constraint quote_decisions_note_offline_only check (note is null or source <> 'portal'),
  constraint quote_decisions_note_shape check (note is null or char_length(note) between 1 and 2000),
  constraint quote_decisions_portal_membership check ((source = 'portal') = (membership_id is not null)),
  constraint quote_decisions_portal_acceptance_confirmed check (source <> 'portal' or decision <> 'accepted' or terms_confirmed)
);

comment on table public.quote_decisions is
  'The decision on a sent quote: accepted or rejected, once per quote, never updated or deleted. Carries the hash of the exact stored PDF and the terms set the quote was issued under. The only writer of quotes.status accepted/rejected. Evidence of an agreement: kept for the statutory retention period (7 years, like the invoices it leads to), so the retention job does not redact it -- including actor_email and rejection_reason.';
comment on column public.quote_decisions.source is
  'portal: the customer decided in the portal. email | phone | signed | other: the decision reached YM Creations outside the portal and an admin recorded it.';
comment on column public.quote_decisions.actor_user_id is
  'auth.uid() of whoever acted: the portal member for source portal, the recording admin otherwise. No foreign key: the record outlives the account.';
comment on column public.quote_decisions.actor_email is
  'The sign-in address of that account at the moment of the decision, read from Auth on the server. Not the customer''s contact address.';
comment on column public.quote_decisions.quote_document_sha256 is
  'SHA-256 of the stored quote PDF the decision is about, copied from quotes.document_sha256 when the decision was made.';

create index quote_decisions_customer_idx on public.quote_decisions (customer_id, decided_at desc);

alter table public.quote_decisions enable row level security;
alter table public.quote_decisions force row level security;

/*
  Read by admins; written only by the two functions below, which run as the
  owner. Nobody holds UPDATE, DELETE or TRUNCATE -- not authenticated, not
  service_role -- and the triggers further down refuse them even for the
  owner.
*/
revoke all on table public.quote_decisions from public, anon, authenticated, service_role;
grant select on table public.quote_decisions to authenticated, service_role;

create policy quote_decisions_admin_read
  on public.quote_decisions for select to authenticated
  using (private.is_admin());

/*
  The record checks itself on the way in, whoever inserts it: the snapshot
  must be the quote's own -- its customer, its number, its document, its
  terms -- the quote must be one that can carry a decision at all, and the
  moment is the database's clock. A function that one day passes a stale or
  invented hash is refused here rather than believed.
*/
create or replace function private.check_new_quote_decision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
begin
  select * into v_quote from public.quotes where id = new.quote_id;
  if not found then
    raise exception 'Onbekende offerte.' using errcode = 'foreign_key_violation';
  end if;

  if v_quote.number_provisional or v_quote.sent_at is null or v_quote.legacy_sent_without_document
     or v_quote.document_path is null or v_quote.document_sha256 is null
     or v_quote.terms_edition is null or v_quote.terms_published_on is null
  then
    raise exception 'Offerte % is geen verzonden document met vastgelegde voorwaarden; er wordt geen beslissing over vastgelegd.',
      v_quote.number_value
      using errcode = 'check_violation';
  end if;

  if new.customer_id            is distinct from v_quote.customer_id
     or new.quote_number          is distinct from v_quote.number_value
     or new.quote_document_path   is distinct from v_quote.document_path
     or new.quote_document_sha256 is distinct from v_quote.document_sha256
     or new.terms_edition         is distinct from v_quote.terms_edition
     or new.terms_published_on    is distinct from v_quote.terms_published_on
  then
    raise exception 'De beslissing moet het vastgelegde document en de voorwaarden van offerte % noemen.',
      v_quote.number_value
      using errcode = 'check_violation';
  end if;

  new.decided_at := now();
  return new;
end;
$$;

create trigger quote_decisions_check_new
  before insert on public.quote_decisions
  for each row execute function private.check_new_quote_decision();

/* Inserting the decision is what moves the quote's status; there is no second step to forget. */
create or replace function private.apply_quote_decision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.quotes set status = new.decision where id = new.quote_id;
  return null;
end;
$$;

create trigger quote_decisions_apply
  after insert on public.quote_decisions
  for each row execute function private.apply_quote_decision();

create or replace function private.refuse_quote_decision_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Een beslissing over een offerte ligt vast en wordt niet gewijzigd of verwijderd.'
    using errcode = 'check_violation';
end;
$$;

create trigger quote_decisions_refuse_update_delete
  before update or delete on public.quote_decisions
  for each row execute function private.refuse_quote_decision_changes();

create trigger quote_decisions_refuse_truncate
  before truncate on public.quote_decisions
  for each statement execute function private.refuse_quote_decision_changes();

-- ------------------------------------------------- the status follows the record

/*
  No quote is accepted or rejected in this data yet (production: one sent
  legacy quote, status 'sent'). Should an environment hold one, the rule
  below would be false the moment it is stated, and evidence cannot be made
  up after the fact -- so the migration stops and says so.
*/
do $$
begin
  if exists (select 1 from public.quotes where status in ('accepted', 'rejected')) then
    raise exception 'Er staan offertes op geaccepteerd/afgewezen zonder beslissingsrecord; leg die eerst handmatig vast.';
  end if;
end;
$$;

/*
  On every update, not only those that name the column: a later trigger that
  rewrote the status would otherwise pass a column-list trigger unseen.
  Runs after quotes_refuse_frozen_changes (triggers fire by name), so the
  freeze speaks first. The decision's own update of the status passes
  because the decision row is already there when it fires, and its value is
  the one being written.
*/
create or replace function private.quote_status_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_decision text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  /* Decided is final, without asking anything: no lookup that row level security could hide. */
  if old.status in ('accepted', 'rejected') then
    raise exception 'Over offerte % is beslist (%); de status ligt vast.', old.number_value, old.status
      using errcode = 'check_violation';
  end if;

  select d.decision into v_decision from public.quote_decisions d where d.quote_id = new.id;

  if v_decision is null then
    if new.status in ('accepted', 'rejected') then
      raise exception 'Offerte % wordt alleen geaccepteerd of afgewezen door een vastgelegde beslissing.', old.number_value
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  /* Decided: the one move left is the decision's own, from an open status to its value. */
  if new.status = v_decision then
    return new;
  end if;

  raise exception 'Over offerte % is beslist (%); de status ligt vast.', old.number_value, v_decision
    using errcode = 'check_violation';
end;
$$;

comment on function private.quote_status_guard() is
  'quotes.status may become accepted or rejected only as the effect of a quote_decisions row, and never moves once one exists.';

create trigger quotes_status_guard
  before update on public.quotes
  for each row execute function private.quote_status_guard();

/*
  A new version of an accepted quote is never issued. createQuoteRevision and
  check_new_quote already refuse to make one; this covers the concept that
  existed before the acceptance. Asked when the successor is numbered --
  begin_quote_issue, the moment it starts to become a document -- under a
  share lock on the predecessor, so it queues behind a decision being made
  on it right now and reads the outcome; and a decision that comes second
  sees the numbered successor and is refused.
*/
create or replace function private.refuse_issue_after_acceptance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_number text;
begin
  if not (old.number_provisional and not new.number_provisional) or new.supersedes_quote_id is null then
    return new;
  end if;

  select q.status, q.number_value into v_status, v_number
  from public.quotes q where q.id = new.supersedes_quote_id
  for share;

  if v_status = 'accepted' then
    raise exception 'Offerte % is geaccepteerd; een nieuwe versie ervan wordt niet uitgegeven.', v_number
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger quotes_refuse_issue_after_acceptance
  before update on public.quotes
  for each row execute function private.refuse_issue_after_acceptance();

-- --------------------------------------------------------- when a decision fits

/*
  Why this quote cannot be decided now, or null when it can. One list of
  rules for both doors; the portal adds expiry.

    not_document  not a sent, stored document with recorded terms (a concept,
                  a numbered quote whose send did not finish, a legacy quote).
    closed        the status is not open: 'sent' for the portal, 'sent' or
                  'expired' for an admin.
    superseded    a newer version exists past the concept stage: numbered,
                  so being issued or already sent.
    expired       portal only: valid_until lies before today in Amsterdam,
                  or the admin marked it expired.

  An admin may record a decision on a quote past its date: a customer's
  acceptance that arrived in time and is entered later, or a late acceptance
  YM Creations chooses to honour (BW 6:223). The customer cannot.
*/
create or replace function private.quote_decision_refusal(p_quote public.quotes, p_portal boolean)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_quote.number_provisional or p_quote.sent_at is null or p_quote.legacy_sent_without_document
     or p_quote.document_path is null or p_quote.document_sha256 is null
     or p_quote.terms_edition is null or p_quote.terms_published_on is null
  then
    return 'not_document';
  end if;

  if exists (
    select 1 from public.quotes s
    where s.supersedes_quote_id = p_quote.id and not s.number_provisional
  ) then
    return 'superseded';
  end if;

  if p_portal then
    if p_quote.status = 'expired'
       or p_quote.valid_until < (now() at time zone 'Europe/Amsterdam')::date
    then
      return 'expired';
    end if;
    if p_quote.status <> 'sent' then
      return 'closed';
    end if;
  elsif p_quote.status not in ('sent', 'expired') then
    return 'closed';
  end if;

  return null;
end;
$$;

revoke all on function private.quote_decision_refusal(public.quotes, boolean) from public, anon, authenticated;

/* Plain text, as typed; no control or direction characters. Empty is no reason. */
create or replace function private.decision_text(p_value text, p_field text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_text text := btrim(coalesce(p_value, ''), E' \t\r\n');
begin
  if v_text ~ E'^[[:space:]\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]*$' then
    return null;
  end if;
  if char_length(v_text) > 2000
     or v_text ~ E'[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f-\\x9f\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]'
  then
    raise exception 'invalid:%', p_field using errcode = '22023';
  end if;
  return v_text;
end;
$$;

revoke all on function private.decision_text(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the mails

/*
  The mails a portal decision produces: the customer's confirmation and YM
  Creations' own notice, each marked once it went, under a lease so two
  senders never send at once. Kept off the decision so the decision is never
  updated; made in the same transaction as the decision, so a decision
  without its notification row cannot exist. A mail that fails leaves only
  this row unmarked: the decision stands.
*/
create table public.quote_decision_notifications (
  decision_id           uuid primary key references public.quote_decisions (id) on delete restrict,
  customer_id           uuid not null references public.customers (id) on delete restrict,
  claimed_at            timestamptz,
  attempts              integer not null default 0 check (attempts >= 0),
  customer_notified_at  timestamptz,
  internal_notified_at  timestamptz,
  created_at            timestamptz not null default now()
);

comment on table public.quote_decision_notifications is
  'Delivery state of the two mails a portal quote decision produces. Lease in claimed_at; each mail marked once it went.';

create index quote_decision_notifications_pending_idx
  on public.quote_decision_notifications (created_at)
  where customer_notified_at is null or internal_notified_at is null;

alter table public.quote_decision_notifications enable row level security;
alter table public.quote_decision_notifications force row level security;

revoke all on table public.quote_decision_notifications from public, anon, authenticated, service_role;
grant select on table public.quote_decision_notifications to authenticated, service_role;
grant update (claimed_at, attempts, customer_notified_at, internal_notified_at)
  on table public.quote_decision_notifications to authenticated, service_role;

create policy quote_decision_notifications_admin_read
  on public.quote_decision_notifications for select to authenticated
  using (private.is_admin());

create policy quote_decision_notifications_admin_update
  on public.quote_decision_notifications for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

/* A mail marked as sent stays marked; the lease and the counter are all that moves otherwise. */
create or replace function private.refuse_notification_unmark()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (old.customer_notified_at is not null and new.customer_notified_at is distinct from old.customer_notified_at)
     or (old.internal_notified_at is not null and new.internal_notified_at is distinct from old.internal_notified_at)
  then
    raise exception 'Een verstuurde bevestiging blijft verstuurd.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger quote_decision_notifications_refuse_unmark
  before update on public.quote_decision_notifications
  for each row execute function private.refuse_notification_unmark();

-- --------------------------------------------------------- portal events

alter table public.portal_events
  drop constraint portal_events_action_check,
  add constraint portal_events_action_check check (action in (
    'member_invited', 'member_reinvited', 'member_reactivated', 'member_revoked',
    'membership_accepted', 'password_changed', 'password_reset_requested', 'customer_selected',
    'invoice_payment_started', 'mandate_activation_requested',
    'quote_accepted', 'quote_rejected'
  )),
  drop constraint portal_events_target_kind_check,
  add constraint portal_events_target_kind_check check (target_kind in ('membership', 'user', 'invoice', 'customer', 'quote'));

-- ------------------------------------------------------------- the doors

/*
  The customer's decision.

    auth.uid() -> an active membership of this customer, row-locked so a
    revoke that lands at the same moment waits for this decision or wins
    before it -> this exact quote, visible to the customer, row-locked so
    two decisions queue -> the decision already on record, if any -> the
    rules -> the hash the page showed -> the record, the status (by the
    record's trigger), the portal event and the notification row. One
    transaction.

  Outcomes, as rows rather than errors, so the page can say what happened:

    decided          this call made the decision.
    already_decided  the same decision was already on record (a double click,
                     a retry after a lost answer). The row returned is that one.
    conflict         the other decision is on record. Nothing changes.
    expired | superseded | closed | not_document
                     the quote cannot be decided (see quote_decision_refusal).
    stale            the page showed a different document than the one on
                     record. Nothing changes.

  42501 for no membership, a foreign or unknown or invisible quote alike.
  22023 for a malformed argument. The document, the terms and the actor are
  never arguments: they are read here.
*/
create or replace function public.portal_decide_quote(
  p_customer_id      uuid,
  p_quote_id         uuid,
  p_decision         text,
  p_expected_sha256  text,
  p_terms_confirmed  boolean,
  p_rejection_reason text
)
returns table (
  outcome          text,
  decision_id      uuid,
  decision         text,
  source           text,
  decided_at       timestamptz,
  rejection_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := (select auth.uid());
  v_membership uuid;
  v_email      text;
  v_quote      public.quotes%rowtype;
  v_existing   public.quote_decisions%rowtype;
  v_reason     text;
  v_refusal    text;
  v_row        public.quote_decisions%rowtype;
begin
  perform private.portal_require_customer(p_customer_id);

  if p_decision is null or p_decision not in ('accepted', 'rejected') then
    raise exception 'invalid:decision' using errcode = '22023';
  end if;
  if p_quote_id is null then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;
  v_reason := private.decision_text(p_rejection_reason, 'rejection_reason');
  if p_decision = 'accepted' then
    if p_terms_confirmed is not true then
      raise exception 'invalid:confirmation' using errcode = '22023';
    end if;
    if v_reason is not null then
      raise exception 'invalid:rejection_reason' using errcode = '22023';
    end if;
  end if;

  select m.id into v_membership
  from public.customer_users m
  where m.user_id = v_user and m.customer_id = p_customer_id and m.revoked_at is null
  for share;
  if v_membership is null then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;

  select q.* into v_quote
  from public.quotes q
  where q.id = p_quote_id and q.customer_id = p_customer_id
  for update;
  if not found or not exists (select 1 from private.portal_visible_quotes v where v.id = v_quote.id) then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;

  select d.* into v_existing from public.quote_decisions d where d.quote_id = v_quote.id;
  if found then
    return query select
      case when v_existing.decision = p_decision then 'already_decided' else 'conflict' end,
      v_existing.id, v_existing.decision, v_existing.source, v_existing.decided_at, v_existing.rejection_reason;
    return;
  end if;

  v_refusal := private.quote_decision_refusal(v_quote, true);
  if v_refusal is not null then
    return query select v_refusal, null::uuid, null::text, null::text, null::timestamptz, null::text;
    return;
  end if;

  if p_expected_sha256 is distinct from v_quote.document_sha256 then
    return query select 'stale'::text, null::uuid, null::text, null::text, null::timestamptz, null::text;
    return;
  end if;

  select u.email into v_email from auth.users u where u.id = v_user;

  insert into public.quote_decisions (
    quote_id, customer_id, decision, source, rejection_reason,
    actor_user_id, actor_email, membership_id, terms_confirmed,
    quote_number, quote_document_path, quote_document_sha256, terms_edition, terms_published_on
  ) values (
    v_quote.id, v_quote.customer_id, p_decision, 'portal', v_reason,
    v_user, v_email, v_membership, p_decision = 'accepted' and p_terms_confirmed is true,
    v_quote.number_value, v_quote.document_path, v_quote.document_sha256, v_quote.terms_edition, v_quote.terms_published_on
  )
  returning * into v_row;

  insert into public.portal_events (actor_user_id, customer_id, action, target_kind, target_id)
  values (v_user, v_quote.customer_id, case when p_decision = 'accepted' then 'quote_accepted' else 'quote_rejected' end, 'quote', v_quote.id);

  insert into public.quote_decision_notifications (decision_id, customer_id) values (v_row.id, v_row.customer_id);

  return query select 'decided'::text, v_row.id, v_row.decision, v_row.source, v_row.decided_at, v_row.rejection_reason;
end;
$$;

comment on function public.portal_decide_quote(uuid, uuid, text, text, boolean, text) is
  'A portal member accepts or rejects one sent quote of their customer, once. Document hash and terms are copied from the quote; the expected hash only detects a stale page. Outcome row; 42501 for anything not theirs.';

/*
  What the portal shows about a quote's decision: the decision if there is
  one, whether the quote can be decided now, and the hash of the document a
  decision would be about -- so the form can carry it back. The admin's note
  and the recording admin are not here; for a portal decision the address of
  the member who made it is, so colleagues see who decided.
*/
create or replace function public.portal_quote_decision(p_customer_id uuid, p_quote_id uuid)
returns table (
  decision         text,
  source           text,
  decided_at       timestamptz,
  rejection_reason text,
  decided_by_email text,
  terms_edition    text,
  refusal          text,
  document_sha256  text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quote    public.quotes%rowtype;
  v_decision public.quote_decisions%rowtype;
begin
  perform private.portal_require_customer(p_customer_id);

  select q.* into v_quote
  from public.quotes q
  where q.id = p_quote_id and q.customer_id = p_customer_id;
  if not found or not exists (select 1 from private.portal_visible_quotes v where v.id = v_quote.id) then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;

  select d.* into v_decision from public.quote_decisions d where d.quote_id = v_quote.id;

  return query select
    v_decision.decision,
    v_decision.source,
    v_decision.decided_at,
    v_decision.rejection_reason,
    case when v_decision.source = 'portal' then v_decision.actor_email end,
    coalesce(v_decision.terms_edition, v_quote.terms_edition),
    case when v_decision.id is not null then 'decided' else private.quote_decision_refusal(v_quote, true) end,
    v_quote.document_sha256;
end;
$$;

comment on function public.portal_quote_decision(uuid, uuid) is
  'The decision on one visible quote of one of the caller''s customers, whether it can be decided now, and the hash of its document. 42501 for anything else.';

/*
  A decision that reached YM Creations outside the portal, recorded by an
  admin. Same table, same snapshot, same one-per-quote rule: a quote decided
  in the portal cannot be decided again here, and what is recorded here
  cannot be changed afterwards either. Definer, so nobody needs INSERT on the
  table; the first thing it asks is whether the caller is an admin.

  Outcomes as for the portal; 42501 for a non-admin, P0002 for an unknown
  quote.
*/
create or replace function public.admin_record_quote_decision(
  p_quote_id         uuid,
  p_decision         text,
  p_source           text,
  p_rejection_reason text,
  p_note             text
)
returns table (
  outcome     text,
  decision_id uuid,
  decision    text,
  source      text,
  decided_at  timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_email    text;
  v_quote    public.quotes%rowtype;
  v_existing public.quote_decisions%rowtype;
  v_reason   text;
  v_note     text;
  v_refusal  text;
  v_row      public.quote_decisions%rowtype;
begin
  if v_user is null or not private.is_admin() then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('accepted', 'rejected') then
    raise exception 'invalid:decision' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('email', 'phone', 'signed', 'other') then
    raise exception 'invalid:source' using errcode = '22023';
  end if;
  v_reason := private.decision_text(p_rejection_reason, 'rejection_reason');
  v_note := private.decision_text(p_note, 'note');
  if p_decision = 'accepted' and v_reason is not null then
    raise exception 'invalid:rejection_reason' using errcode = '22023';
  end if;

  select q.* into v_quote from public.quotes q where q.id = p_quote_id for update;
  if not found then
    raise exception 'Onbekende offerte.' using errcode = 'P0002';
  end if;

  select d.* into v_existing from public.quote_decisions d where d.quote_id = v_quote.id;
  if found then
    return query select
      case when v_existing.decision = p_decision and v_existing.source = p_source then 'already_decided' else 'conflict' end,
      v_existing.id, v_existing.decision, v_existing.source, v_existing.decided_at;
    return;
  end if;

  v_refusal := private.quote_decision_refusal(v_quote, false);
  if v_refusal is not null then
    return query select v_refusal, null::uuid, null::text, null::text, null::timestamptz;
    return;
  end if;

  select u.email into v_email from auth.users u where u.id = v_user;

  insert into public.quote_decisions (
    quote_id, customer_id, decision, source, rejection_reason, note,
    actor_user_id, actor_email,
    quote_number, quote_document_path, quote_document_sha256, terms_edition, terms_published_on
  ) values (
    v_quote.id, v_quote.customer_id, p_decision, p_source, v_reason, v_note,
    v_user, v_email,
    v_quote.number_value, v_quote.document_path, v_quote.document_sha256, v_quote.terms_edition, v_quote.terms_published_on
  )
  returning * into v_row;

  return query select 'decided'::text, v_row.id, v_row.decision, v_row.source, v_row.decided_at;
end;
$$;

comment on function public.admin_record_quote_decision(uuid, text, text, text, text) is
  'An admin records a decision that reached YM Creations by mail, phone, a signed copy or otherwise. Same record and snapshot as a portal decision; once per quote.';

revoke all on function public.portal_decide_quote(uuid, uuid, text, text, boolean, text) from public, anon;
revoke all on function public.portal_quote_decision(uuid, uuid) from public, anon;
revoke all on function public.admin_record_quote_decision(uuid, text, text, text, text) from public, anon;
grant execute on function public.portal_decide_quote(uuid, uuid, text, text, boolean, text) to authenticated;
grant execute on function public.portal_quote_decision(uuid, uuid) to authenticated;
grant execute on function public.admin_record_quote_decision(uuid, text, text, text, text) to authenticated;

revoke all on function private.check_new_quote_decision() from public, anon, authenticated;
revoke all on function private.apply_quote_decision() from public, anon, authenticated;
revoke all on function private.refuse_quote_decision_changes() from public, anon, authenticated;
revoke all on function private.quote_status_guard() from public, anon, authenticated;
revoke all on function private.refuse_issue_after_acceptance() from public, anon, authenticated;
revoke all on function private.refuse_notification_unmark() from public, anon, authenticated;

-- ---------------------------------------------------------- communications

alter table public.customer_communications
  drop constraint customer_communications_category_check,
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
    'credit_note_sent',
    'request_received',
    'request_status_changed',
    'quote_decision_received'
  ));
