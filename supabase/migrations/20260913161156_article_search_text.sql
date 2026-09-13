-- A searchable plain-text representation of an article.
--
-- The admin article list used to search by loading every article's ProseMirror
-- document into the browser and flattening it there. That is half a megabyte
-- of JSON per page load to answer a question the database can answer, so the
-- search moved to the server and this column is what it searches.
--
-- Generated rather than written by the application, on purpose. `content` is
-- not only written by the admin: the library was seeded by a migration and
-- rewritten by another, and `scripts/import-articles.mjs` writes more of them.
-- A column the application maintains would silently go stale the next time
-- prose is corrected in SQL. A stored generated column cannot: the database
-- recomputes it from the row itself, whatever wrote the row.
--
-- The extraction is deliberately not a second copy of `docToPlainText()` in
-- lib/admin/articles/doc.ts. It takes every `text` value at any depth of the
-- document, which is the same set of words without knowing a single node type,
-- so a new node type in the editor needs no change here. What it does not
-- reproduce -- the block separators and whitespace collapsing -- only matters
-- for reading the text, and nothing reads this column.
--
-- Title, slug and excerpt are folded in so one `ilike` answers the whole
-- search the list offers, and the value is lowercased once here rather than on
-- every query.

create extension if not exists pg_trgm with schema extensions;

create or replace function private.article_search_text(
  title text,
  slug text,
  excerpt text,
  content jsonb
) returns text
  language sql
  immutable
  parallel safe
  set search_path = ''
as $$
  select lower(
    trim(
      concat_ws(
        ' ',
        title,
        slug,
        excerpt,
        (
          select string_agg(node #>> '{}', ' ')
          from pg_catalog.jsonb_array_elements(
            pg_catalog.jsonb_path_query_array(coalesce(content, '{}'::jsonb), '$.**.text')
          ) as node
        )
      )
    )
  );
$$;

alter table public.articles
  add column search_text text
  generated always as (private.article_search_text(title, slug, excerpt, content)) stored;

-- Trigram index, because the list searches on a substring (`%needle%`) rather
-- than on whole words. A tsvector would be faster for word search and useless
-- for "typ een deel van een woord", which is what the field does today.
create index articles_search_text_idx
  on public.articles using gin (search_text extensions.gin_trgm_ops);

-- Column privileges on this table are granted per column, so a new column is
-- readable by nobody until it is named. Only the admin searches; the public
-- site reads articles by slug and never needs this.
grant select (search_text) on public.articles to authenticated;
