-- Public read access to articles.
--
-- The public Inzichten pages read from this table now, so anon needs SELECT.
-- The policy is the whole publication rule: an article is public when it is
-- published and its publication date has arrived. A draft, or an article
-- dated in the future, is not readable by anon at all -- not by slug, not by
-- listing, not by counting. There is no application code that can leak one,
-- because the database never hands it out.
--
-- Admins keep reading and writing every article through articles_admin_all.

grant select on table public.articles to anon;

drop policy if exists articles_public_read on public.articles;
create policy articles_public_read
  on public.articles
  for select
  to anon, authenticated
  using (
    status = 'published'
    and published_at is not null
    and published_at <= (now() at time zone 'utc')::date
  );
