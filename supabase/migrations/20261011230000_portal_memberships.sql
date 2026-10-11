-- The customer portal's identity: who may act for which customer.
--
-- An admin is an auth user with an active row in admin_profiles; a portal
-- member is an auth user with an active row in customer_users for one or
-- more customers. The two sets are independent: being an admin grants no
-- portal access and a portal member is not an admin. Both are decided by a
-- row, never by an e-mail address, a domain or a claim in the token.
--
-- One user may belong to several customers (an accountant, a holding), and
-- one customer may have several users. Access ends by setting revoked_at,
-- never by deleting the row: who had access, and until when, is a record.
--
-- Nothing in here opens a single business row to a customer. The only thing
-- a portal member can read through this migration is the list of customers
-- they belong to, through `portal_memberships()`. What those customers own
-- -- quotes, invoices, services -- stays behind the admin policies until a
-- later migration projects it, column by column, through functions of its
-- own.

create table public.customer_users (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  customer_id    uuid not null references public.customers (id) on delete restrict,
  role           text not null default 'member' check (role in ('member')),
  /* The address the invitation went to; auth.users is not readable from the application. */
  invited_email  text not null check (invited_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  invited_by     uuid,
  invited_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint customer_users_one_per_customer unique (user_id, customer_id)
);

comment on table public.customer_users is
  'Portal memberships: which auth user may act for which customer. An active row (revoked_at is null) is the only thing that grants /portaal access to that customer.';
comment on column public.customer_users.role is
  'Reserved for later; every member is a plain member today.';
comment on column public.customer_users.invited_email is
  'Where the invitation was sent, kept here because auth.users is not readable by the application. Informational; access follows user_id.';
comment on column public.customer_users.accepted_at is
  'First moment the member used the membership (set a password, signed in). Null until then.';
comment on column public.customer_users.revoked_at is
  'Set to end access; the row stays. A revoked membership can be reactivated by a new invitation.';

create index customer_users_customer_idx on public.customer_users (customer_id);
create index customer_users_user_idx on public.customer_users (user_id) where revoked_at is null;

create trigger customer_users_set_updated_at
  before update on public.customer_users
  for each row execute function private.set_updated_at();

/* Who and for whom is said once; the lifecycle columns are what moves. */
create or replace function private.refuse_membership_identity_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.customer_id is distinct from old.customer_id
     or new.invited_email is distinct from old.invited_email
  then
    raise exception 'Een portaallidmaatschap wisselt niet van gebruiker, klant of adres; trek het in en nodig opnieuw uit.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger customer_users_refuse_identity_changes
  before update on public.customer_users
  for each row execute function private.refuse_membership_identity_changes();

alter table public.customer_users enable row level security;
alter table public.customer_users force row level security;

revoke all on table public.customer_users from anon, authenticated;
grant select, insert, update on table public.customer_users to authenticated;

/* The admin manages memberships; a member may see their own rows and nothing else. */
create policy customer_users_admin_all
  on public.customer_users for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy customer_users_select_own
  on public.customer_users for select to authenticated
  using ((select auth.uid()) = user_id);

-- What happened to an account, as an append-only record.
--
-- Security- and business-relevant actions only: an invitation, a revocation,
-- an acceptance, a password change, a switch of customer. No page views, no
-- downloads, no tokens, no secrets.
create table public.portal_events (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  customer_id   uuid references public.customers (id) on delete set null,
  action        text not null check (action in (
    'member_invited', 'member_reinvited', 'member_reactivated', 'member_revoked',
    'membership_accepted', 'password_changed', 'password_reset_requested', 'customer_selected'
  )),
  target_kind   text check (target_kind in ('membership', 'user')),
  target_id     uuid,
  occurred_at   timestamptz not null default now()
);

comment on table public.portal_events is
  'Append-only record of account actions in the customer portal. Written by the admin membership actions and by the portal functions below; never updated or deleted.';

create index portal_events_customer_idx on public.portal_events (customer_id, occurred_at desc);
create index portal_events_actor_idx on public.portal_events (actor_user_id, occurred_at desc);

alter table public.portal_events enable row level security;
alter table public.portal_events force row level security;

revoke all on table public.portal_events from anon, authenticated;
grant select, insert on table public.portal_events to authenticated;

create policy portal_events_admin_read
  on public.portal_events for select to authenticated
  using (private.is_admin());

create policy portal_events_admin_insert
  on public.portal_events for insert to authenticated
  with check (private.is_admin());

-- The tenant boundary of the portal.
--
-- The customers the current user may act for: active memberships of
-- auth.uid(), and nothing else. Every portal function below, and every
-- projection a later migration adds, starts by asking this. SECURITY DEFINER
-- because it reads customer_users for a caller the policies do not let read
-- across; STABLE so a statement asks once; the empty search_path keeps the
-- body unshadowable.
--
-- Anon cannot call it. An admin without a membership gets an empty array:
-- the admin set and the member set are different sets.
create or replace function private.portal_customer_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.customer_id), '{}'::uuid[])
  from public.customer_users m
  where m.user_id = (select auth.uid())
    and m.revoked_at is null;
$$;

comment on function private.portal_customer_ids() is
  'The customers the current request may act for in the portal: active memberships of auth.uid(). The tenant boundary every portal function starts from.';

revoke all on function private.portal_customer_ids() from public, anon;
grant execute on function private.portal_customer_ids() to authenticated;

-- What the shell shows: which customers this user belongs to, by name.
--
-- The one read a member has in this phase. It names the customer and nothing
-- else about it; the customer's data arrives in later phases through
-- functions of the same shape, each naming exactly the columns a customer
-- may see. Returns no rows for a caller without memberships, which the
-- application turns into the "geen toegang" screen.
create or replace function public.portal_memberships()
returns table (customer_id uuid, company_name text, role text, accepted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.customer_id, c.company_name, m.role, m.accepted_at
  from public.customer_users m
  join public.customers c on c.id = m.customer_id
  where m.user_id = (select auth.uid())
    and m.revoked_at is null
  order by c.company_name;
$$;

comment on function public.portal_memberships() is
  'The active memberships of the current user, with the customer name. The only customer fact a member reads in this phase.';

revoke all on function public.portal_memberships() from public, anon;
grant execute on function public.portal_memberships() to authenticated;

-- The first time a membership is used.
--
-- Called after a member set their password or signed in. Stamps accepted_at
-- on every active membership of the caller that has none, and records the
-- acceptance. Idempotent: a second call finds nothing to stamp.
create or replace function public.portal_mark_membership_accepted()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer := 0;
  v_row record;
begin
  if v_user is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  for v_row in
    update public.customer_users
       set accepted_at = now()
     where user_id = v_user
       and revoked_at is null
       and accepted_at is null
    returning id, customer_id
  loop
    insert into public.portal_events (actor_user_id, customer_id, action, target_kind, target_id)
    values (v_user, v_row.customer_id, 'membership_accepted', 'membership', v_row.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.portal_mark_membership_accepted() from public, anon;
grant execute on function public.portal_mark_membership_accepted() to authenticated;

-- An account action the member took, recorded by the member.
--
-- Only the two actions a member performs on their own account; everything
-- about memberships is recorded by the functions that change them. The
-- customer named has to be one of the caller's own, and a caller without any
-- membership records nothing: an account that was never let in cannot fill
-- the table.
create or replace function public.portal_log_event(p_action text, p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_ids  uuid[] := private.portal_customer_ids();
begin
  if v_user is null or cardinality(v_ids) = 0 then
    raise exception 'Geen toegang tot het klantportaal.' using errcode = '42501';
  end if;
  if p_action not in ('password_changed', 'customer_selected') then
    raise exception 'Deze gebeurtenis wordt niet door een lid zelf vastgelegd.' using errcode = 'check_violation';
  end if;
  if p_customer_id is null or not (p_customer_id = any (v_ids)) then
    raise exception 'Geen toegang tot deze klant.' using errcode = '42501';
  end if;

  insert into public.portal_events (actor_user_id, customer_id, action, target_kind, target_id)
  values (v_user, p_customer_id, p_action, 'user', v_user);
end;
$$;

revoke all on function public.portal_log_event(text, uuid) from public, anon;
grant execute on function public.portal_log_event(text, uuid) to authenticated;

-- The admin's half of an invitation: the membership row.
--
-- Supabase Auth and this database are not one transaction. The application
-- first makes sure the auth user exists (an e-mail address has one auth user,
-- so that step cannot duplicate anything), then calls this, then sends the
-- mail. Each step is safe to repeat, and this one says what it found:
--
--   invited        no row yet: one is made.
--   reinvited      an active row that was never accepted: the invitation is
--                  renewed, nothing else moves.
--   reactivated    a revoked row: access is given back; a first use it had
--                  stays recorded.
--   already_member an active, accepted row: nothing changes.
--
-- SECURITY INVOKER: the caller's rights apply, so the admin policies on
-- customer_users and portal_events decide. A member calling this over
-- /rest/v1/rpc changes nothing and is told so by the policy.
create or replace function public.admin_upsert_portal_membership(
  p_customer_id uuid,
  p_user_id     uuid,
  p_email       text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_row     public.customer_users%rowtype;
  v_outcome text;
begin
  if not private.is_admin() then
    raise exception 'Alleen een beheerder nodigt portaalleden uit.' using errcode = '42501';
  end if;

  select * into v_row
  from public.customer_users
  where user_id = p_user_id and customer_id = p_customer_id
  for update;

  if not found then
    insert into public.customer_users (user_id, customer_id, invited_email, invited_by)
    values (p_user_id, p_customer_id, lower(btrim(p_email)), v_actor)
    returning * into v_row;
    v_outcome := 'invited';
  elsif v_row.revoked_at is not null then
    /* Access given back. The first use stays what it was: that is history, not access. */
    update public.customer_users
       set revoked_at = null, invited_by = v_actor, invited_at = now()
     where id = v_row.id
    returning * into v_row;
    v_outcome := 'reactivated';
  elsif v_row.accepted_at is null then
    update public.customer_users
       set invited_by = v_actor, invited_at = now()
     where id = v_row.id
    returning * into v_row;
    v_outcome := 'reinvited';
  else
    v_outcome := 'already_member';
  end if;

  if v_outcome <> 'already_member' then
    insert into public.portal_events (actor_user_id, customer_id, action, target_kind, target_id)
    values (v_actor, p_customer_id, 'member_' || v_outcome, 'membership', v_row.id);
  end if;

  return jsonb_build_object('membership_id', v_row.id, 'outcome', v_outcome, 'accepted', v_row.accepted_at is not null);
end;
$$;

comment on function public.admin_upsert_portal_membership(uuid, uuid, text) is
  'Creates, renews or reactivates a portal membership for an admin, and records it. Idempotent: says what it found.';

revoke all on function public.admin_upsert_portal_membership(uuid, uuid, text) from public, anon;
grant execute on function public.admin_upsert_portal_membership(uuid, uuid, text) to authenticated;

-- Ending access: the row stays, revoked_at says when.
create or replace function public.admin_revoke_portal_membership(p_customer_id uuid, p_membership_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_row   public.customer_users%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Alleen een beheerder trekt portaaltoegang in.' using errcode = '42501';
  end if;

  /* Named together, so a stale screen cannot revoke another customer's member by id. */
  select * into v_row from public.customer_users where id = p_membership_id and customer_id = p_customer_id for update;
  if not found then
    raise exception 'Onbekend lidmaatschap.' using errcode = 'P0002';
  end if;

  if v_row.revoked_at is null then
    update public.customer_users set revoked_at = now() where id = v_row.id returning * into v_row;
    insert into public.portal_events (actor_user_id, customer_id, action, target_kind, target_id)
    values (v_actor, v_row.customer_id, 'member_revoked', 'membership', v_row.id);
  end if;

  return jsonb_build_object('membership_id', v_row.id, 'revoked_at', v_row.revoked_at);
end;
$$;

revoke all on function public.admin_revoke_portal_membership(uuid, uuid) from public, anon;
grant execute on function public.admin_revoke_portal_membership(uuid, uuid) to authenticated;
