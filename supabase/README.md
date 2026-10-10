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
- **Inquiries** — write only. `anon` holds an INSERT grant on the named
  columns a visitor may hand in (the request fields, the attribution columns
  and, for a websitecheck, `website_url`); `status`, `received_at`,
  `internal_note` and `updated_at` are not among them and can only take their
  defaults. There is no SELECT grant, so a visitor cannot read back what was
  submitted. Three origins: `contact`, `project_planner` and `websitecheck`
  (the `/nl/websitecheck` landing page), each with its own shape enforced by
  `inquiries_origin_shape`.

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

## Dienstafspraken (recurring_service_agreements)

The contract terms of a monthly service, as a chain of immutable revisions
per service. Only what the general terms leave open lives here: the notice
period, a minimum term, how a partial last term is billed, a special
arrangement, where those come from (`standard_terms`, `accepted_offer`,
`later_written_amendment`) and which set of general terms applies
(`terms_edition` + `terms_published_on`, as `docs/legal/voorwaarden`
registers it). Price, VAT, start date and billing day are **not** here; they
keep their one owner (`recurring_price_changes`, `recurring_services`).

A `null` term means the general terms' standard (one calendar month, pro
rata by days, no minimum term; `standardTermsFor()` in
`lib/payments/service-agreement.ts`). A deviation needs a non-standard
source and an acceptance date — check constraints, not form logic. A
`null` set of terms (both columns) means the set is not historically
established: the backfill records every pre-existing service that way,
because a set published later does not apply to an existing agreement by
itself (art. 29.1), and nothing in the data says which set did. The admin
sees "Voorwaardenversie niet historisch vastgesteld" and can record the
set when known.

Revisions are never updated or deleted: no grant, plus triggers for every
other role. The only writes let through are the foreign key's SET NULL of
`source_quote_id` when the offer goes (the label snapshot stays) and the
cascade when the service itself is removed. A change is a new row naming
the one it supersedes, and `supersedes_id` is unique, so two admins saving
at once cannot both land. `sequence` is assigned by trigger and
`effective_from` never goes backwards along the chain, so the revision in
force on a day is the highest sequence effective by then.

A new service is created through `create_recurring_service()`, which writes
the service and its first revision (the standard, under the set published
today) in one transaction: neither exists without the other.

A cancellation reads the notice, an agreed minimum term and the proration
rule from the revision in force on the request day and writes what it
applied on the service (`cancellation_notice_months`,
`cancellation_minimum_term_months` / `_ends_on`,
`cancellation_contractual_ends_on`, `cancellation_agreement_revision_id`,
`cancellation_source`, `cancellation_proration_rule`). A last day other
than the contractual one — earlier, inside an agreed minimum term, or
later — is a contractual deviation agreed in writing: the
`cancellation_deviation_*` columns (kind, label, agreed date, reason) are
required by check constraint for every deviation, and the contractual day
itself stays in `cancellation_contractual_ends_on`. There is no separate
"operational" stop date: the service is billed and collected through
`ends_on`, so a later day is a contractual one or nothing. Those columns
are the record of that one decision;
what applies today is always resolved from the chain. Later revisions do
not touch an existing cancellation.

A recurring service is never deleted by the application (no grant, no
path), and a service with history — a subscription, a cancellation,
invoices, price changes or announcements, or any status past
`awaiting_mandate` — is refused by trigger for every role; only an unused
draft can be removed, which is what local test cleanup relies on.

Billing stays monthly in advance for every service: `billing_interval`
allows only `monthly` (the create function hard-codes it), the invoice
falls due on the first day of the period it bills, and the agreement has
no billing column. A contract that needs billing in arrears or another
frequency cannot be activated until the billing lifecycle is extended for
it; the admin screen shows "Maandelijks vooraf" as the only supported way.
