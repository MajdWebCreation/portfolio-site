-- Contract terms per recurring service, and what a cancellation was decided on.
--
-- Until now the lifecycle of a monthly service read its rules from two
-- places that are not written down anywhere per service: the general terms
-- (one month's notice, the last term pro rata by days) as constants in the
-- code, and the service row itself (price, VAT, start, calendar). What a
-- particular customer agreed in their offer -- a longer notice, a minimum
-- term, a special arrangement -- had no place to live, and a cancellation
-- could not say afterwards which rule it had applied.
--
-- This migration adds that place, and nothing else:
--
--   recurring_service_agreements   the terms that apply to one service, as a
--                                  chain of immutable revisions, each valid
--                                  from a date. Only what is *not* already
--                                  the truth elsewhere is stored here: the
--                                  notice period, a minimum term, the
--                                  proration rule, a special arrangement,
--                                  where they come from (offer, later
--                                  amendment, or just the general terms) and
--                                  which set of general terms applies.
--
-- Deliberately NOT here, because each already has one owner and a second
-- copy could only disagree with it:
--
--   the price            recurring_price_changes (amountForPeriod);
--   the VAT rate         recurring_services.vat_rate;
--   the billing calendar recurring_services.starts_on, monthly, in advance;
--   the name             recurring_services.name.
--
-- Standard versus deviation: every term column is nullable, and null means
-- "as the general terms say". A value is a deviation, and a deviation needs
-- a source that is not the general terms themselves, plus the day it was
-- accepted. The database refuses a deviation without those, whatever the
-- form did. A standard value is never copied in as a fake deviation just to
-- show it: the application knows the standard per edition of the terms.
--
-- History and concurrency: revisions are never updated or deleted. A later
-- revision is a new row that names the one it supersedes, and every
-- revision has at most one successor (unique on supersedes_id), so the
-- chain is linear and two admins editing at once cannot both succeed -- the
-- second insert hits the unique index and is told the terms changed under
-- it. `sequence` is assigned by the trigger from the predecessor, and
-- `effective_from` may not go backwards along the chain, so "which revision
-- applied on day X" has exactly one answer: the highest sequence whose
-- effective_from is on or before X.
--
-- Provenance that survives its source: the offer a revision points at is a
-- live document the admin can still edit, so what the revision keeps is its
-- own label (the offer's number at the time) and the acceptance date, next
-- to a reference that merely clears when the offer goes. The set of general
-- terms is identified the way docs/legal/voorwaarden/README.md identifies
-- it: edition plus publication date; the content stays in terms.ts and the
-- archive, and a newly published set changes no existing revision.

-- ------------------------------------------------------------ agreements

create table public.recurring_service_agreements (
  id                   uuid primary key default gen_random_uuid(),
  recurring_service_id uuid not null,
  customer_id          uuid not null references public.customers (id) on delete restrict,

  /* Position in the service's chain: 1 for the first revision, then +1 per
     successor. Written by the trigger below; what a client sends is ignored. */
  sequence       integer not null default 0,
  /* The revision this one replaces; null only for the first of a service. */
  supersedes_id  uuid references public.recurring_service_agreements (id) on delete restrict,
  /* The first day these terms apply. Never before the predecessor's. */
  effective_from date not null,

  /* Where the terms in this row come from, in the order the general terms
     rank them (art. 4.1): a later written amendment, the accepted offer, or
     the general terms themselves. */
  source_kind     text not null check (source_kind in ('standard_terms', 'accepted_offer', 'later_written_amendment')),
  /* A reference to the offer, when the source is one; same customer, and
     it clears rather than blocks when the offer is removed. */
  source_quote_id uuid,
  /* How the source reads in the administration, fixed at the time: the
     offer's number then, or how the amendment was agreed. Required so the
     row stays explicable after its source is edited or gone. */
  source_label    text not null check (length(btrim(source_label)) > 0),
  /* The day the customer accepted the offer or the amendment. */
  accepted_on     date,

  /* The terms themselves; null means the general terms' standard. */
  notice_months       integer check (notice_months between 1 and 24),
  minimum_term_months integer check (minimum_term_months between 1 and 60),
  /* How a partial last term is billed: pro rata by days (the standard), or
     the full period. The arithmetic stays in lib/payments/pricing; this
     only says which rule it applies. */
  proration_rule      text check (proration_rule in ('pro_rata_days', 'none')),
  /* A specific arrangement in words, for the administration to read; the
     system derives nothing from it. */
  special_terms       text not null default '',

  /* Which set of the general terms applies: the edition (the outward name)
     and the publication date that tells two sets of one edition apart, as
     the register in docs/legal/voorwaarden keeps them. Both null when it is
     not known which set was made available with the agreement -- the case
     for every service from before this table existed. A set is never
     assumed: art. 29.1 says a published set does not apply to an existing
     agreement by itself, so an unknown set stays unknown until an admin
     records which one it was, with its source. */
  terms_edition      text check (terms_edition ~ '^\d{4}$'),
  terms_published_on date,

  /* Why this revision was made; shown in the history. */
  note       text not null default '',
  /* auth.uid() of the admin who recorded it; null for a migration. */
  created_by uuid,
  created_at timestamptz not null default now(),

  -- The service and the customer on a revision are the same customer.
  constraint recurring_service_agreements_same_customer
    foreign key (recurring_service_id, customer_id)
    references public.recurring_services (id, customer_id) on delete cascade,
  -- An offer named as source belongs to the same customer.
  constraint recurring_service_agreements_quote_same_customer
    foreign key (source_quote_id, customer_id)
    references public.quotes (id, customer_id) on delete set null (source_quote_id),

  -- A deviation from the standard needs a source that is not the standard.
  constraint recurring_service_agreements_deviation_has_source check (
    source_kind <> 'standard_terms'
    or (notice_months is null and minimum_term_months is null and proration_rule is null and special_terms = '')
  ),
  -- An offer or an amendment was accepted on a day.
  constraint recurring_service_agreements_source_accepted check (
    source_kind = 'standard_terms' or accepted_on is not null
  ),
  -- The general terms are not accepted on a day of their own here.
  constraint recurring_service_agreements_standard_not_accepted check (
    source_kind <> 'standard_terms' or accepted_on is null
  ),
  -- Only an accepted offer points at a quote.
  constraint recurring_service_agreements_quote_only_for_offer check (
    source_quote_id is null or source_kind = 'accepted_offer'
  ),
  -- Nothing agreed before it took effect is refused; agreed after is not
  -- possible: the acceptance is what makes the terms, so it comes first.
  constraint recurring_service_agreements_accepted_before_effective check (
    accepted_on is null or accepted_on <= effective_from
  ),
  -- A set is identified by both halves or not at all.
  constraint recurring_service_agreements_terms_set_complete check (
    (terms_edition is null) = (terms_published_on is null)
  )
);

comment on table public.recurring_service_agreements is
  'Contract terms of a recurring service as a chain of immutable revisions; null term columns mean the general terms'' standard.';
comment on column public.recurring_service_agreements.sequence is
  'Position in the service''s chain, assigned by trigger; the revision in force on a day is the highest sequence effective by then.';
comment on column public.recurring_service_agreements.supersedes_id is
  'The revision this one replaces. Unique: a revision has one successor, so concurrent edits cannot both land.';
comment on column public.recurring_service_agreements.source_label is
  'How the source reads, fixed when the revision was made; outlives edits to or removal of the offer.';
comment on column public.recurring_service_agreements.terms_published_on is
  'Publication date of the applicable set of general terms, as docs/legal/voorwaarden/README.md registers it; null with terms_edition when the set is not historically established.';

/* The chain: one first revision per service, one successor per revision. */
create unique index recurring_service_agreements_first_unique
  on public.recurring_service_agreements (recurring_service_id) where supersedes_id is null;
create unique index recurring_service_agreements_successor_unique
  on public.recurring_service_agreements (supersedes_id) where supersedes_id is not null;
create unique index recurring_service_agreements_sequence_unique
  on public.recurring_service_agreements (recurring_service_id, sequence);

/* Covers the composite reference and the per-service history read. */
create index recurring_service_agreements_service_idx
  on public.recurring_service_agreements (recurring_service_id, customer_id, effective_from);
create index recurring_service_agreements_customer_idx
  on public.recurring_service_agreements (customer_id);
create index recurring_service_agreements_quote_idx
  on public.recurring_service_agreements (source_quote_id, customer_id) where source_quote_id is not null;

/*
  Links a new revision into its service's chain. Nothing is locked here:
  what the trigger reads off the predecessor (its service, its sequence,
  its date) never changes, and the race between two inserts naming the
  same predecessor is decided by the unique index on supersedes_id, which
  lets exactly one of them in. A read-only trigger also needs no privilege
  the admin role does not have -- a row lock would require UPDATE, which
  this table deliberately grants to nobody.
*/
create or replace function private.chain_recurring_service_agreement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_predecessor public.recurring_service_agreements%rowtype;
begin
  if new.supersedes_id is null then
    if exists (
      select 1 from public.recurring_service_agreements
      where recurring_service_id = new.recurring_service_id
    ) then
      raise exception 'Deze dienst heeft al afspraken vastgelegd; een nieuwe versie moet de huidige opvolgen.'
        using errcode = 'check_violation';
    end if;
    new.sequence := 1;
    return new;
  end if;

  select * into v_predecessor
  from public.recurring_service_agreements
  where id = new.supersedes_id;

  if not found then
    raise exception 'De afsprakenversie die wordt opgevolgd bestaat niet.' using errcode = 'foreign_key_violation';
  end if;
  if v_predecessor.recurring_service_id <> new.recurring_service_id then
    raise exception 'De afsprakenversie die wordt opgevolgd hoort bij een andere dienst.' using errcode = 'check_violation';
  end if;
  if new.effective_from < v_predecessor.effective_from then
    raise exception 'De ingangsdatum (%) ligt vóór die van de vorige versie (%).', new.effective_from, v_predecessor.effective_from
      using errcode = 'check_violation';
  end if;

  new.sequence := v_predecessor.sequence + 1;
  return new;
end;
$$;

comment on function private.chain_recurring_service_agreement() is
  'Assigns the chain position of a new agreement revision and refuses one that would break the chain.';

create trigger recurring_service_agreements_chain
  before insert on public.recurring_service_agreements
  for each row execute function private.chain_recurring_service_agreement();

/*
  A revision is history the moment it exists. Stated here, not only in the
  grants below, so it holds for every role and every query. The one change
  the schema itself makes is let through: the offer reference clearing
  when the offer is removed (the foreign key's SET NULL), which touches
  nothing the revision says -- its label still names the offer.
*/
create or replace function private.refuse_recurring_service_agreement_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.source_quote_id is not null
     and new.source_quote_id is null
     and new.recurring_service_id  is not distinct from old.recurring_service_id
     and new.customer_id           is not distinct from old.customer_id
     and new.sequence              is not distinct from old.sequence
     and new.supersedes_id         is not distinct from old.supersedes_id
     and new.effective_from        is not distinct from old.effective_from
     and new.source_kind           is not distinct from old.source_kind
     and new.source_label          is not distinct from old.source_label
     and new.accepted_on           is not distinct from old.accepted_on
     and new.notice_months         is not distinct from old.notice_months
     and new.minimum_term_months   is not distinct from old.minimum_term_months
     and new.proration_rule        is not distinct from old.proration_rule
     and new.special_terms         is not distinct from old.special_terms
     and new.terms_edition         is not distinct from old.terms_edition
     and new.terms_published_on    is not distinct from old.terms_published_on
     and new.note                  is not distinct from old.note
     and new.created_by            is not distinct from old.created_by
     and new.created_at            is not distinct from old.created_at
  then
    return new;
  end if;
  raise exception 'Een vastgelegde afsprakenversie wordt niet gewijzigd; leg een nieuwe versie vast.'
    using errcode = 'check_violation';
end;
$$;

create trigger recurring_service_agreements_refuse_changes
  before update on public.recurring_service_agreements
  for each row execute function private.refuse_recurring_service_agreement_changes();

/*
  Nor is a revision removed. The one delete that is let through is the
  cascade that follows a service being removed: by then the service row is
  gone, and a revision without its service is nothing. Any other delete --
  by the application, by an admin, by a role that could -- is refused.
*/
create or replace function private.refuse_recurring_service_agreement_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.recurring_services where id = old.recurring_service_id) then
    return old;
  end if;
  raise exception 'Een vastgelegde afsprakenversie wordt niet verwijderd; de historie van dienst % blijft.', old.recurring_service_id
    using errcode = 'check_violation';
end;
$$;

create trigger recurring_service_agreements_refuse_delete
  before delete on public.recurring_service_agreements
  for each row execute function private.refuse_recurring_service_agreement_delete();

alter table public.recurring_service_agreements enable row level security;
alter table public.recurring_service_agreements force row level security;

revoke all on table public.recurring_service_agreements from anon, authenticated;
-- Append only: no update, no delete.
grant select, insert on table public.recurring_service_agreements to authenticated;

create policy recurring_service_agreements_admin_read on public.recurring_service_agreements
  for select to authenticated using (private.is_admin());
create policy recurring_service_agreements_admin_insert on public.recurring_service_agreements
  for insert to authenticated with check (private.is_admin());

-- ------------------------------------------------ cancellation snapshot

/*
  What a cancellation was decided on, written with it and never derived
  again. A cancellation's last day follows from the notice that applied on
  the day of the request; if the terms are amended later, that day must
  still be explicable from the row itself. So the service keeps, next to
  the dates it already had:

    cancellation_notice_months            the notice applied, in calendar months;
    cancellation_contractual_ends_on      the last day that notice gives.
                                          Differs from ends_on exactly when
                                          an agreed deviation was chosen;
    cancellation_agreement_revision_id    the revision the notice was read
                                          from; null when the service had
                                          none and the standard applied;
    cancellation_source                   how that reads: the offer, the
                                          amendment, or the general terms;
    cancellation_proration_rule           how the partial last term is billed;
    cancellation_minimum_term_months      the minimum term that applied, when
                                          one was agreed; it can move the
                                          contractual last day later than the
                                          notice alone would;
    cancellation_minimum_term_ends_on     the last day of that minimum term,
                                          so the rule below can be stated here;
    cancellation_deviation_*              when the chosen last day is not the
                                          contractual one: on whose agreement.
                                          Any other day -- earlier, inside an
                                          agreed minimum term, or later -- is
                                          a contractual deviation, agreed in
                                          writing by both parties, and is
                                          recorded as one: its kind (the same
                                          two kinds a deviating agreement
                                          revision has), how it reads, when
                                          it was agreed, and why. Required by
                                          the check below for every deviation.
                                          The contractual day itself stays in
                                          cancellation_contractual_ends_on; a
                                          deviation never rewrites it. There
                                          is no "run on for free" here: the
                                          service is billed and collected
                                          through ends_on, so a later day is
                                          a contractual one or nothing.

  These columns are the record of a decision, read back only to explain and
  carry out that one cancellation. Nothing resolves what applies today from
  them: that is always the agreement chain.
*/
alter table public.recurring_services
  add column cancellation_notice_months integer check (cancellation_notice_months between 1 and 24),
  add column cancellation_minimum_term_months integer check (cancellation_minimum_term_months between 1 and 60),
  add column cancellation_minimum_term_ends_on date,
  add column cancellation_deviation_source_kind text
    check (cancellation_deviation_source_kind in ('accepted_offer', 'later_written_amendment')),
  add column cancellation_deviation_source_label text check (length(btrim(cancellation_deviation_source_label)) > 0),
  add column cancellation_deviation_agreed_on date,
  add column cancellation_deviation_reason text check (length(btrim(cancellation_deviation_reason)) > 0),
  add column cancellation_contractual_ends_on date,
  add column cancellation_agreement_revision_id uuid
    references public.recurring_service_agreements (id) on delete restrict,
  add column cancellation_source text,
  add column cancellation_proration_rule text check (cancellation_proration_rule in ('pro_rata_days', 'none'));

comment on column public.recurring_services.cancellation_notice_months is
  'The notice applied to this cancellation, in calendar months; fixed with the request.';
comment on column public.recurring_services.cancellation_contractual_ends_on is
  'The last day the notice and any minimum term give; ends_on differs only by an agreed deviation.';
comment on column public.recurring_services.cancellation_minimum_term_months is
  'The minimum term applied to this cancellation, when one was agreed; null when none.';
comment on column public.recurring_services.cancellation_deviation_source_kind is
  'The later agreement on which the last day deviates from the contractual one; required when it falls inside the minimum term.';
comment on column public.recurring_services.cancellation_agreement_revision_id is
  'The agreement revision the notice was read from; null when the general terms applied without a recorded revision.';

create index recurring_services_cancellation_revision_idx
  on public.recurring_services (cancellation_agreement_revision_id) where cancellation_agreement_revision_id is not null;

-- --------------------------------------------------------------- backfill

/*
  Every existing service gets its first revision: the general terms'
  standard, no deviation, and -- deliberately -- no set of general terms.
  Which set was made available with each of these agreements is not in the
  data, and a set published later does not apply to an existing agreement by
  itself (art. 29.1), so none is assumed. The revision says so in words; an
  admin who knows which set it was records a revision naming it, with its
  source. Nothing project-specific is invented either: a deviation agreed in
  an offer is the admin's to record.

  The revision takes effect from the earlier of the service's start and its
  creation day: not a date chosen to satisfy anything, but the first day the
  service existed, so the revision covers every day it has run.
*/
insert into public.recurring_service_agreements (
  recurring_service_id, customer_id, supersedes_id, effective_from,
  source_kind, source_label, terms_edition, terms_published_on, note
)
select
  s.id,
  s.customer_id,
  null,
  least(coalesce(s.starts_on, (s.created_at at time zone 'Europe/Amsterdam')::date), (s.created_at at time zone 'Europe/Amsterdam')::date),
  'standard_terms',
  'Algemene voorwaarden, versie niet historisch vastgesteld',
  null,
  null,
  'Vastgelegd bij de invoering van dienstafspraken: de standaard uit de algemene voorwaarden, zonder afwijking. Welke set van de voorwaarden bij deze overeenkomst hoort is niet uit de administratie af te leiden en wordt niet aangenomen.'
from public.recurring_services s
where not exists (
  select 1 from public.recurring_service_agreements a where a.recurring_service_id = s.id
);

/*
  A cancellation planned before this migration was decided on the one rule
  the code then had: one calendar month, the last term pro rata, no minimum
  term. That is written down now, so it stays explicable, and the
  contractual day is recomputed the way the code computed it -- one month
  after the request day (Amsterdam), less one day, clamped to the month's
  length. The source is the standard rule, with no claim about which set of
  terms it came from.
*/
update public.recurring_services s
set
  cancellation_notice_months = 1,
  cancellation_contractual_ends_on = ((s.cancellation_requested_at at time zone 'Europe/Amsterdam')::date + interval '1 month' - interval '1 day')::date,
  cancellation_agreement_revision_id = a.id,
  cancellation_source = a.source_label,
  cancellation_proration_rule = 'pro_rata_days'
from public.recurring_service_agreements a
where a.recurring_service_id = s.id
  and a.sequence = 1
  and s.cancellation_requested_at is not null
  and s.cancellation_notice_months is null;

-- The snapshot is written with the request and cleared with it.
alter table public.recurring_services
  add constraint recurring_services_cancellation_snapshot_complete check (
    ((cancellation_requested_at is null) = (cancellation_notice_months is null))
    and ((cancellation_requested_at is null) = (cancellation_contractual_ends_on is null))
    and ((cancellation_requested_at is null) = (cancellation_source is null))
    and ((cancellation_requested_at is null) = (cancellation_proration_rule is null))
    and (cancellation_requested_at is not null or cancellation_agreement_revision_id is null)
    and ((cancellation_minimum_term_months is null) = (cancellation_minimum_term_ends_on is null))
    and (cancellation_requested_at is not null or cancellation_minimum_term_months is null)
  ),
  -- A deviation's provenance is whole or absent, and only with a cancellation.
  add constraint recurring_services_cancellation_deviation_complete check (
    ((cancellation_deviation_source_kind is null)
      and (cancellation_deviation_source_label is null)
      and (cancellation_deviation_agreed_on is null)
      and (cancellation_deviation_reason is null))
    or (cancellation_requested_at is not null
      and cancellation_deviation_source_kind is not null
      and cancellation_deviation_source_label is not null
      and cancellation_deviation_agreed_on is not null
      and cancellation_deviation_reason is not null)
  ),
  -- A last day other than the contractual one exists only on a recorded agreement.
  add constraint recurring_services_deviation_has_source check (
    cancellation_contractual_ends_on is null
    or ends_on = cancellation_contractual_ends_on
    or cancellation_deviation_source_kind is not null
  ),
  -- Provenance names a deviation; the contractual day itself needs none.
  add constraint recurring_services_deviation_is_deviation check (
    cancellation_deviation_source_kind is null or ends_on <> cancellation_contractual_ends_on
  );

-- ------------------------------------------- a used service is not removed

/*
  No role the application runs as can delete a recurring service: the
  grants above hand out no delete, and the application has no path that
  tries. Stated here as well, for the roles that could: a service that has
  collected, has been cancelled, has invoices, price changes or
  announcements -- history that other tables would cascade away or orphan
  (invoices and credit notes keep their rows but lose the link) -- is not
  removed by anyone. A draft that never went anywhere may go, which is
  what local test stages rely on.
*/
create or replace function private.refuse_used_recurring_service_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.mollie_subscription_id is not null
     or old.cancellation_requested_at is not null
     or old.status not in ('draft', 'awaiting_mandate')
     or exists (select 1 from public.invoices where recurring_service_id = old.id)
     or exists (select 1 from public.recurring_price_changes where recurring_service_id = old.id)
     or exists (select 1 from public.debit_prenotifications where recurring_service_id = old.id)
  then
    raise exception 'Dienst % heeft financiële of contractuele historie en wordt niet verwijderd.', old.id
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger recurring_services_refuse_used_delete
  before delete on public.recurring_services
  for each row execute function private.refuse_used_recurring_service_delete();

-- ------------------------------------------- creating a service, with terms

/*
  A new service and its first agreement revision are one write. The
  application used to insert the service and then the revision, and a
  failure of the second left a service that resolved to the standard by
  fallback -- indistinguishable from a legacy service whose terms are
  unknown. In one function, in one transaction, either both exist or
  neither does.

  SECURITY INVOKER: the row level security of both tables decides, as for
  any insert by the admin. The revision names the set of general terms
  published today, which is what a service made today is sold under; the
  caller passes it rather than the function assuming it, so the function
  has no opinion about which set is current.
*/
create or replace function public.create_recurring_service(
  p_customer_id        uuid,
  p_name               text,
  p_description        text,
  p_amount_cents       integer,
  p_vat_rate           integer,
  p_starts_on          date,
  p_status             text,
  p_effective_from     date,
  p_terms_edition      text,
  p_terms_published_on date,
  p_note               text,
  p_created_by         uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_service_id uuid;
begin
  insert into public.recurring_services (customer_id, name, description, amount_cents, vat_rate, billing_interval, starts_on, status)
  values (p_customer_id, p_name, p_description, p_amount_cents, p_vat_rate, 'monthly', p_starts_on, p_status)
  returning id into v_service_id;

  insert into public.recurring_service_agreements (
    recurring_service_id, customer_id, supersedes_id, effective_from,
    source_kind, source_label, terms_edition, terms_published_on, note, created_by
  )
  values (
    v_service_id, p_customer_id, null, p_effective_from,
    'standard_terms', 'Algemene Voorwaarden B2B ' || p_terms_edition, p_terms_edition, p_terms_published_on, p_note, p_created_by
  );

  return v_service_id;
end;
$$;

comment on function public.create_recurring_service(uuid, text, text, integer, integer, date, text, date, text, date, text, uuid) is
  'Creates a recurring service together with its first agreement revision, in one transaction; neither exists without the other.';

revoke all on function public.create_recurring_service(uuid, text, text, integer, integer, date, text, date, text, date, text, uuid) from public, anon;
grant execute on function public.create_recurring_service(uuid, text, text, integer, integer, date, text, date, text, date, text, uuid) to authenticated;
