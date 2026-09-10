-- Storage for article featured images.
--
-- One bucket. It is public for reading, because a published article's image
-- is public content that belongs on a CDN; nothing else about it is public.
-- Writing, replacing and deleting are for active admins only, decided by the
-- same private.is_admin() the rest of the schema uses.
--
-- A draft cannot leak through this: the path lives in the article row, and
-- the RLS policy on public.articles hands out no draft rows, so a visitor
-- never learns the path of an unpublished image.
--
-- Type and size are enforced by the bucket itself rather than by application
-- code, so an upload that goes around the admin UI is refused too.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'article-media',
  'article-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists article_media_admin_read   on storage.objects;
drop policy if exists article_media_admin_insert on storage.objects;
drop policy if exists article_media_admin_update on storage.objects;
drop policy if exists article_media_admin_delete on storage.objects;

-- Listing and reading through the authenticated API: admins only. Anonymous
-- reads of a published image go through the public CDN path, which does not
-- consult these policies.
create policy article_media_admin_read
  on storage.objects for select to authenticated
  using (bucket_id = 'article-media' and private.is_admin());

create policy article_media_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'article-media' and private.is_admin());

create policy article_media_admin_update
  on storage.objects for update to authenticated
  using (bucket_id = 'article-media' and private.is_admin())
  with check (bucket_id = 'article-media' and private.is_admin());

create policy article_media_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'article-media' and private.is_admin());

-- The article stores the object path, not a URL: the URL is derived from the
-- project and bucket at render time, so moving either does not rewrite rows.
alter table public.articles drop constraint articles_featured_image_shape;

alter table public.articles add constraint articles_featured_image_shape check (
  featured_image is null
  or (
    jsonb_typeof(featured_image) = 'object'
    and jsonb_typeof(featured_image -> 'path') = 'string'
    and jsonb_typeof(featured_image -> 'alt') = 'string'
    and length(featured_image ->> 'path') between 1 and 400
    and length(featured_image ->> 'alt') <= 300
  )
);

comment on column public.articles.featured_image is
  'Object path in the article-media bucket plus its alt text: {"path": "...", "alt": "..."}.';
