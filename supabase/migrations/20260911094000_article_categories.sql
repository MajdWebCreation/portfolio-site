-- Article categories become subject clusters.
--
-- The first four categories mixed two different things: 'webapplicaties' is a
-- subject, while 'kosten', 'seo' and 'performance' are search intents. That
-- works for four articles and stops working for a library: an article about
-- what a webshop costs belongs with the other webshop articles, not in a
-- costs bin away from its neighbours.
--
-- The five values below are the clusters the articles are actually written
-- in, and match the BlogCategory union in lib/content/blog.ts.
--
-- The four existing articles move to the cluster they belong to. Their slugs,
-- dates and text are untouched, so no URL changes and nothing is republished;
-- only the label above the title does.

alter table public.articles drop constraint articles_category_check;

update public.articles set category = 'websites'
  where category in ('kosten', 'seo', 'performance');

alter table public.articles add constraint articles_category_check check (
  category in ('websites', 'webapplicaties', 'configurators', 'automatisering', 'techniek')
);

comment on column public.articles.category is
  'Subject cluster: websites, webapplicaties, configurators, automatisering or techniek.';
