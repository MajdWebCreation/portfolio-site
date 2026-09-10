# Supabase

Project: **YM-Creations** — `wbrqbuctwzpobnvcsomt`

## Migrations

`migrations/` mirrors what has been applied to the remote project. Apply new
ones with the Supabase CLI or the MCP connection, then regenerate the types:

```sh
npx supabase gen types typescript --project-id wbrqbuctwzpobnvcsomt \
  > src/lib/supabase/database.types.ts
```

## What the public site reads

Three things reach a visitor straight from the database, as `anon`:

- **Pricing** — `pricing_packages` and `pricing_addons`. Readable while
  `is_active`; every amount on `/nl/tarieven`, `/en/pricing` and the project
  planner comes from here, and nowhere else.
- **Articles** — `articles`. Readable only while `status = 'published'` and
  `published_at` has arrived, so a draft never leaves the database.
- **Inquiries** — write only. `anon` holds an INSERT grant on eight named
  columns; `status`, `received_at`, `internal_note` and `updated_at` are not
  among them and can only take their defaults. There is no SELECT grant, so a
  visitor cannot read back what was submitted.

No service role key is used anywhere in the application.

## Document numbers

`public.document_counters` holds one counter per kind and year and is the only
source of definitive numbers. `assign_quote_number(uuid)` and
`assign_invoice_number(uuid)` issue `YM-O-YYYY-NNNNNN` / `YM-F-YYYY-NNNNNN`
once per document: they lock the document row, return the number it already
has when it has one, and otherwise take the next value from the counter in a
single upsert. Both are SECURITY INVOKER and executable by `authenticated`
only, so the policies decide and anon cannot reach them.

A document keeps its `OFF-CONCEPT-…` / `FAC-CONCEPT-…` number until it is
actually sent. Never edit `next_sequence` by hand on a live series.

## Article media

Bucket `article-media`: public to read, writable only by active admins
(policies on `storage.objects`), 5 MB, JPEG/PNG/WebP/AVIF enforced by the
bucket. An article stores `{"path": ..., "alt": ...}` in `featured_image`; the
URL is derived at render time.

## Creating the first admin

There is deliberately no way to do this from the application: no sign-up, no
first-user-becomes-admin, no admin e-mail in an environment variable. Admin
rights exist only as a row in `admin_profiles`, and only a role with BYPASSRLS
(the dashboard, the SQL editor, the service role) can write one.

Two one-off steps in the Supabase dashboard:

1. **Authentication → Users → Add user → Create new user.** Enter the e-mail
   address and a password, and tick **Auto Confirm User**. The project requires
   confirmed e-mail (`mailer_autoconfirm` is off), and without a confirmed
   address the account cannot sign in. Copy the new user's UID.

2. **SQL Editor**, with that UID:

   ```sql
   insert into public.admin_profiles (user_id, display_name)
   values ('<paste-the-uid>', 'Majd');
   ```

Revoke access later without deleting anything:

```sql
update public.admin_profiles set is_active = false where user_id = '<uid>';
```

## Recommended setting

**Authentication → Sign In / Providers → disable "Allow new users to sign up".**
Sign-up is currently open on the project. It grants no admin access — that
needs a row in `admin_profiles` — but with no public sign-up flow on the site
there is nothing that needs it, and leaving it on lets anyone create accounts.
