-- Analytics aggregates, synchronised from providers.
--
-- One row per provider, report, day and combination of dimensions, with the
-- metrics for that combination as numbers. "Google Analytics, sources,
-- 2026-09-22, {channel: Organic Search, source_medium: google / organic},
-- {sessions: 12, engaged_sessions: 9, key_events: 1}". That is the whole
-- content: counts per day per dimension, as the provider already reports
-- them. No event, no session, no client id, no IP, no path of an individual
-- visit. The retention of these rows (26 months, lib/analytics-admin/runner.ts)
-- is housekeeping, not a privacy term, because nothing in them is personal.
--
-- The provider list is the one the design names; only ga4 is written today.
-- Search Console, Bing and Clarity get an adapter later and fit without a
-- schema change.
--
-- Key. `dims` is jsonb, and jsonb does have a btree operator class, so
-- (provider, report, date, dims) could be a primary key directly. It is not,
-- for two reasons: a btree entry may not exceed about a third of a page,
-- which a wide dimension set (a landing page plus query string) can
-- approach; and PostgREST's ON CONFLICT needs plain column names. So the key
-- is a generated column: md5 of the canonical text of the jsonb. jsonb
-- normalises key order and whitespace on storage, so two dimension sets
-- that are equal as JSON produce the same text and the same hash, which is
-- what makes the upsert idempotent.

create table public.analytics_facts (
  provider   text        not null check (provider in ('ga4', 'gsc', 'bing', 'clarity', 'site')),
  report     text        not null check (report ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
  date       date        not null,
  dims       jsonb       not null default '{}'::jsonb check (jsonb_typeof(dims) = 'object'),
  dims_key   text        generated always as (md5(dims::text)) stored,
  metrics    jsonb       not null check (jsonb_typeof(metrics) = 'object'),
  synced_at  timestamptz not null default now(),

  primary key (provider, report, date, dims_key)
);

comment on table public.analytics_facts is 'Daily aggregates per provider and report: dimensions and metrics as the provider reports them. No visitor-level data.';
comment on column public.analytics_facts.dims_key is 'md5 of the canonical jsonb text of dims; the part of the key that makes an upsert idempotent.';

create index analytics_facts_report_date_idx on public.analytics_facts (provider, report, date desc);

-- What each sync did, one row per provider and report per run.
create table public.analytics_sync_runs (
  id            uuid        primary key default gen_random_uuid(),
  provider      text        not null check (provider in ('ga4', 'gsc', 'bing', 'clarity', 'site')),
  report        text        not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text        not null default 'running' check (status in ('running', 'ok', 'failed')),
  rows_upserted integer     check (rows_upserted >= 0),
  -- A short class of failure and, at most, an HTTP status: never a response
  -- body, never a credential, never a value from the data.
  error         text        check (length(error) <= 200)
);

comment on table public.analytics_sync_runs is 'Log of synchronisation runs. error holds a failure class only, never provider output.';

create index analytics_sync_runs_started_idx on public.analytics_sync_runs (provider, report, started_at desc);

-- Row level security: active admins read, nobody in the API writes. The
-- sync runs as a job without a session and writes through the server-side
-- secret-key client, which bypasses RLS by role; that client exists in one
-- module and is never in the browser.
alter table public.analytics_facts enable row level security;
alter table public.analytics_facts force row level security;
alter table public.analytics_sync_runs enable row level security;
alter table public.analytics_sync_runs force row level security;

revoke all on table public.analytics_facts from anon, authenticated;
revoke all on table public.analytics_sync_runs from anon, authenticated;

grant select on table public.analytics_facts to authenticated;
grant select on table public.analytics_sync_runs to authenticated;

create policy analytics_facts_admin_read on public.analytics_facts
  for select to authenticated using (private.is_admin());
create policy analytics_sync_runs_admin_read on public.analytics_sync_runs
  for select to authenticated using (private.is_admin());

-- Deliberately no insert, update or delete policy and no such grant: with
-- RLS forced, every write from anon or authenticated is refused.
