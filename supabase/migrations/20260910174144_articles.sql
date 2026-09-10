-- Articles for the Inzichten pages.
--
-- Mirrors lib/admin/articles/types.ts. The body is the ProseMirror/Tiptap
-- document the editor produces, held as jsonb; the check keeps it a document
-- node rather than arbitrary JSON. Categories are the BlogCategory union from
-- lib/content/blog.ts.
--
-- The public pages still read the file-based content in this phase; nothing
-- outside the admin reads this table yet.

create table public.articles (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  excerpt          text not null default '',
  content          jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  status           text not null default 'draft' check (status in ('draft', 'published')),
  category         text not null check (category in ('kosten', 'seo', 'webapplicaties', 'performance')),
  author           text,
  published_at     date,
  seo_title        text not null default '',
  meta_description text not null default '',
  -- Storage is not connected yet; the column exists so records have the field.
  featured_image   jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint articles_content_is_doc check (
    jsonb_typeof(content) = 'object' and content ->> 'type' = 'doc'
  ),
  constraint articles_featured_image_shape check (
    featured_image is null
    or (jsonb_typeof(featured_image) = 'object'
        and featured_image ? 'url' and featured_image ? 'alt')
  ),
  -- A published article needs a date; a draft may have one already.
  constraint articles_published_has_date check (
    status <> 'published' or published_at is not null
  )
);

comment on table public.articles is 'Admin-authored articles; body is a ProseMirror document.';
comment on column public.articles.content is 'ProseMirror/Tiptap JSON document, as produced by the editor.';

create index articles_status_idx on public.articles (status);
create index articles_updated_at_idx on public.articles (updated_at desc);

create trigger articles_set_updated_at before update on public.articles
  for each row execute function private.set_updated_at();

alter table public.articles enable row level security;
alter table public.articles force row level security;

revoke all on table public.articles from anon, authenticated;
grant select, insert, update, delete on table public.articles to authenticated;

create policy articles_admin_all on public.articles
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
