-- Customer requests, hardened after review (on top of 20261012210000).
--
-- 1. Announcing a request reliably: once, and never lost to a failed mail.
--
-- customer_requests.announced_at (previous migration) now means what its
-- name says: the confirmation went out. Sending is guarded by a short
-- lease instead:
--
--   announce_claimed_at   who is sending right now; a claim older than ten
--                         minutes is a sender that died and may be taken over
--   announce_attempts     how many sends were tried
--
-- and the internal notice to YM Creations on its own record
-- (internal_notified_at), so each of the two mails is retried until it went.
--
-- claim (announced_at null, no live lease) -> send -> success: announced_at,
-- lease cleared; failure: lease cleared, so the next retry -- the customer
-- submitting the same intention again, or the admin's "opnieuw versturen" --
-- sends. Two retries at once: the claim is one conditional update, so one
-- of them sends. Nothing about the request itself depends on any of it.
--
-- 2. Members store files but never read or delete them; signed URLs a
--    member could mint would outlive a revoked membership.
-- 3. Registration only by the server, after it checked the file's bytes.
-- 4. Upload caps taken when a member reserves an upload slot, under a lock
--    (twenty per request, two hundred per customer per day); a slot takes
--    one object, once; the creation brake counted under a lock as well.

alter table public.customer_requests
  add column announce_claimed_at timestamptz,
  add column announce_attempts   integer not null default 0 check (announce_attempts >= 0);

comment on column public.customer_requests.announced_at is
  'When the customer''s confirmation was sent. Null until a send succeeded.';
comment on column public.customer_requests.announce_claimed_at is
  'Lease of the sender currently announcing this request; older than ten minutes counts as abandoned.';
comment on column public.customer_requests.announce_attempts is
  'Announcement sends tried so far.';

/* The admin may retry an announcement; row level security keeps every update the admin's. */
grant update (announced_at, announce_claimed_at, announce_attempts) on table public.customer_requests to authenticated;

-- The internal notice, tracked on its own: sent once, retried until it is.
alter table public.customer_requests
  add column internal_notified_at timestamptz;

comment on column public.customer_requests.internal_notified_at is
  'When YM Creations'' own notice of the request was sent. Retried with the announcement until it is.';

grant update (internal_notified_at) on table public.customer_requests to authenticated;

/* A request announced before this column existed had its notice sent with that first attempt. */
update public.customer_requests set internal_notified_at = announced_at where announced_at is not null and internal_notified_at is null;

-- ---------------------------------------------- members never read objects

/*
  A member stores files; reading and throwing them away is the server's,
  after a portal function proved the request and the attachment theirs.
  A member who could read an object could also sign a URL for it, and a
  signed URL outlives a revoked membership. So no read and no delete policy
  for members on this bucket; the admin's read policy stays.
*/
drop policy request_attachments_portal_read on storage.objects;
drop policy request_attachments_portal_discard on storage.objects;
revoke execute on function private.portal_can_read_request_attachment(text) from authenticated;
revoke execute on function private.portal_can_discard_request_upload(text) from authenticated;

-- -------------------------------------------------- creation brake, locked

create or replace function public.portal_create_request(
  p_customer_id   uuid,
  p_submission_id uuid,
  p_category      text,
  p_subject       text,
  p_description   text
)
returns table (request_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject     text := btrim(coalesce(p_subject, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_id          uuid;
begin
  perform private.portal_require_customer(p_customer_id);

  if p_submission_id is null then raise exception 'invalid:submission' using errcode = '22023'; end if;
  if p_category is null or p_category not in ('website_change', 'content', 'new_feature', 'issue', 'new_project', 'other') then
    raise exception 'invalid:category' using errcode = '22023';
  end if;
  if v_subject = '' or length(v_subject) > 200 or v_subject ~ '[[:cntrl:]]' then raise exception 'invalid:subject' using errcode = '22023'; end if;
  if v_description = '' or length(v_description) > 5000 then raise exception 'invalid:description' using errcode = '22023'; end if;

  /* One creation at a time per customer, so the brake below counts what the others committed. */
  perform pg_advisory_xact_lock(hashtext('customer-requests:' || p_customer_id::text));

  /* Twenty new requests per customer per hour, whatever path the call takes. A retry of an existing submission is not new. */
  if not exists (select 1 from public.customer_requests r where r.customer_id = p_customer_id and r.submission_id = p_submission_id)
     and (select count(*) from public.customer_requests r where r.customer_id = p_customer_id and r.created_at > now() - interval '1 hour') >= 20
  then
    raise exception 'invalid:rate' using errcode = '22023';
  end if;

  insert into public.customer_requests (customer_id, created_by_user_id, submission_id, category, subject, description)
  values (p_customer_id, (select auth.uid()), p_submission_id, p_category, v_subject, v_description)
  on conflict (customer_id, submission_id) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  return query
    select r.id, false
    from public.customer_requests r
    where r.customer_id = p_customer_id and r.submission_id = p_submission_id;
end;
$$;

-- --------------------------------------------- registration by the server

/*
  An uploaded object becomes an attachment -- registered by the server only,
  after it read the object's first bytes and found them to be the type
  claimed. Called on the system client, naming the member it acts for, whose
  active membership of the customer is checked here. Otherwise as before:
  the request locked, open and with room, the object fresh (under 23 hours)
  under this request's own path, within type and size; the stored name the
  customer's, minus control and direction characters, with the extension of
  the checked type. Registering the same object twice returns the first.
*/
create or replace function public.service_register_request_attachment(
  p_user_id      uuid,
  p_customer_id  uuid,
  p_request_id   uuid,
  p_storage_path text,
  p_file_name    text,
  p_mime_type    text
)
returns table (attachment_id uuid, registered boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_object record;
  v_name   text := btrim(regexp_replace(
                    regexp_replace(coalesce(p_file_name, ''), '[\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]', '', 'g'),
                    '[[:cntrl:]\u0080-\u009F\u2028\u2029/\\]+', '_', 'g'));
  v_mime   text;
  v_bytes  bigint;
  v_found  uuid;
  v_slot   record;
begin
  if p_user_id is null or not exists (
    select 1 from public.customer_users m
    where m.user_id = p_user_id and m.customer_id = p_customer_id and m.revoked_at is null
  ) then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;

  select r.status into v_status from public.customer_requests r
  where r.id = p_request_id and r.customer_id = p_customer_id
  for update;
  if not found then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;

  select a.id into v_found from public.customer_request_attachments a
  where a.storage_path = p_storage_path and a.request_id = p_request_id;
  if found then
    return query select v_found, false;
    return;
  end if;

  if not private.request_is_open(v_status) then raise exception 'invalid:closed' using errcode = '22023'; end if;
  if p_storage_path is null
     or not exists (select 1 from private.request_attachment_path(p_storage_path) p where p.customer_id = p_customer_id and p.request_id = p_request_id)
  then
    raise exception 'invalid:path' using errcode = '22023';
  end if;
  /* Only an object stored at a slot reserved for this request, and not given up since (see service_release_request_upload). */
  select s.consumed_at into v_slot from public.customer_request_upload_slots s
  where s.storage_path = p_storage_path and s.request_id = p_request_id;
  if not found or v_slot.consumed_at is not null then
    raise exception 'invalid:path' using errcode = '22023';
  end if;
  if (select count(*) from public.customer_request_attachments a where a.request_id = p_request_id) >= 10 then
    raise exception 'invalid:limit' using errcode = '22023';
  end if;

  /* Only a fresh upload: one older than this may be removed by the daily clean-up at any moment. */
  select o.metadata into v_object from storage.objects o
  where o.bucket_id = 'request-attachments' and o.name = p_storage_path
    and o.created_at > now() - interval '23 hours';
  if not found then raise exception 'invalid:missing' using errcode = '22023'; end if;

  v_mime  := lower(coalesce(v_object.metadata ->> 'mimetype', ''));
  v_bytes := coalesce((v_object.metadata ->> 'size')::bigint, 0);
  /* The stored type is the one the server just checked the file's own bytes against. */
  if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')
     or v_mime is distinct from lower(coalesce(p_mime_type, ''))
  then
    raise exception 'invalid:type' using errcode = '22023';
  end if;
  if v_bytes <= 0 or v_bytes > 15728640 then raise exception 'invalid:size' using errcode = '22023'; end if;

  v_name := btrim(regexp_replace(v_name, '\.[^.]*$', ''));
  if v_name = '' then v_name := 'bijlage'; end if;
  v_name := left(v_name, 190) || '.' || case v_mime
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'image/heic' then 'heic'
    when 'image/heif' then 'heif'
    else 'pdf'
  end;

  insert into public.customer_request_attachments (request_id, customer_id, storage_path, file_name, mime_type, bytes, created_by_user_id)
  values (p_request_id, p_customer_id, p_storage_path, v_name, v_mime, v_bytes, p_user_id)
  returning id into v_found;

  update public.customer_request_upload_slots s set consumed_at = now() where s.storage_path = p_storage_path;

  return query select v_found, true;
end;
$$;

comment on function public.service_register_request_attachment(uuid, uuid, uuid, text, text, text) is
  'Registers an uploaded request file for a member, after the server checked its bytes. System client only; checks the member''s active membership itself.';

revoke all on function public.service_register_request_attachment(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.service_register_request_attachment(uuid, uuid, uuid, text, text, text) to service_role;

/* The member-callable registration of the first migration skipped the byte check when called directly; it is closed. */
revoke execute on function public.portal_register_request_attachment(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;

-- ------------------------------------------------- upload slots, hard caps

/*
  Storage asks the insert policy in a check of its own before it stores, so
  a lock taken there does not hold until the object exists, and parallel
  uploads could all pass a count. The caps are therefore taken one step
  earlier, where a lock does hold: a member first reserves a slot -- one
  exact object path -- through portal_reserve_request_upload, which counts
  under a lock per customer; the bucket accepts an object only at a
  reserved path, once. Twenty slots per request per day, two hundred per
  customer per day, and none once the request has its ten attachments.
*/
create table public.customer_request_upload_slots (
  storage_path text primary key,
  request_id   uuid not null,
  customer_id  uuid not null,
  reserved_by  uuid references auth.users (id) on delete set null,
  reserved_at  timestamptz not null default now(),
  /* Set once the slot's object was registered or given up: from then on the bucket takes nothing more at this path. */
  consumed_at  timestamptz,

  constraint customer_request_upload_slots_request
    foreign key (request_id, customer_id) references public.customer_requests (id, customer_id) on delete cascade,
  constraint customer_request_upload_slots_path_shape
    check (storage_path = customer_id::text || '/' || request_id::text || '/' || split_part(storage_path, '/', 3))
);

comment on table public.customer_request_upload_slots is
  'Object paths a member reserved for an upload; the bucket accepts a member''s object only at a reserved path. Counted for the upload caps.';

create index customer_request_upload_slots_request_idx on public.customer_request_upload_slots (request_id, reserved_at);
create index customer_request_upload_slots_customer_idx on public.customer_request_upload_slots (customer_id, reserved_at);

alter table public.customer_request_upload_slots enable row level security;
alter table public.customer_request_upload_slots force row level security;
revoke all on table public.customer_request_upload_slots from anon, authenticated;

create or replace function public.portal_reserve_request_upload(p_customer_id uuid, p_request_id uuid)
returns table (storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_path   text;
begin
  perform private.portal_require_customer(p_customer_id);

  select r.status into v_status from public.customer_requests r where r.id = p_request_id and r.customer_id = p_customer_id;
  if not found then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;
  if not private.request_is_open(v_status) then raise exception 'invalid:closed' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtext('request-attachments:' || p_customer_id::text));

  if (select count(*) from public.customer_request_attachments a where a.request_id = p_request_id) >= 10 then
    raise exception 'invalid:limit' using errcode = '22023';
  end if;
  if (select count(*) from public.customer_request_upload_slots s
      where s.request_id = p_request_id and s.reserved_at > now() - interval '24 hours') >= 20 then
    raise exception 'invalid:uploads' using errcode = '22023';
  end if;
  if (select count(*) from public.customer_request_upload_slots s
      where s.customer_id = p_customer_id and s.reserved_at > now() - interval '24 hours') >= 200 then
    raise exception 'invalid:uploads' using errcode = '22023';
  end if;

  v_path := p_customer_id::text || '/' || p_request_id::text || '/' || gen_random_uuid()::text;
  insert into public.customer_request_upload_slots (storage_path, request_id, customer_id, reserved_by)
  values (v_path, p_request_id, p_customer_id, (select auth.uid()));

  return query select v_path;
end;
$$;

comment on function public.portal_reserve_request_upload(uuid, uuid) is
  'One object path a member may upload a request file to, counted under a lock against the per-request and per-customer caps.';

revoke all on function public.portal_reserve_request_upload(uuid, uuid) from public, anon;
grant execute on function public.portal_reserve_request_upload(uuid, uuid) to authenticated;

/* The bucket's own question: a fresh slot reserved for exactly this path, by one of the caller's customers, on an open request. */
create or replace function private.portal_can_upload_request_attachment(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.customer_request_upload_slots s
    join public.customer_requests r on r.id = s.request_id and r.customer_id = s.customer_id
    where s.storage_path = p_name
      and s.reserved_at > now() - interval '1 hour'
      and s.consumed_at is null
      and s.customer_id = any (private.portal_customer_ids())
      and private.request_is_open(r.status)
  );
$$;

/*
  An upload the server refused is given up: its slot consumed, so nothing
  can be stored at that path again, and the answer whether the object may
  be removed -- only when no attachment holds it. Under the request's row
  lock, like registration, so a removal and a registration of one path
  cannot cross: whichever comes second sees what the first did.
*/
create or replace function public.service_release_request_upload(p_customer_id uuid, p_storage_path text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request uuid;
begin
  select s.request_id into v_request from public.customer_request_upload_slots s
  where s.storage_path = p_storage_path and s.customer_id = p_customer_id;
  if found then
    perform 1 from public.customer_requests r where r.id = v_request for update;
    update public.customer_request_upload_slots s set consumed_at = coalesce(s.consumed_at, now()) where s.storage_path = p_storage_path;
  end if;
  return not exists (select 1 from public.customer_request_attachments a where a.storage_path = p_storage_path);
end;
$$;

comment on function public.service_release_request_upload(uuid, text) is
  'Gives up a refused upload: consumes its slot and says whether the object may be removed (no attachment holds it). System client only.';

revoke all on function public.service_release_request_upload(uuid, text) from public, anon, authenticated;
grant execute on function public.service_release_request_upload(uuid, text) to service_role;
