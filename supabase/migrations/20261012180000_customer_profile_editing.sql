-- A customer edits their own details in the portal.
--
-- `customers` is the customer as they are now; every document copied what it
-- needed when it was made (the customer_* columns of quotes, invoices and
-- credit notes, frozen with them) and keeps that copy. So an edit here reaches
-- the next document and the next mail, and no document that already exists.
--
-- Three things are added:
--
--   customers.billing_email           where financial mail goes, when it
--                                     should not go to the contact address
--   customer_profile_changes          an append-only record of who changed
--                                     which detail, written by a trigger in the
--                                     same transaction as the change, for the
--                                     admin and the portal alike
--   portal_customer_profile(customer)            the details plus the version
--   portal_update_customer_profile(customer, …)  the one write a member has
--
-- No customer gets a policy on `customers`. The write is a SECURITY DEFINER
-- function whose parameters ARE the whitelist: there is no parameter for
-- notes, status, sources or anything else, so nothing else can be named.

-- ------------------------------------------------------- billing address

alter table public.customers
  add column billing_email text
    check (
      billing_email is null
      or (length(billing_email) <= 254 and billing_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    );

comment on column public.customers.billing_email is
  'Where invoices, reminders, credit notes and other financial mail go. Null: the contact address (email). Never the portal sign-in address, which lives in auth.users.';

-- ----------------------------------------------------------------- audit

create table public.customer_profile_changes (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers (id) on delete cascade,
  actor_user_id    uuid,
  actor_kind       text not null check (actor_kind in ('customer', 'admin', 'system')),
  changed_fields   text[] not null check (cardinality(changed_fields) > 0),
  /*
    Old and new values of the business identifiers only (company name, KvK,
    VAT id). Personal details -- the contact person, addresses, phone, e-mail
    -- are recorded as "changed", never with their values.
  */
  business_changes jsonb not null default '{}'::jsonb,
  occurred_at      timestamptz not null default now()
);

comment on table public.customer_profile_changes is
  'Append-only: which customer details changed, when and by whom (customer via the portal, admin, or system). Values only for company name, KvK and VAT id.';

create index customer_profile_changes_customer_idx on public.customer_profile_changes (customer_id, occurred_at desc);

alter table public.customer_profile_changes enable row level security;
alter table public.customer_profile_changes force row level security;

revoke all on table public.customer_profile_changes from anon, authenticated;
/* Append-only for the system client too: only the trigger below writes, as the table's owner. */
revoke insert, update, delete, truncate on table public.customer_profile_changes from service_role;
grant select on table public.customer_profile_changes to authenticated;

create policy customer_profile_changes_admin_read
  on public.customer_profile_changes for select to authenticated
  using (private.is_admin());

/*
  Written by the trigger below and by nothing else: no role has insert,
  update or delete on the table. The trigger function is a definer for that
  reason. Who acted: an admin session is the admin, whatever path it took;
  otherwise the portal function's own mark, set for the length of its
  transaction, makes it the customer's; anything else (a job on the system
  client) is "system".
*/
create or replace function private.record_customer_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields   text[] := '{}';
  v_business jsonb  := '{}'::jsonb;
  v_kind     text;
begin
  if new.company_name is distinct from old.company_name then
    v_fields := array_append(v_fields, 'company_name');
    v_business := v_business || jsonb_build_object('company_name', jsonb_build_object('from', old.company_name, 'to', new.company_name));
  end if;
  if new.kvk_number is distinct from old.kvk_number then
    v_fields := array_append(v_fields, 'kvk_number');
    v_business := v_business || jsonb_build_object('kvk_number', jsonb_build_object('from', old.kvk_number, 'to', new.kvk_number));
  end if;
  if new.vat_number is distinct from old.vat_number then
    v_fields := array_append(v_fields, 'vat_number');
    v_business := v_business || jsonb_build_object('vat_number', jsonb_build_object('from', old.vat_number, 'to', new.vat_number));
  end if;
  if new.contact_name  is distinct from old.contact_name  then v_fields := array_append(v_fields, 'contact_name');  end if;
  if new.email         is distinct from old.email         then v_fields := array_append(v_fields, 'email');         end if;
  if new.billing_email is distinct from old.billing_email then v_fields := array_append(v_fields, 'billing_email'); end if;
  if new.phone         is distinct from old.phone         then v_fields := array_append(v_fields, 'phone');         end if;
  if new.street        is distinct from old.street        then v_fields := array_append(v_fields, 'street');        end if;
  if new.postal_code   is distinct from old.postal_code   then v_fields := array_append(v_fields, 'postal_code');   end if;
  if new.city          is distinct from old.city          then v_fields := array_append(v_fields, 'city');          end if;
  if new.country       is distinct from old.country       then v_fields := array_append(v_fields, 'country');       end if;

  if cardinality(v_fields) = 0 then
    return new;
  end if;

  /* An admin session is the admin's change whatever path it took; the portal's own mark is asked second. */
  v_kind := case
    when private.is_admin() then 'admin'
    when coalesce(current_setting('ym.profile_actor', true), '') = 'customer' then 'customer'
    else 'system'
  end;

  insert into public.customer_profile_changes (customer_id, actor_user_id, actor_kind, changed_fields, business_changes)
  values (new.id, (select auth.uid()), v_kind, v_fields, v_business);

  return new;
end;
$$;

revoke all on function private.record_customer_profile_change() from public, anon, authenticated;

create trigger customers_record_profile_change
  after update on public.customers
  for each row execute function private.record_customer_profile_change();

-- ---------------------------------------------------------- portal read

/*
  The details a member may see and edit, with the version the edit has to
  name. portal_customer stays as it was for the pages already deployed.
*/
create or replace function public.portal_customer_profile(p_customer_id uuid)
returns table (
  company_name  text,
  contact_name  text,
  email         text,
  billing_email text,
  phone         text,
  street        text,
  postal_code   text,
  city          text,
  country       text,
  kvk_number    text,
  vat_number    text,
  updated_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.portal_require_customer(p_customer_id);

  return query
    select c.company_name, c.contact_name, c.email, c.billing_email, c.phone, c.street, c.postal_code,
           c.city, c.country, c.kvk_number, c.vat_number, c.updated_at
    from public.customers c
    where c.id = p_customer_id;
end;
$$;

comment on function public.portal_customer_profile(uuid) is
  'The editable details of one of the caller''s customers and their version (updated_at). No notes, status, source or attribution.';

revoke all on function public.portal_customer_profile(uuid) from public, anon;
grant execute on function public.portal_customer_profile(uuid) to authenticated;

-- --------------------------------------------------------- portal write

/*
  The one change a member can make to a customer.

  Its parameters are the whitelist. The member names the version they read
  (updated_at); a row that changed since -- another tab, a colleague, the
  admin -- is not overwritten: the answer is `conflict` with nothing written.
  Values are trimmed and checked here as well as in the application, so a
  call that goes around the form meets the same rules. An edit that changes
  nothing writes nothing and records nothing.

  Outcomes: updated | unchanged | conflict. Invalid input raises 22023 with
  the field in the message ("invalid:<field>"), no data.
*/
create or replace function public.portal_update_customer_profile(
  p_customer_id         uuid,
  p_expected_updated_at timestamptz,
  p_company_name        text,
  p_contact_name        text,
  p_email               text,
  p_billing_email       text,
  p_phone               text,
  p_street              text,
  p_postal_code         text,
  p_city                text,
  p_country             text,
  p_kvk_number          text,
  p_vat_number          text
)
returns table (outcome text, updated_at timestamptz, changed_fields text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email_pattern constant text := '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
  v_row           public.customers%rowtype;
  v_company       text := btrim(coalesce(p_company_name, ''));
  v_contact       text := btrim(coalesce(p_contact_name, ''));
  v_email         text := btrim(coalesce(p_email, ''));
  v_billing       text := nullif(btrim(coalesce(p_billing_email, '')), '');
  v_phone         text := nullif(regexp_replace(btrim(coalesce(p_phone, '')), '\s+', ' ', 'g'), '');
  v_street        text := btrim(coalesce(p_street, ''));
  v_postal        text := btrim(coalesce(p_postal_code, ''));
  v_city          text := btrim(coalesce(p_city, ''));
  v_country       text := coalesce(nullif(btrim(coalesce(p_country, '')), ''), 'Nederland');
  v_kvk           text := nullif(btrim(coalesce(p_kvk_number, '')), '');
  v_vat           text := nullif(btrim(coalesce(p_vat_number, '')), '');
  v_fields        text[] := '{}';
  v_updated_at    timestamptz;
begin
  perform private.portal_require_customer(p_customer_id);

  /* Plain text only: no markup, no control characters, in any field. */
  if concat_ws(' ', v_company, v_contact, v_email, v_billing, v_phone, v_street, v_postal, v_city, v_country, v_kvk, v_vat) ~ '[<>[:cntrl:]]' then
    raise exception 'invalid:text' using errcode = '22023';
  end if;
  /* A phone number is digits and the usual separators, nothing more. */
  if v_phone is not null and v_phone !~ '^[0-9+()./ -]+$' then raise exception 'invalid:phone' using errcode = '22023'; end if;

  if v_company = '' or length(v_company) > 200 then raise exception 'invalid:company_name' using errcode = '22023'; end if;
  if v_contact = '' or length(v_contact) > 120 then raise exception 'invalid:contact_name' using errcode = '22023'; end if;
  if length(v_email) > 254 or v_email !~ v_email_pattern then raise exception 'invalid:email' using errcode = '22023'; end if;
  if v_billing is not null and (length(v_billing) > 254 or v_billing !~ v_email_pattern) then raise exception 'invalid:billing_email' using errcode = '22023'; end if;
  if v_phone is not null and length(v_phone) > 40 then raise exception 'invalid:phone' using errcode = '22023'; end if;
  if v_street = '' or length(v_street) > 200 then raise exception 'invalid:street' using errcode = '22023'; end if;
  if v_postal = '' or length(v_postal) > 20 then raise exception 'invalid:postal_code' using errcode = '22023'; end if;
  if v_city = '' or length(v_city) > 120 then raise exception 'invalid:city' using errcode = '22023'; end if;
  if length(v_country) > 80 then raise exception 'invalid:country' using errcode = '22023'; end if;
  if v_kvk is not null and length(v_kvk) > 40 then raise exception 'invalid:kvk_number' using errcode = '22023'; end if;
  if v_vat is not null and length(v_vat) > 40 then raise exception 'invalid:vat_number' using errcode = '22023'; end if;

  select * into v_row from public.customers c where c.id = p_customer_id for update;
  if not found then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;

  if p_expected_updated_at is null or v_row.updated_at is distinct from p_expected_updated_at then
    return query select 'conflict'::text, v_row.updated_at, '{}'::text[];
    return;
  end if;

  /*
    Compared with the stored value read the way the form reads it -- trimmed,
    a phone's spaces folded, an empty country as the default -- so sending
    back what was shown is never a change, whatever layout an older save left.
  */
  if v_company is distinct from btrim(v_row.company_name) then v_fields := array_append(v_fields, 'company_name'); end if;
  if v_contact is distinct from btrim(v_row.contact_name) then v_fields := array_append(v_fields, 'contact_name'); end if;
  if v_email   is distinct from btrim(v_row.email)        then v_fields := array_append(v_fields, 'email');        end if;
  if v_billing is distinct from nullif(btrim(coalesce(v_row.billing_email, '')), '') then v_fields := array_append(v_fields, 'billing_email'); end if;
  if v_phone   is distinct from nullif(regexp_replace(btrim(coalesce(v_row.phone, '')), '\s+', ' ', 'g'), '') then v_fields := array_append(v_fields, 'phone'); end if;
  if v_street  is distinct from btrim(v_row.street)       then v_fields := array_append(v_fields, 'street');       end if;
  if v_postal  is distinct from btrim(v_row.postal_code)  then v_fields := array_append(v_fields, 'postal_code');  end if;
  if v_city    is distinct from btrim(v_row.city)         then v_fields := array_append(v_fields, 'city');         end if;
  if v_country is distinct from coalesce(nullif(btrim(v_row.country), ''), 'Nederland') then v_fields := array_append(v_fields, 'country'); end if;
  if v_kvk     is distinct from nullif(btrim(coalesce(v_row.kvk_number, '')), '') then v_fields := array_append(v_fields, 'kvk_number'); end if;
  if v_vat     is distinct from nullif(btrim(coalesce(v_row.vat_number, '')), '') then v_fields := array_append(v_fields, 'vat_number'); end if;

  if cardinality(v_fields) = 0 then
    return query select 'unchanged'::text, v_row.updated_at, v_fields;
    return;
  end if;

  /* The audit trigger reads this to record the change as the customer's own; it ends with the transaction. */
  perform set_config('ym.profile_actor', 'customer', true);

  /* Only what changed is written; a field the member left alone keeps exactly what was stored. */
  update public.customers c
     set company_name  = case when 'company_name'  = any (v_fields) then v_company else c.company_name  end,
         contact_name  = case when 'contact_name'  = any (v_fields) then v_contact else c.contact_name  end,
         email         = case when 'email'         = any (v_fields) then v_email   else c.email         end,
         billing_email = case when 'billing_email' = any (v_fields) then v_billing else c.billing_email end,
         phone         = case when 'phone'         = any (v_fields) then v_phone   else c.phone         end,
         street        = case when 'street'        = any (v_fields) then v_street  else c.street        end,
         postal_code   = case when 'postal_code'   = any (v_fields) then v_postal  else c.postal_code   end,
         city          = case when 'city'          = any (v_fields) then v_city    else c.city          end,
         country       = case when 'country'       = any (v_fields) then v_country else c.country       end,
         kvk_number    = case when 'kvk_number'    = any (v_fields) then v_kvk     else c.kvk_number    end,
         vat_number    = case when 'vat_number'    = any (v_fields) then v_vat     else c.vat_number    end
   where c.id = p_customer_id
  returning c.updated_at into v_updated_at;

  perform set_config('ym.profile_actor', '', true);

  return query select 'updated'::text, v_updated_at, v_fields;
end;
$$;

comment on function public.portal_update_customer_profile(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text) is
  'A member''s edit of one of their customers'' details, against the version they read. Only the named fields; updated | unchanged | conflict.';

revoke all on function public.portal_update_customer_profile(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.portal_update_customer_profile(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
