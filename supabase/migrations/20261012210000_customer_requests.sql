-- Customer requests: a customer asks YM Creations for something, from the portal.
--
-- Its own small domain, not inquiries: an inquiry is a stranger's first
-- contact and carries attribution; a request belongs to a customer that
-- already exists, is read back by that customer, and moves through a status
-- the admin sets. No chat, no thread, no SLA.
--
--   customer_requests                  the request, scoped to its customer
--   customer_request_status_events     every real status change, append-only
--   customer_request_attachments       registered reference files
--   storage bucket request-attachments private; <customer>/<request>/<uuid>
--
-- A member reaches all of it through portal_* functions and through storage
-- policies that ask the same membership question; no business table gets a
-- customer policy. The admin works on the tables under the admin policies,
-- and may change exactly three columns of a request: status, project, quote.

-- ------------------------------------------------------------- requests

create table public.customer_requests (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customers (id) on delete restrict,
  created_by_user_id uuid references auth.users (id) on delete set null,
  /* The browser's id for one submit intention: a retried or doubled submit names it again and gets the same request. */
  submission_id      uuid not null,
  category           text not null check (category in ('website_change', 'content', 'new_feature', 'issue', 'new_project', 'other')),
  subject            text not null check (length(btrim(subject)) between 1 and 200),
  description        text not null check (length(btrim(description)) between 1 and 5000),
  status             text not null default 'submitted'
                       check (status in ('submitted', 'in_review', 'awaiting_customer', 'in_progress', 'completed', 'declined')),
  status_changed_at  timestamptz not null default now(),
  project_id         uuid,
  quote_id           uuid,
  /* When the confirmation and the internal notice were claimed for sending: once per request, also across retries. */
  announced_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint customer_requests_one_per_submission unique (customer_id, submission_id),
  constraint customer_requests_id_customer_unique unique (id, customer_id),
  /* A link is to the same customer's project or quote, or the database refuses it. */
  constraint customer_requests_project_same_customer
    foreign key (project_id, customer_id) references public.projects (id, customer_id) on delete set null (project_id),
  constraint customer_requests_quote_same_customer
    foreign key (quote_id, customer_id) references public.quotes (id, customer_id) on delete set null (quote_id)
);

comment on table public.customer_requests is
  'What a customer asked for from the portal: category, subject, description, a status the admin sets, and optional links to the same customer''s project and quote.';

create index customer_requests_customer_idx on public.customer_requests (customer_id, created_at desc);
create index customer_requests_status_idx on public.customer_requests (status, created_at desc);
create index customer_requests_project_idx on public.customer_requests (project_id) where project_id is not null;
create index customer_requests_quote_idx on public.customer_requests (quote_id) where quote_id is not null;

create trigger customer_requests_set_updated_at
  before update on public.customer_requests
  for each row execute function private.set_updated_at();

/* The moment the status last moved, kept by the database rather than by whoever wrote the row. */
create or replace function private.stamp_request_status_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  else
    new.status_changed_at := old.status_changed_at;
  end if;
  return new;
end;
$$;

create trigger customer_requests_stamp_status
  before update on public.customer_requests
  for each row execute function private.stamp_request_status_change();

alter table public.customer_requests enable row level security;
alter table public.customer_requests force row level security;

revoke all on table public.customer_requests from anon, authenticated;
grant select on table public.customer_requests to authenticated;
/* The admin moves a request and links it; what the customer wrote is never edited. */
grant update (status, project_id, quote_id) on table public.customer_requests to authenticated;

create policy customer_requests_admin_read
  on public.customer_requests for select to authenticated
  using (private.is_admin());

create policy customer_requests_admin_update
  on public.customer_requests for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- ---------------------------------------------------------- status trail

create table public.customer_request_status_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null,
  customer_id uuid not null,
  from_status text,
  to_status   text not null,
  changed_by  uuid,
  changed_at  timestamptz not null default now(),

  constraint customer_request_status_events_request
    foreign key (request_id, customer_id) references public.customer_requests (id, customer_id) on delete cascade
);

comment on table public.customer_request_status_events is
  'Append-only: every status a request entered, from what, by whom (null: the system). Written by a trigger on customer_requests only.';

create index customer_request_status_events_request_idx on public.customer_request_status_events (request_id, changed_at);

alter table public.customer_request_status_events enable row level security;
alter table public.customer_request_status_events force row level security;

revoke all on table public.customer_request_status_events from anon, authenticated;
revoke insert, update, delete, truncate on table public.customer_request_status_events from service_role;
grant select on table public.customer_request_status_events to authenticated;

create policy customer_request_status_events_admin_read
  on public.customer_request_status_events for select to authenticated
  using (private.is_admin());

create or replace function private.record_request_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.customer_request_status_events (request_id, customer_id, from_status, to_status, changed_by)
    values (new.id, new.customer_id, case when tg_op = 'UPDATE' then old.status end, new.status, (select auth.uid()));
  end if;
  return new;
end;
$$;

revoke all on function private.record_request_status_event() from public, anon, authenticated;

create trigger customer_requests_record_status
  after insert or update of status on public.customer_requests
  for each row execute function private.record_request_status_event();

-- ------------------------------------------------------------ attachments

create table public.customer_request_attachments (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null,
  customer_id        uuid not null,
  /* <customer_id>/<request_id>/<uuid>: never the file's own name. */
  storage_path       text not null unique,
  file_name          text not null check (length(file_name) between 1 and 200),
  mime_type          text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')),
  bytes              integer not null check (bytes > 0 and bytes <= 15728640),
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),

  constraint customer_request_attachments_request
    foreign key (request_id, customer_id) references public.customer_requests (id, customer_id) on delete cascade,
  constraint customer_request_attachments_path_shape
    check (storage_path = customer_id::text || '/' || request_id::text || '/' || split_part(storage_path, '/', 3))
);

comment on table public.customer_request_attachments is
  'Reference files of a request, registered after the object was stored and checked. The original name is kept for the download only.';

create index customer_request_attachments_request_idx on public.customer_request_attachments (request_id, created_at);

alter table public.customer_request_attachments enable row level security;
alter table public.customer_request_attachments force row level security;

revoke all on table public.customer_request_attachments from anon, authenticated;
grant select on table public.customer_request_attachments to authenticated;

create policy customer_request_attachments_admin_read
  on public.customer_request_attachments for select to authenticated
  using (private.is_admin());

-- ---------------------------------------------------------------- bucket

/*
  Private, with the type and size the application allows enforced by
  Storage itself: an upload that goes around the application meets them too.
  No SVG, HTML, script, archive or executable is storable here at all.
*/
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-attachments', 'request-attachments', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- --------------------------------------------------------- path & checks

/* The request an object path names, when the path has exactly the shape the portal writes. */
create or replace function private.request_attachment_path(p_name text)
returns table (customer_id uuid, request_id uuid)
language sql
immutable
security invoker
set search_path = ''
as $$
  select split_part(p_name, '/', 1)::uuid, split_part(p_name, '/', 2)::uuid
  where p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

revoke all on function private.request_attachment_path(text) from public, anon, authenticated;

/* A request that still takes files: not completed, not declined. */
create or replace function private.request_is_open(p_status text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_status not in ('completed', 'declined');
$$;

revoke all on function private.request_is_open(text) from public, anon, authenticated;

/*
  May the caller store an object at this path? Only under one of their own
  customers, under a request of that customer that is still open, while the
  request has room for another file and its folder holds fewer than twenty
  objects (failed uploads included, until they are cleaned up). The upload
  itself cannot overwrite: there is no update policy.
*/
create or replace function private.portal_can_upload_request_attachment(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.request_attachment_path(p_name) p
    join public.customer_requests r on r.id = p.request_id and r.customer_id = p.customer_id
    where p.customer_id = any (private.portal_customer_ids())
      and private.request_is_open(r.status)
      and (select count(*) from public.customer_request_attachments a where a.request_id = r.id) < 10
      /* Registered or not: no more than twenty objects under one request, so failed uploads cannot pile up. */
      and (select count(*) from storage.objects o
           where o.bucket_id = 'request-attachments'
             and o.name like p.customer_id::text || '/' || p.request_id::text || '/%') < 20
  );
$$;

/* May the caller read this object? Their own customer's request, registered or just uploaded. */
create or replace function private.portal_can_read_request_attachment(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.request_attachment_path(p_name) p
    join public.customer_requests r on r.id = p.request_id and r.customer_id = p.customer_id
    where p.customer_id = any (private.portal_customer_ids())
  );
$$;

/* May the caller throw this object away? Only their own upload that never became an attachment. */
create or replace function private.portal_can_discard_request_upload(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.portal_can_read_request_attachment(p_name)
     and not exists (select 1 from public.customer_request_attachments a where a.storage_path = p_name);
$$;

revoke all on function private.portal_can_upload_request_attachment(text) from public, anon;
revoke all on function private.portal_can_read_request_attachment(text) from public, anon;
revoke all on function private.portal_can_discard_request_upload(text) from public, anon;
grant execute on function private.portal_can_upload_request_attachment(text) to authenticated;
grant execute on function private.portal_can_read_request_attachment(text) to authenticated;
grant execute on function private.portal_can_discard_request_upload(text) to authenticated;

create policy request_attachments_portal_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'request-attachments' and private.portal_can_upload_request_attachment(name));

create policy request_attachments_portal_read
  on storage.objects for select to authenticated
  using (bucket_id = 'request-attachments' and private.portal_can_read_request_attachment(name));

create policy request_attachments_portal_discard
  on storage.objects for delete to authenticated
  using (bucket_id = 'request-attachments' and private.portal_can_discard_request_upload(name));

create policy request_attachments_admin_read
  on storage.objects for select to authenticated
  using (bucket_id = 'request-attachments' and private.is_admin());

-- -------------------------------------------------------- portal: create

/*
  A new request. The submission id makes it idempotent: the same intention
  sent twice -- a double click, a retry after a timeout -- returns the
  request the first one made, with created = false, and makes nothing.
  Validation raises 22023 with the field ("invalid:<field>").
*/
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

  /* A brake that holds whatever path the call takes: twenty new requests per customer per hour. A retry of an existing submission is not new. */
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

-- --------------------------------------------------------- portal: read

/* The quote a request links to, only when the customer may see that quote. */
create or replace function private.portal_request_quote(p_quote_id uuid, p_customer_id uuid)
returns table (quote_id uuid, quote_number text)
language sql
stable
security invoker
set search_path = ''
as $$
  select q.id, q.number_value
  from public.quotes q
  join private.portal_visible_quotes v on v.id = q.id
  where q.id = p_quote_id and q.customer_id = p_customer_id;
$$;

revoke all on function private.portal_request_quote(uuid, uuid) from public, anon, authenticated;

create or replace function public.portal_requests(p_customer_id uuid)
returns table (
  id                uuid,
  category          text,
  subject           text,
  status            text,
  created_at        timestamptz,
  status_changed_at timestamptz,
  quote_id          uuid,
  quote_number      text,
  attachment_count  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.portal_require_customer(p_customer_id);

  return query
    select r.id, r.category, r.subject, r.status, r.created_at, r.status_changed_at,
           vq.quote_id, vq.quote_number,
           (select count(*)::integer from public.customer_request_attachments a where a.request_id = r.id)
    from public.customer_requests r
    left join lateral private.portal_request_quote(r.quote_id, r.customer_id) vq on true
    where r.customer_id = p_customer_id
    order by r.created_at desc;
end;
$$;

create or replace function public.portal_request(p_customer_id uuid, p_request_id uuid)
returns table (
  id                 uuid,
  category           text,
  subject            text,
  description        text,
  status             text,
  created_at         timestamptz,
  status_changed_at  timestamptz,
  quote_id           uuid,
  quote_number       text,
  accepts_attachments boolean,
  attachments        jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.portal_require_customer(p_customer_id);

  return query
    select r.id, r.category, r.subject, r.description, r.status, r.created_at, r.status_changed_at,
           vq.quote_id, vq.quote_number,
           private.request_is_open(r.status)
             and (select count(*) from public.customer_request_attachments a where a.request_id = r.id) < 10,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id',         a.id,
                      'file_name',  a.file_name,
                      'mime_type',  a.mime_type,
                      'bytes',      a.bytes,
                      'created_at', a.created_at
                    ) order by a.created_at)
             from public.customer_request_attachments a
             where a.request_id = r.id and a.customer_id = r.customer_id
           ), '[]'::jsonb)
    from public.customer_requests r
    left join lateral private.portal_request_quote(r.quote_id, r.customer_id) vq on true
    where r.id = p_request_id and r.customer_id = p_customer_id;

  if not found then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------- portal: attachments

/*
  An uploaded object becomes an attachment. The object has to exist in the
  bucket under this request's own prefix, within the type and size allowed,
  while the request is open and has room. The request row is locked, so two
  registrations at once cannot both take the tenth place. Registering the
  same object twice returns the first registration.
*/
create or replace function public.portal_register_request_attachment(
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
  v_status  text;
  v_object  record;
  v_name    text := btrim(regexp_replace(coalesce(p_file_name, ''), '[[:cntrl:]/\\]+', '_', 'g'));
  v_mime    text;
  v_bytes   bigint;
  v_found   uuid;
begin
  perform private.portal_require_customer(p_customer_id);

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
  /* The stored type is the one the server checked the file's own bytes against. */
  if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')
     or v_mime is distinct from lower(coalesce(p_mime_type, ''))
  then
    raise exception 'invalid:type' using errcode = '22023';
  end if;
  if v_bytes <= 0 or v_bytes > 15728640 then raise exception 'invalid:size' using errcode = '22023'; end if;
  /*
    The name is the customer's for display, but its extension is ours: always
    the one of the type that was checked. A file stored as an image is never
    saved to anyone's disk as .html or .exe, whatever name it was given.
  */
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
  values (p_request_id, p_customer_id, p_storage_path, v_name, v_mime, v_bytes, (select auth.uid()))
  returning id into v_found;

  return query select v_found, true;
end;
$$;

/* Where one registered attachment is, for the download route. 42501 for anything else. */
create or replace function public.portal_request_attachment(p_customer_id uuid, p_attachment_id uuid)
returns table (storage_path text, file_name text, mime_type text, bytes integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.portal_require_customer(p_customer_id);

  return query
    select a.storage_path, a.file_name, a.mime_type, a.bytes
    from public.customer_request_attachments a
    where a.id = p_attachment_id and a.customer_id = p_customer_id;

  if not found then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.portal_create_request(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.portal_requests(uuid) from public, anon;
revoke all on function public.portal_request(uuid, uuid) from public, anon;
revoke all on function public.portal_register_request_attachment(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.portal_request_attachment(uuid, uuid) from public, anon;

grant execute on function public.portal_create_request(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.portal_requests(uuid) to authenticated;
grant execute on function public.portal_request(uuid, uuid) to authenticated;
grant execute on function public.portal_register_request_attachment(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.portal_request_attachment(uuid, uuid) to authenticated;

-- ------------------------------------------------------------- retention

/*
  Uploads that never became an attachment -- a registration that failed, a
  browser closed between the two steps -- older than the cut-off the daily
  retention job passes. For that job only (system client).
*/
create or replace function public.request_attachment_orphans(p_before timestamptz)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'request-attachments'
    and o.created_at < p_before
    and not exists (select 1 from public.customer_request_attachments a where a.storage_path = o.name)
  order by o.created_at
  limit 500;
$$;

revoke all on function public.request_attachment_orphans(timestamptz) from public, anon, authenticated;
grant execute on function public.request_attachment_orphans(timestamptz) to service_role;

-- -------------------------------------------------------- communications

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
    'request_status_changed'
  ));
