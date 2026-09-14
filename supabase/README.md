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
  `published_at` has arrived, so a draft never leaves the database and an
  article dated in the future is not handed out either. See *Scheduling*.
- **Inquiries** — write only. `anon` holds an INSERT grant on eight named
  columns; `status`, `received_at`, `internal_note` and `updated_at` are not
  among them and can only take their defaults. There is no SELECT grant, so a
  visitor cannot read back what was submitted.

No service role key is used anywhere in the application.

## Scheduling articles

There is no fourth status for "scheduled". An article that is `published` with
a `published_at` in the future *is* scheduled: the `articles_public_read`
policy returns it to nobody until that date, so it is absent from the
overview, from its own URL and from the sitemap. On the day it arrives the
same policy starts returning it, and the blog pages and sitemap pick it up
because they revalidate hourly (`export const revalidate` in
`app/[locale]/blog`). Nobody has to touch the admin.

The admin shows this as its own state: `isScheduled()` in
`lib/admin/articles/types.ts` turns "published with a future date" into the
label *Ingepland*, and the article list can filter on it.

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

## Customer communication

`public.customer_communications` is the append-only log of e-mail this system
sent to a customer: one row per send, written only after Resend accepted the
message. A second send of the same invoice is a second row, never an update of
the first.

Everything that mails a customer goes through `sendCustomerEmail()`
(`lib/admin/communications/send.ts`), which delivers and then records; no mail
flow writes to the table itself. The category list in the check constraint and
`CommunicationCategory` in `lib/admin/communications/types.ts` are one list —
widen both together.

Each optional link (`invoice_id`, `quote_id`, `project_id`,
`recurring_service_id`) is a *composite* reference against `(id, customer_id)`
on the target table, so customer A's mail can never be filed against customer
B's document. Deleting a document clears the link column and nothing else.
The quote link needs `quotes (id, customer_id)`, which was dropped in
`20260912201703` when the last reference to it went; the communications
migration puts that unique key back.

Read and append only: no update and no delete grant, and no anon access at
all. The two flows without a session — the Mollie webhook and the daily
pre-notification job — write through the elevated server-side client, as they
already do for the payment tables.

The status column carries only what Resend reports at send time (`sent` /
`failed`). There is no delivery, open or click tracking anywhere in this
application, so there are no states here pretending otherwise.

## Betalingsopvolging

Two tables, two jobs, and neither repeats what the invoices already say.

`invoice_collection_events` is what the automation did: one row per reminder
stage per invoice. The unique index on `(invoice_id, stage)` is what makes the
daily cron safe to run twice, twice at once, or after a crash — a failed row is
retried in place, never duplicated. `invoice_collections` is what a human
decided: `paused`, `disputed`, `payment_plan`, `handed_over`. One row per
invoice, and no row at all for the ones nobody touched.

Deliberately **not** stored: how far along an invoice is, and whether it is
ready to hand over. Both follow from the events plus the invoice's own due date
and settlement, so `invoiceCollectionView()` in
`lib/payments/collection-state.ts` derives them — the same function the cron and
the admin screen both ask, which is why the screen cannot promise a step the
cron would not take. `invoices` gains no column and no new status.

The stage list and `ReminderStage` in `lib/payments/collection-policy.ts` are
one list, as are the state list and `CollectionState`. Widen both together.

Reminder events are read and append only for `authenticated`; the hold is
read/write, because withdrawing a decision is part of making one. No anon
access. The daily job writes through the elevated server-side client.

### The EUR 20

There is no column anywhere in these tables that can hold an amount, and that
is on purpose. The reminder fee announced in the day-7 mail is copy — one
sentence, read from `reminderFeeCents` in `collection-policy.ts` — and it is
never charged, never invoiced, never part of a balance. Nothing may change that
until the general terms provide for it.

## Article media

Bucket `article-media`: public to read, writable only by active admins
(policies on `storage.objects`), 5 MB, JPEG/PNG/WebP/AVIF enforced by the
bucket. An article stores `{"path": ..., "alt": ...}` in `featured_image`; the
URL is derived at render time.

A path that starts with `/` is not a bucket object but a file this repository
ships, under `public/images/artikelen`. That is where the covers of the
imported library articles live; `articleImageUrl()` returns such a path
unchanged and only builds a CDN URL for real object paths.

## Importing the article library

`scripts/import-articles.mjs` turns the markdown originals into the seed
migration `20260911094500_articles_library_seed.sql`: markdown to article
blocks to the editor document, links rewritten and checked against the routes
this site has, and the publication plan attached. Re-running it regenerates
the migration; re-applying the migration updates the same rows, keyed on slug.
`scripts/make-article-covers.mjs` draws the cover images that go with them.

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
