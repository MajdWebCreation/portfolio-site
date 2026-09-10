-- Definitive document numbers.
--
-- A quote or invoice keeps its provisional OFF-CONCEPT-* / FAC-CONCEPT-*
-- number until it is actually issued. Issuing happens here and nowhere else:
-- the client cannot compose a number, and no code counts existing rows.
--
-- The counter is a row per (kind, year). Handing out a number is one
-- statement -- an upsert that increments and returns the value it replaced --
-- so two admins pressing send at the same moment queue on that row's lock and
-- get consecutive numbers. There is no MAX()+1 anywhere, so a deleted or
-- cancelled document can never hand its number to a second one.

create table public.document_counters (
  kind          text        not null check (kind in ('quote', 'invoice')),
  year          integer     not null check (year between 2000 and 2999),
  next_sequence integer     not null default 1 check (next_sequence >= 1),
  updated_at    timestamptz not null default now(),

  primary key (kind, year)
);

comment on table public.document_counters is
  'One counter per document kind and year; the only source of definitive document numbers.';
comment on column public.document_counters.next_sequence is
  'The number the next document will get. Never derived from existing documents.';

alter table public.document_counters enable row level security;
alter table public.document_counters force row level security;

revoke all on table public.document_counters from anon, authenticated;
grant select, insert, update on table public.document_counters to authenticated;

create policy document_counters_admin_all on public.document_counters
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Reserves the next sequence number for a kind and year, atomically.
--
-- The upsert both creates the counter on first use and increments it after,
-- and `returning next_sequence - 1` yields the value this caller reserved: 1
-- on the insert (which writes 2), and the previous value on every conflict.
-- One statement, one lock, no read-then-write window.
create or replace function private.next_document_sequence(p_kind text, p_year integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sequence integer;
begin
  insert into public.document_counters (kind, year, next_sequence)
  values (p_kind, p_year, 2)
  on conflict (kind, year) do update
    set next_sequence = public.document_counters.next_sequence + 1,
        updated_at = now()
  returning next_sequence - 1 into v_sequence;

  return v_sequence;
end;
$$;

revoke all on function private.next_document_sequence(text, integer) from public, anon;
grant execute on function private.next_document_sequence(text, integer) to authenticated;

-- Assigning a number to a document.
--
-- `for update` on the document row is what makes a retry safe: a second call
-- for the same document waits, then sees a number that is no longer
-- provisional and returns exactly that one. A double click, a failed send
-- that is tried again, two tabs -- all get the same number, and the counter
-- moves once.
--
-- The year comes from the document's own issue date, not from the clock, so a
-- document dated last December is numbered in that year's series.
--
-- SECURITY INVOKER: the caller's own rights apply, so the admin policies on
-- quotes, invoices and the counter decide. Anon holds no rights on any of
-- them and cannot reach this.
create or replace function public.assign_quote_number(p_quote_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_value       text;
  v_provisional boolean;
  v_year        integer;
  v_sequence    integer;
begin
  select number_value, number_provisional, extract(year from issue_date)::integer
    into v_value, v_provisional, v_year
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'Onbekende offerte.' using errcode = 'P0002';
  end if;

  if not v_provisional then
    return v_value;
  end if;

  v_sequence := private.next_document_sequence('quote', v_year);
  v_value := 'YM-O-' || v_year::text || '-' || lpad(v_sequence::text, 6, '0');

  update public.quotes
     set number_value = v_value,
         number_provisional = false
   where id = p_quote_id;

  return v_value;
end;
$$;

create or replace function public.assign_invoice_number(p_invoice_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_value       text;
  v_provisional boolean;
  v_year        integer;
  v_sequence    integer;
begin
  select number_value, number_provisional, extract(year from issue_date)::integer
    into v_value, v_provisional, v_year
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Onbekende factuur.' using errcode = 'P0002';
  end if;

  if not v_provisional then
    return v_value;
  end if;

  v_sequence := private.next_document_sequence('invoice', v_year);
  v_value := 'YM-F-' || v_year::text || '-' || lpad(v_sequence::text, 6, '0');

  update public.invoices
     set number_value = v_value,
         number_provisional = false
   where id = p_invoice_id;

  return v_value;
end;
$$;

comment on function public.assign_quote_number(uuid) is
  'Issues YM-O-YYYY-NNNNNN once; a later call returns the number already issued.';
comment on function public.assign_invoice_number(uuid) is
  'Issues YM-F-YYYY-NNNNNN once; a later call returns the number already issued.';

revoke all on function public.assign_quote_number(uuid) from public, anon;
revoke all on function public.assign_invoice_number(uuid) from public, anon;
grant execute on function public.assign_quote_number(uuid) to authenticated;
grant execute on function public.assign_invoice_number(uuid) to authenticated;

-- A definitive number is unique; provisional ones are not compared at all.
create unique index quotes_definitive_number_unique
  on public.quotes (number_value) where not number_provisional;
create unique index invoices_definitive_number_unique
  on public.invoices (number_value) where not number_provisional;
