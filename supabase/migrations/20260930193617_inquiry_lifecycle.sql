-- Inquiry lifecycle: the business outcome of a website request.
--
-- Until now an inquiry had a handling status (new, viewed, follow_up,
-- qualified, completed, rejected), one overwritten note, and nothing that
-- said when a stage was reached, why a lead was lost, or what it was worth.
-- This migration turns the status into a six-stage lifecycle and records
-- every change as a fact:
--
--   status           new -> contacted -> qualified -> quote_sent -> won, or
--                    lost (terminal, with a reason). Stages may be skipped;
--                    what was recorded is what happened. Reporting semantics
--                    (a won lead was qualified) live in the view below, never
--                    in fabricated rows.
--   status_changed_at  the moment of the last status change, kept by the
--                    trigger, for the work queue and list sorting.
--   lost_reason      required exactly when the status is lost; spam and
--                    duplicate mark a request that was never a lead.
--   service_interest the service the request is about, when known; the
--                    values mirror `serviceKeys` in lib/content/services.ts.
--   quoted_value_cents, won_value_cents, recurring_monthly_cents
--                    the CURRENT business values on the row, EUR excluding
--                    VAT, one-off and monthly kept apart. Convenience values
--                    for the admin; the immutable value at the moment of the
--                    outcome is on the event row, and realised revenue stays
--                    in invoices and payments. Nothing here is accounting.
--   lead_event_id    the id the browser reports to Google Ads (transaction_id)
--                    and Meta (event_id) for the primary Lead; the route makes
--                    it before the insert and returns the same value.
--   marketing_consent, consent_version, consent_decided_at
--                    the visitor's consent choice as the request's own cookie
--                    carried it at capture: whether marketing was allowed,
--                    under which text version, decided when. Null when there
--                    was no current choice. Provenance for any later sharing
--                    of outcomes with an advertising platform; the follow-up
--                    migration 20260930194155 refuses a click id without a
--                    recorded yes.
--   adgroup_id, match_type
--                    Google Ads' `{adgroupid}` and `{matchtype}` from the
--                    landing URL, next to utm_term (the MATCHED KEYWORD, not
--                    the search term the visitor typed, which no landing URL
--                    carries) and utm_content (the creative id).
--
-- History: `inquiry_status_events`, one row per status change and per
-- correction of a lost reason, written by a trigger so no code path can
-- forget it. The quote_sent event carries the quoted value and the won event
-- the won one-off and monthly values as they were at that moment; a later
-- edit of the row's current values never touches them.
--
-- Legacy statuses: viewed -> new and follow_up -> contacted are handling
-- states with one obvious stage. completed and rejected are not: completed
-- could be won or merely closed, rejected could be spam or a lost deal, and
-- a click id without a consent snapshot cannot be given one afterwards. Such
-- rows make the migration ABORT with a report rather than guess.
--
-- Apply BEFORE deploying the code that writes the new columns (the intake
-- falls back to an insert without them; the admin needs them to load).

-- 1. Legacy guard. ------------------------------------------------------------

do $guard$
declare
  v_ambiguous bigint;
  v_detail    text;
  v_clicks    bigint;
begin
  select coalesce(sum(n), 0), string_agg(status || ': ' || n, ', ')
    into v_ambiguous, v_detail
    from (
      select status, count(*) as n
      from public.inquiries
      where status not in ('new', 'viewed', 'follow_up', 'qualified')
      group by status
    ) s;

  if v_ambiguous > 0 then
    raise exception 'inquiry_lifecycle: % inquiries carry a status with no unambiguous lifecycle stage (%). Set each to won, or lost with a reason, by hand; then apply again.',
      v_ambiguous, v_detail
      using errcode = 'check_violation';
  end if;

  select count(*) into v_clicks
    from public.inquiries
    where gclid is not null or gbraid is not null or wbraid is not null;

  if v_clicks > 0 then
    raise exception 'inquiry_lifecycle: % inquiries hold a Google Ads click id from before consent snapshots existed; their consent version cannot be reconstructed. Clear the click ids or record the snapshot by hand; then apply again.',
      v_clicks
      using errcode = 'check_violation';
  end if;
end
$guard$;

-- 2. Status re-enumeration. ---------------------------------------------------

alter table public.inquiries drop constraint inquiries_status_check;

update public.inquiries set status = 'contacted' where status = 'follow_up';
update public.inquiries set status = 'new' where status = 'viewed';

alter table public.inquiries
  add constraint inquiries_status_check
  check (status in ('new', 'contacted', 'qualified', 'quote_sent', 'won', 'lost'));

-- 3. Lifecycle, value, provenance and paid-search columns. -------------------

alter table public.inquiries
  add column status_changed_at       timestamptz not null default now(),
  add column lost_reason             text
    check (lost_reason in ('no_response', 'price', 'wrong_fit', 'chose_competitor', 'postponed', 'spam', 'duplicate', 'other')),
  add column service_interest        text
    check (service_interest in (
      'business-websites', 'ecommerce-development', 'landing-pages', 'web-app-development',
      '3d-configurators', 'integrations-automation', 'redesign-optimization', 'performance-optimization'
    )),
  add column quoted_value_cents      integer check (quoted_value_cents >= 0),
  add column won_value_cents         integer check (won_value_cents >= 0),
  add column recurring_monthly_cents integer check (recurring_monthly_cents >= 0),
  add column currency                text not null default 'EUR' check (currency = 'EUR'),
  add column lead_event_id           uuid,
  add column marketing_consent       boolean,
  add column consent_version         smallint check (consent_version between 1 and 9999),
  add column consent_decided_at      timestamptz,
  add column adgroup_id              text check (length(adgroup_id) <= 40),
  add column match_type              text check (length(match_type) <= 20);

-- Existing rows: the last activity is the best-known moment of their status.
update public.inquiries set status_changed_at = updated_at;

comment on column public.inquiries.status is
  'Lifecycle stage: new, contacted, qualified, quote_sent, won, or lost (terminal, needs lost_reason). Stages may be skipped; see inquiry_funnel for reporting semantics.';
comment on column public.inquiries.status_changed_at is 'When the status last changed; maintained by the trigger.';
comment on column public.inquiries.lost_reason is 'Why the request was lost; spam and duplicate mean it never was a lead. Present exactly when status is lost.';
comment on column public.inquiries.service_interest is 'The service this request is about, when known; values mirror serviceKeys in lib/content/services.ts.';
comment on column public.inquiries.quoted_value_cents is 'CURRENT quoted value, EUR excluding VAT. Business snapshot, not accounting; the value at the moment of quote_sent is on the event.';
comment on column public.inquiries.won_value_cents is 'CURRENT expected one-off revenue, EUR excluding VAT. Business snapshot, not accounting; invoices and payments are the realised truth.';
comment on column public.inquiries.recurring_monthly_cents is 'CURRENT expected monthly recurring value, EUR excluding VAT, per month; never multiplied here.';
comment on column public.inquiries.lead_event_id is 'The id reported to Google Ads (transaction_id) and Meta (event_id) for the primary Lead of this request.';
comment on column public.inquiries.marketing_consent is 'The marketing choice in the request''s own consent cookie at capture; null when there was no current choice.';
comment on column public.inquiries.consent_version is 'CONSENT_VERSION the choice was given under (lib/consent/consent.ts).';
comment on column public.inquiries.consent_decided_at is 'When the visitor made that choice, as the cookie records it.';
comment on column public.inquiries.adgroup_id is 'Google Ads ad group id ({adgroupid}) of the landing URL, cleaned like campaign.';
comment on column public.inquiries.match_type is 'Google Ads match type ({matchtype}: e, p, b) of the landing URL, cleaned like campaign.';
comment on column public.inquiries.utm_term is 'utm_term of the landing URL: for a search ad the keyword Google MATCHED ({keyword}), never the search term the visitor typed. Cleaned like campaign.';

alter table public.inquiries
  add constraint inquiries_lost_reason_matches_status
    check ((status = 'lost') = (lost_reason is not null)),
  add constraint inquiries_consent_snapshot_shape
    check (
      (marketing_consent is null and consent_version is null and consent_decided_at is null)
      or (marketing_consent is not null and consent_version is not null and consent_decided_at is not null)
    ),
  -- The rule that a stored click id needs a recorded yes to marketing is
  -- 20260930194155_inquiry_click_ids_need_consent, applied after the code
  -- that writes the consent snapshot is live: the intake deployed before it
  -- writes click ids without the snapshot, and would be refused in the
  -- minutes between this migration and that deployment.
  add constraint inquiries_ads_extras_need_attribution
    check ((adgroup_id is null and match_type is null) or traffic_class is not null);

create index inquiries_status_changed_at_idx on public.inquiries (status_changed_at desc);

-- 4. Intake: the visitor's insert grows by exactly these columns. ------------

grant insert (lead_event_id, marketing_consent, consent_version, consent_decided_at, adgroup_id, match_type)
  on table public.inquiries to anon;

drop policy if exists inquiries_public_intake on public.inquiries;
create policy inquiries_public_intake
  on public.inquiries
  for insert
  to anon
  with check (
    status = 'new'
    and internal_note is null
    and lost_reason is null
    and service_interest is null
    and quoted_value_cents is null
    and won_value_cents is null
    and recurring_monthly_cents is null
    and length(btrim(name)) between 2 and 200
    and length(btrim(email)) <= 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and length(btrim(message)) <= 20000
    and (origin = 'websitecheck' or length(btrim(message)) >= 1)
    and length(coalesce(company, '')) <= 200
    and length(coalesce(phone, '')) <= 60
    and (
      planner is null
      or (jsonb_typeof(planner) = 'object' and pg_column_size(planner) <= 65536)
    )
    and (traffic_source is null or traffic_source ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (traffic_medium is null or traffic_medium ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (campaign is null or campaign ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (landing_path is null or landing_path ~ '^/[^[:space:][:cntrl:]<>"''`\\]*$')
    and (utm_term is null or utm_term ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (utm_content is null or utm_content ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (adgroup_id is null or adgroup_id ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (match_type is null or match_type ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (consent_decided_at is null or consent_decided_at <= now() + interval '5 minutes')
  );

-- 5. History. -----------------------------------------------------------------

create table public.inquiry_status_events (
  id                      uuid primary key default gen_random_uuid(),
  inquiry_id              uuid not null references public.inquiries (id) on delete cascade,
  from_status             text,
  to_status               text not null
    check (to_status in ('new', 'contacted', 'qualified', 'quote_sent', 'won', 'lost')),
  lost_reason             text
    check (lost_reason in ('no_response', 'price', 'wrong_fit', 'chose_competitor', 'postponed', 'spam', 'duplicate', 'other')),
  /* The value at the moment of the outcome: the quoted value on a quote_sent
     event, the won one-off value on a won event. Immutable: nothing updates
     this table. */
  value_cents             integer check (value_cents >= 0),
  recurring_monthly_cents integer check (recurring_monthly_cents >= 0),
  currency                text check (currency = 'EUR'),
  changed_at              timestamptz not null default now(),
  /* auth.uid() of the admin who made the change; null for a system job. */
  changed_by              uuid,

  constraint inquiry_status_events_lost_reason_matches
    check ((to_status = 'lost') = (lost_reason is not null)),
  constraint inquiry_status_events_values_on_outcomes
    check ((value_cents is null and recurring_monthly_cents is null) or to_status in ('quote_sent', 'won')),
  constraint inquiry_status_events_currency_with_values
    check ((value_cents is null and recurring_monthly_cents is null) = (currency is null))
);

comment on table public.inquiry_status_events is
  'Immutable log of inquiry status changes and lost-reason corrections, written by the trigger on inquiries. A from_status equal to to_status (lost -> lost) is a corrected reason.';
comment on column public.inquiry_status_events.value_cents is
  'quote_sent: the quoted value; won: the won one-off value; EUR excluding VAT, as it was at that moment.';
comment on column public.inquiry_status_events.recurring_monthly_cents is
  'won: the expected monthly recurring value at that moment, EUR excluding VAT.';

create index inquiry_status_events_inquiry_idx on public.inquiry_status_events (inquiry_id, changed_at);

-- SECURITY DEFINER: the log is written under the admin's session, but the
-- table accepts no direct writes from anyone. Empty search_path, private
-- schema, as private.is_admin().
create or replace function private.inquiry_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_value     integer;
  v_recurring integer;
begin
  -- clock_timestamp(), not now(): two changes inside one transaction (a
  -- script, a batch) must still be ordered, and an audit moment is the
  -- moment of the statement, not of the transaction's start.
  if new.status is distinct from old.status then
    new.status_changed_at = clock_timestamp();
  end if;

  if new.status is distinct from old.status or new.lost_reason is distinct from old.lost_reason then
    if new.status = 'quote_sent' then
      v_value = new.quoted_value_cents;
    elsif new.status = 'won' then
      v_value = new.won_value_cents;
      v_recurring = new.recurring_monthly_cents;
    end if;

    insert into public.inquiry_status_events
      (inquiry_id, from_status, to_status, lost_reason, value_cents, recurring_monthly_cents, currency, changed_at, changed_by)
    values
      (new.id, old.status, new.status, new.lost_reason, v_value, v_recurring,
       case when v_value is null and v_recurring is null then null else new.currency end,
       clock_timestamp(), (select auth.uid()));
  end if;

  return new;
end;
$fn$;

comment on function private.inquiry_status_changed() is
  'Sets status_changed_at and appends one inquiry_status_events row per status change or lost-reason correction.';

revoke all on function private.inquiry_status_changed() from public, anon, authenticated;

create trigger inquiries_status_changed
  before update on public.inquiries
  for each row execute function private.inquiry_status_changed();

alter table public.inquiry_status_events enable row level security;
alter table public.inquiry_status_events force row level security;
revoke all on table public.inquiry_status_events from anon, authenticated;
grant select on table public.inquiry_status_events to authenticated;
create policy inquiry_status_events_admin_read on public.inquiry_status_events
  for select to authenticated using (private.is_admin());

-- 6. Reporting contract. ------------------------------------------------------
--
-- One row per inquiry. Recorded facts stay facts; reached stages are
-- derived here and say so in their names:
--
--   explicit_contacted_at   the first RECORDED contacted event: the only
--                           basis for response-time metrics
--   reached_contacted_at    earliest evidence the funnel reached contact or
--                           later (contacted, qualified, quote_sent, won)
--   reached_qualified_at    earliest evidence of qualified or later
--   quote_sent_at           an explicit quote_sent event only; won does not
--                           imply a quote
--   won_at / lost_at        only while the CURRENT status is won / lost, so a
--                           corrected mistake does not count
--   genuine                 not lost as spam or duplicate; the base of every rate
--   ads_*                   Google Ads vocabulary, only for google / cpc:
--                           campaign id, MATCHED keyword, creative id, ad group
--                           id, match type. The search term is not captured.
--   invoiced_net_cents / paid_gross_cents
--                           realised revenue through the customer this
--                           inquiry became: accounting truth, next to the
--                           business snapshots, never mixed.

create view public.inquiry_funnel
with (security_invoker = on)
as
with ev as (
  select
    inquiry_id,
    min(changed_at) filter (where to_status = 'contacted')                                         as explicit_contacted_at,
    min(changed_at) filter (where to_status in ('contacted', 'qualified', 'quote_sent', 'won'))    as reached_contacted_at,
    min(changed_at) filter (where to_status in ('qualified', 'quote_sent', 'won'))                 as reached_qualified_at,
    min(changed_at) filter (where to_status = 'quote_sent')                                        as quote_sent_at,
    min(changed_at) filter (where to_status = 'won')                                               as first_won_at,
    max(changed_at) filter (where to_status = 'lost')                                              as last_lost_at
  from public.inquiry_status_events
  group by inquiry_id
),
realised as (
  select
    c.source_inquiry_id as inquiry_id,
    c.id                as customer_id,
    (
      select coalesce(sum(round(l.quantity_hundredths * l.unit_price_cents / 100.0)), 0)::bigint
      from public.invoices i
      join public.invoice_lines l on l.invoice_id = i.id
      where i.customer_id = c.id and i.status in ('sent', 'overdue', 'paid')
    ) as invoiced_net_cents,
    (
      select coalesce(sum(p.amount_cents), 0)::bigint
      from public.payments p
      where p.customer_id = c.id and p.status = 'paid'
    ) as paid_gross_cents
  from public.customers c
  where c.source_inquiry_id is not null
)
select
  q.id,
  q.received_at,
  q.origin,
  q.status,
  q.lost_reason,
  q.status_changed_at,
  q.service_interest,
  q.traffic_class,
  q.traffic_source,
  q.traffic_medium,
  q.campaign,
  q.landing_path,
  (q.gclid is not null or q.gbraid is not null or q.wbraid is not null)                       as has_ads_click,
  case when q.traffic_source = 'google' and q.traffic_medium = 'cpc' then q.campaign    end   as ads_campaign_id,
  case when q.traffic_source = 'google' and q.traffic_medium = 'cpc' then q.utm_term    end   as ads_matched_keyword,
  case when q.traffic_source = 'google' and q.traffic_medium = 'cpc' then q.utm_content end   as ads_creative_id,
  case when q.traffic_source = 'google' and q.traffic_medium = 'cpc' then q.adgroup_id  end   as ads_adgroup_id,
  case when q.traffic_source = 'google' and q.traffic_medium = 'cpc' then q.match_type  end   as ads_match_type,
  q.marketing_consent,
  q.consent_version,
  not (q.status = 'lost' and q.lost_reason in ('spam', 'duplicate'))                           as genuine,
  ev.explicit_contacted_at,
  ev.reached_contacted_at,
  ev.reached_qualified_at,
  ev.quote_sent_at,
  case when q.status = 'won'  then ev.first_won_at end                                        as won_at,
  case when q.status = 'lost' then ev.last_lost_at end                                        as lost_at,
  q.quoted_value_cents,
  q.won_value_cents,
  q.recurring_monthly_cents,
  q.currency,
  r.customer_id,
  r.invoiced_net_cents,
  r.paid_gross_cents
from public.inquiries q
left join ev on ev.inquiry_id = q.id
left join realised r on r.inquiry_id = q.id;

comment on view public.inquiry_funnel is
  'Reporting contract per inquiry: recorded facts plus derived reached-stage timestamps (reached_* imply earlier stages; explicit_contacted_at is the recorded contact only). Business snapshots and realised revenue side by side.';

revoke all on public.inquiry_funnel from anon, authenticated;
grant select on public.inquiry_funnel to authenticated;
