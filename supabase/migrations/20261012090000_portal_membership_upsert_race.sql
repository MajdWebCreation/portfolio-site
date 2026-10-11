-- Two admins, or one admin with a double click, inviting the same address to
-- the same customer at the same instant.
--
-- `admin_upsert_portal_membership` locks the row it finds, but two callers
-- that find no row both go on to insert, and the second one hits the unique
-- key and fails with a constraint name on the admin's screen. The row exists
-- by then, so the retry would say "reinvited" -- correct, but a step the
-- admin should not have to take. The insert now steps aside on conflict and
-- the caller continues with the row the other one made, as a renewal.
--
-- Everything else about the function is as before; see `portal_memberships`.

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
    on conflict (user_id, customer_id) do nothing
    returning * into v_row;

    if found then
      v_outcome := 'invited';
    else
      /* The other caller got there first; this one continues with that row. */
      select * into v_row
      from public.customer_users
      where user_id = p_user_id and customer_id = p_customer_id
      for update;
    end if;
  end if;

  if v_outcome is null then
    if v_row.revoked_at is not null then
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
  end if;

  if v_outcome <> 'already_member' then
    insert into public.portal_events (actor_user_id, customer_id, action, target_kind, target_id)
    values (v_actor, p_customer_id, 'member_' || v_outcome, 'membership', v_row.id);
  end if;

  return jsonb_build_object('membership_id', v_row.id, 'outcome', v_outcome, 'accepted', v_row.accepted_at is not null);
end;
$$;
