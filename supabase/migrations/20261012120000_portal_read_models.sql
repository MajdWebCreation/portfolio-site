-- What a portal member may read: their own customer's documents and services.
--
-- Phase 2 gave the portal an identity (customer_users) and a tenant boundary
-- (private.portal_customer_ids()). This migration gives it something to
-- read, and only through functions:
--
--   portal_customer(customer)            the customer's own details
--   portal_invoices(customer)            the invoices they received
--   portal_invoice(customer, invoice)    one of those
--   portal_quotes(customer)              the quotes they received
--   portal_quote(customer, quote)        one of those, with its versions
--   portal_services(customer)            their monthly services
--   portal_document(customer, kind, id)  where one document's PDF is stored
--
-- No business table gains a policy for customers. The grants to
-- `authenticated` on those tables are table-wide, internal columns
-- included, so a customer SELECT policy would hand those columns out
-- through the REST API. Instead every function here:
--
--   - is SECURITY DEFINER with an empty search_path and qualified names;
--   - asks private.portal_require_customer() first, which refuses (42501)
--     unless the customer named is one of auth.uid()'s active memberships;
--   - names a resource together with its customer, and refuses a resource
--     that is not that customer's -- or not visible, or not there -- with
--     the same 42501, so a refusal says nothing about whether it exists;
--   - returns named columns, and jsonb only with named keys: no provider
--     ids, no notes, no claims, no lifecycle or debug fields;
--   - is executable by `authenticated` only.
--
-- What a customer sees is decided once, in four private views, and every
-- function -- and the storage policy -- reads through them:
--
--   invoices      definitive (number, issued, stored PDF) and sent, with a
--                 status that is a claim on the customer: sent, overdue,
--                 paid. A concept, an issued invoice that never went out
--                 and a cancelled one are not the customer's business.
--   credit notes  issued with their PDF, against a visible invoice: exactly
--                 the notes the ledger counts, so the portal's open amount is
--                 the admin's -- also for a note issued but not mailed yet; it
--                 is a definitive document in the customer's favour.
--   quotes        sent, numbered, with the stored PDF. A concept never; a
--                 legacy quote sent before quotes were stored has no
--                 document and is not shown.
--   services      everything but a concept.
--
-- The money is not computed here. The functions return the facts the
-- application's ledger (invoiceLedger) already reads -- lines, successful
-- payments, issued credit notes, live refunds -- so the portal and the
-- admin derive the same figures from the same rules.

-- ------------------------------------------------------------ the boundary

/*
  The one check every portal function starts with. Invoker: it runs inside
  the definer functions below and only reads private.portal_customer_ids(),
  which is a definer of its own. Not callable from outside.
*/
create or replace function private.portal_require_customer(p_customer_id uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or p_customer_id is null
     or not (p_customer_id = any (private.portal_customer_ids()))
  then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;
end;
$$;

comment on function private.portal_require_customer(uuid) is
  'Raises 42501 unless the customer is one of the active memberships of auth.uid(). The first statement of every portal read.';

revoke all on function private.portal_require_customer(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------- visibility

create or replace view private.portal_visible_invoices as
  select i.id, i.customer_id
  from public.invoices i
  where not i.number_provisional
    and i.issued_at is not null
    and i.document_path is not null
    and i.sent_at is not null
    and i.status in ('sent', 'overdue', 'paid');

create or replace view private.portal_visible_credit_notes as
  select cn.id, cn.customer_id, cn.invoice_id
  from public.credit_notes cn
  join private.portal_visible_invoices vi on vi.id = cn.invoice_id and vi.customer_id = cn.customer_id
  where not cn.number_provisional
    and cn.issued_at is not null
    and cn.document_path is not null;

create or replace view private.portal_visible_quotes as
  select q.id, q.customer_id
  from public.quotes q
  where q.status <> 'draft'
    and q.sent_at is not null
    and not q.number_provisional
    and q.document_path is not null
    and not q.legacy_sent_without_document;

create or replace view private.portal_visible_services as
  select s.id, s.customer_id
  from public.recurring_services s
  where s.status <> 'draft';

comment on view private.portal_visible_invoices is 'The invoices a portal member may see: definitive, stored, sent, and a claim (sent/overdue/paid). The one definition; the portal functions and the storage policy read it.';
comment on view private.portal_visible_credit_notes is 'Issued credit notes with their PDF, against a visible invoice: the notes the ledger counts.';
comment on view private.portal_visible_quotes is 'Sent, numbered quotes with a stored PDF. Never a concept, never a legacy quote without a document.';
comment on view private.portal_visible_services is 'Monthly services past the concept stage.';

revoke all on private.portal_visible_invoices, private.portal_visible_credit_notes,
              private.portal_visible_quotes, private.portal_visible_services
  from public, anon, authenticated;

-- ------------------------------------------------------------- customer

create or replace function public.portal_customer(p_customer_id uuid)
returns table (
  company_name text,
  contact_name text,
  email        text,
  phone        text,
  street       text,
  postal_code  text,
  city         text,
  country      text,
  kvk_number   text,
  vat_number   text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.portal_require_customer(p_customer_id);

  return query
    select c.company_name, c.contact_name, c.email, c.phone, c.street, c.postal_code,
           c.city, c.country, c.kvk_number, c.vat_number
    from public.customers c
    where c.id = p_customer_id;
end;
$$;

comment on function public.portal_customer(uuid) is
  'The current details of one of the caller''s customers. No notes, status, source or attribution.';

-- ------------------------------------------------------------- invoices

/*
  The rows behind portal_invoices and portal_invoice. Invoker and without a
  grant: only the definer functions below call it, after the boundary check.
*/
create or replace function private.portal_invoice_rows(p_customer_id uuid, p_invoice_id uuid)
returns table (
  id                   uuid,
  number               text,
  issue_date           date,
  due_date             date,
  status               text,
  payment_reference    text,
  billing_period_start date,
  billing_period_end   date,
  addressed_to         jsonb,
  lines                jsonb,
  payments             jsonb,
  credit_notes         jsonb,
  refunds              jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    i.id,
    i.number_value,
    i.issue_date,
    i.due_date,
    i.status,
    i.payment_reference,
    i.billing_period_start,
    i.billing_period_end,
    jsonb_build_object(
      'company_name', i.customer_company_name,
      'contact_name', i.customer_contact_name,
      'street',       i.customer_street,
      'postal_code',  i.customer_postal_code,
      'city',         i.customer_city,
      'country',      i.customer_country,
      'kvk_number',   i.customer_kvk_number,
      'vat_number',   i.customer_vat_number
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'position',            l.position,
               'description',         l.description,
               'quantity_hundredths', l.quantity_hundredths,
               'unit_price_cents',    l.unit_price_cents,
               'vat_rate',            l.vat_rate
             ) order by l.position)
      from public.invoice_lines l
      where l.invoice_id = i.id
    ), '[]'::jsonb),
    /* Successful payments only: what arrived, not the attempts. */
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'amount_cents', p.amount_cents,
               'paid_at',      p.paid_at,
               'method',       p.method,
               'source',       p.source
             ) order by p.paid_at, p.created_at)
      from public.payments p
      where p.invoice_id = i.id
        and p.customer_id = i.customer_id
        and p.status = 'paid'
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',             cn.id,
               'number',         cn.number_value,
               'issue_date',     cn.issue_date,
               'created_at',     cn.created_at,
               'subtotal_cents', cn.subtotal_cents,
               'vat_cents',      cn.vat_cents,
               'total_cents',    cn.total_cents
             ) order by cn.issue_date, cn.created_at)
      from public.credit_notes cn
      join private.portal_visible_credit_notes vc on vc.id = cn.id
      where cn.invoice_id = i.id
        and cn.customer_id = i.customer_id
    ), '[]'::jsonb),
    /* Money on its way back or returned; failed and cancelled attempts are the admin's business. */
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'credit_note_id', r.credit_note_id,
               'amount_cents',   r.amount_cents,
               'status',         r.status,
               'created_at',     r.created_at
             ) order by r.created_at)
      from public.refunds r
      join private.portal_visible_credit_notes vc on vc.id = r.credit_note_id
      where r.invoice_id = i.id
        and r.customer_id = i.customer_id
        and r.status in ('pending', 'processing', 'refunded')
    ), '[]'::jsonb)
  from public.invoices i
  join private.portal_visible_invoices v on v.id = i.id
  where i.customer_id = p_customer_id
    and (p_invoice_id is null or i.id = p_invoice_id)
  order by i.issue_date desc, i.number_value desc;
$$;

revoke all on function private.portal_invoice_rows(uuid, uuid) from public, anon, authenticated;

create or replace function public.portal_invoices(p_customer_id uuid)
returns table (
  id                   uuid,
  number               text,
  issue_date           date,
  due_date             date,
  status               text,
  payment_reference    text,
  billing_period_start date,
  billing_period_end   date,
  addressed_to         jsonb,
  lines                jsonb,
  payments             jsonb,
  credit_notes         jsonb,
  refunds              jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.portal_require_customer(p_customer_id);

  return query
    select r.id, r.number, r.issue_date, r.due_date, r.status, r.payment_reference,
           r.billing_period_start, r.billing_period_end, r.addressed_to,
           r.lines, r.payments, r.credit_notes, r.refunds
    from private.portal_invoice_rows(p_customer_id, null) r;
end;
$$;

comment on function public.portal_invoices(uuid) is
  'The invoices one of the caller''s customers received, with the facts the ledger reads. Newest first.';

create or replace function public.portal_invoice(p_customer_id uuid, p_invoice_id uuid)
returns table (
  id                   uuid,
  number               text,
  issue_date           date,
  due_date             date,
  status               text,
  payment_reference    text,
  billing_period_start date,
  billing_period_end   date,
  addressed_to         jsonb,
  lines                jsonb,
  payments             jsonb,
  credit_notes         jsonb,
  refunds              jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.portal_require_customer(p_customer_id);

  return query
    select r.id, r.number, r.issue_date, r.due_date, r.status, r.payment_reference,
           r.billing_period_start, r.billing_period_end, r.addressed_to,
           r.lines, r.payments, r.credit_notes, r.refunds
    from private.portal_invoice_rows(p_customer_id, p_invoice_id) r;

  /* Another customer's, a concept, or nothing at all: one answer. */
  if not found then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.portal_invoice(uuid, uuid) is
  'One invoice of one of the caller''s customers. 42501 for anything else, whether it exists or not.';

-- --------------------------------------------------------------- quotes

create or replace function private.portal_quote_rows(p_customer_id uuid, p_quote_id uuid)
returns table (
  id                     uuid,
  number                 text,
  issue_date             date,
  valid_until            date,
  status                 text,
  subject                text,
  terms_edition          text,
  terms_published_on     date,
  sent_at                timestamptz,
  supersedes_quote_id    uuid,
  supersedes_number      text,
  superseded_by_quote_id uuid,
  superseded_by_number   text,
  superseded_on          timestamptz,
  lines                  jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    q.id,
    q.number_value,
    q.issue_date,
    q.valid_until,
    q.status,
    q.subject,
    q.terms_edition,
    q.terms_published_on,
    q.sent_at,
    prev.id,
    prev.number_value,
    succ.id,
    succ.number_value,
    succ.sent_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'position',            l.position,
               'description',         l.description,
               'quantity_hundredths', l.quantity_hundredths,
               'unit_price_cents',    l.unit_price_cents,
               'vat_rate',            l.vat_rate
             ) order by l.position)
      from public.quote_lines l
      where l.quote_id = q.id
    ), '[]'::jsonb)
  from public.quotes q
  join private.portal_visible_quotes v on v.id = q.id
  /* The version it replaced and the one that replaced it, each only when the customer has it. */
  left join lateral (
    select p.id, p.number_value
    from public.quotes p
    join private.portal_visible_quotes vp on vp.id = p.id
    where p.id = q.supersedes_quote_id and p.customer_id = q.customer_id
  ) prev on true
  left join lateral (
    select s.id, s.number_value, s.sent_at
    from public.quotes s
    join private.portal_visible_quotes vs on vs.id = s.id
    where s.supersedes_quote_id = q.id and s.customer_id = q.customer_id
  ) succ on true
  where q.customer_id = p_customer_id
    and (p_quote_id is null or q.id = p_quote_id)
  order by q.issue_date desc, q.number_value desc;
$$;

revoke all on function private.portal_quote_rows(uuid, uuid) from public, anon, authenticated;

create or replace function public.portal_quotes(p_customer_id uuid)
returns table (
  id                     uuid,
  number                 text,
  issue_date             date,
  valid_until            date,
  status                 text,
  subject                text,
  terms_edition          text,
  terms_published_on     date,
  sent_at                timestamptz,
  supersedes_quote_id    uuid,
  supersedes_number      text,
  superseded_by_quote_id uuid,
  superseded_by_number   text,
  superseded_on          timestamptz,
  lines                  jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.portal_require_customer(p_customer_id);

  return query
    select r.id, r.number, r.issue_date, r.valid_until, r.status, r.subject,
           r.terms_edition, r.terms_published_on, r.sent_at,
           r.supersedes_quote_id, r.supersedes_number,
           r.superseded_by_quote_id, r.superseded_by_number, r.superseded_on, r.lines
    from private.portal_quote_rows(p_customer_id, null) r;
end;
$$;

comment on function public.portal_quotes(uuid) is
  'The quotes one of the caller''s customers received: sent, with a stored PDF. Never a concept. No intro or notes: those are read in the PDF.';

create or replace function public.portal_quote(p_customer_id uuid, p_quote_id uuid)
returns table (
  id                     uuid,
  number                 text,
  issue_date             date,
  valid_until            date,
  status                 text,
  subject                text,
  terms_edition          text,
  terms_published_on     date,
  sent_at                timestamptz,
  supersedes_quote_id    uuid,
  supersedes_number      text,
  superseded_by_quote_id uuid,
  superseded_by_number   text,
  superseded_on          timestamptz,
  lines                  jsonb,
  versions               jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.portal_require_customer(p_customer_id);

  return query
    with recursive
      /* Up the chain to its first version, then down every version after it. */
      up as (
        select q.id, q.supersedes_quote_id, 0 as depth
        from public.quotes q
        where q.id = p_quote_id and q.customer_id = p_customer_id
        union all
        select p.id, p.supersedes_quote_id, up.depth + 1
        from public.quotes p
        join up on p.id = up.supersedes_quote_id
        where p.customer_id = p_customer_id and up.depth < 100
      ),
      first_version as (
        select up.id from up order by up.depth desc limit 1
      ),
      down as (
        select f.id, 0 as depth from first_version f
        union all
        select s.id, down.depth + 1
        from public.quotes s
        join down on s.supersedes_quote_id = down.id
        where s.customer_id = p_customer_id and down.depth < 100
      )
    select r.id, r.number, r.issue_date, r.valid_until, r.status, r.subject,
           r.terms_edition, r.terms_published_on, r.sent_at,
           r.supersedes_quote_id, r.supersedes_number,
           r.superseded_by_quote_id, r.superseded_by_number, r.superseded_on, r.lines,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id',         q.id,
                      'number',     q.number_value,
                      'issue_date', q.issue_date,
                      'sent_at',    q.sent_at
                    ) order by down.depth)
             from down
             join public.quotes q on q.id = down.id
             join private.portal_visible_quotes vq on vq.id = q.id
           ), '[]'::jsonb)
    from private.portal_quote_rows(p_customer_id, p_quote_id) r;

  if not found then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.portal_quote(uuid, uuid) is
  'One quote of one of the caller''s customers, with the visible versions of its chain. 42501 for anything else.';

-- ------------------------------------------------------------- services

create or replace function public.portal_services(p_customer_id uuid)
returns table (
  id                        uuid,
  name                      text,
  status                    text,
  amount_cents              integer,
  vat_rate                  integer,
  starts_on                 date,
  ends_on                   date,
  cancellation_requested_on date,
  collects_by_direct_debit  boolean,
  last_term_amount_cents    integer,
  billed_period_starts      date[],
  price_changes             jsonb,
  agreements                jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.portal_require_customer(p_customer_id);

  return query
    select
      s.id,
      s.name,
      s.status,
      s.amount_cents,
      s.vat_rate,
      s.starts_on,
      s.ends_on,
      (s.cancellation_requested_at at time zone 'Europe/Amsterdam')::date,
      /* Whether a collection runs at the provider; never the provider's id. */
      s.mollie_subscription_id is not null,
      /* The partial last term's amount, once it was settled; before that the plan's own pro-rata figure applies. */
      case when s.last_term_synced_at is not null then s.last_term_amount_cents end,
      /*
        The periods already billed, which place the next collection on the
        calendar -- every invoice of the service, as the admin's scheduler
        counts them, so both name the same date. Dates only.
      */
      coalesce((
        select array_agg(distinct i.billing_period_start order by i.billing_period_start)
        from public.invoices i
        where i.recurring_service_id = s.id
          and i.customer_id = s.customer_id
          and i.billing_period_start is not null
      ), '{}'::date[]),
      /*
        The price history a customer may rely on: changes carried out, and
        changes the provider already holds -- from then on the admin can no
        longer withdraw them and the collection will be at that price. A
        change still being planned (withdrawable, mail optional) is not shown
        until then; never one withdrawn or blocked. pricing.ts reads these
        rows the same way it reads the admin's.
      */
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'effective_from',   pc.effective_from,
                 'old_amount_cents', pc.old_amount_cents,
                 'new_amount_cents', pc.new_amount_cents,
                 'applied',          pc.applied_at is not null
               ) order by pc.effective_from)
        from public.recurring_price_changes pc
        where pc.recurring_service_id = s.id
          and pc.customer_id = s.customer_id
          and pc.canceled_at is null
          and (pc.blocked_at is null or pc.applied_at is not null)
          and (pc.applied_at is not null or pc.provider_updated_at is not null)
      ), '[]'::jsonb),
      /* The agreement chain: the terms, their source kind and set. No notes, labels or authors. */
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id',                  a.id,
                 'sequence',            a.sequence,
                 'effective_from',      a.effective_from,
                 'source_kind',         a.source_kind,
                 'accepted_on',         a.accepted_on,
                 'notice_months',       a.notice_months,
                 'minimum_term_months', a.minimum_term_months,
                 'proration_rule',      a.proration_rule,
                 'has_special_terms',   btrim(a.special_terms) <> '',
                 'terms_edition',       a.terms_edition,
                 'terms_published_on',  a.terms_published_on
               ) order by a.sequence)
        from public.recurring_service_agreements a
        where a.recurring_service_id = s.id
          and a.customer_id = s.customer_id
      ), '[]'::jsonb)
    from public.recurring_services s
    join private.portal_visible_services v on v.id = s.id
    where s.customer_id = p_customer_id
    order by s.starts_on nulls last, s.name;
end;
$$;

comment on function public.portal_services(uuid) is
  'The monthly services of one of the caller''s customers, with the price history and agreement chain the application resolves. No provider ids, claims, problems or deviation provenance.';

-- ------------------------------------------------------------ documents

/*
  Where one document's PDF is, for the portal's download route, which then
  reads the object under the member's own session (see the storage policy
  below) and checks it against the hash. kind: invoice | credit_note | quote.
*/
create or replace function public.portal_document(p_customer_id uuid, p_kind text, p_id uuid)
returns table (
  number       text,
  path         text,
  sha256       text,
  bytes        integer,
  generated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.portal_require_customer(p_customer_id);

  if p_kind is null or p_kind not in ('invoice', 'credit_note', 'quote') then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;

  if p_kind = 'invoice' then
    return query
      select i.number_value, i.document_path, i.document_sha256, i.document_bytes, i.document_generated_at
      from public.invoices i
      join private.portal_visible_invoices v on v.id = i.id
      where i.id = p_id and i.customer_id = p_customer_id;
  elsif p_kind = 'credit_note' then
    return query
      select cn.number_value, cn.document_path, cn.document_sha256, cn.document_bytes, cn.document_generated_at
      from public.credit_notes cn
      join private.portal_visible_credit_notes v on v.id = cn.id
      where cn.id = p_id and cn.customer_id = p_customer_id;
  elsif p_kind = 'quote' then
    return query
      select q.number_value, q.document_path, q.document_sha256, q.document_bytes, q.document_generated_at
      from public.quotes q
      join private.portal_visible_quotes v on v.id = q.id
      where q.id = p_id and q.customer_id = p_customer_id;
  end if;

  if not found then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.portal_document(uuid, text, uuid) is
  'The stored PDF of one visible invoice, credit note or quote of one of the caller''s customers. 42501 for anything else.';

-- --------------------------------------------------------------- grants

revoke all on function public.portal_customer(uuid)               from public, anon;
revoke all on function public.portal_invoices(uuid)               from public, anon;
revoke all on function public.portal_invoice(uuid, uuid)          from public, anon;
revoke all on function public.portal_quotes(uuid)                 from public, anon;
revoke all on function public.portal_quote(uuid, uuid)            from public, anon;
revoke all on function public.portal_services(uuid)               from public, anon;
revoke all on function public.portal_document(uuid, text, uuid)   from public, anon;

grant execute on function public.portal_customer(uuid)             to authenticated;
grant execute on function public.portal_invoices(uuid)             to authenticated;
grant execute on function public.portal_invoice(uuid, uuid)        to authenticated;
grant execute on function public.portal_quotes(uuid)               to authenticated;
grant execute on function public.portal_quote(uuid, uuid)          to authenticated;
grant execute on function public.portal_services(uuid)             to authenticated;
grant execute on function public.portal_document(uuid, text, uuid) to authenticated;

-- -------------------------------------------------------------- storage

/*
  A member reads a PDF in the private bucket only when its object path is
  the stored document of something visible to them. The path is never
  enough by itself: the same path asked by another customer's member, by a
  revoked one, or anonymously, matches nothing here and nothing in the admin
  policy. Definer, because the policy runs as the member and the member has
  no read on the business tables; it answers yes or no and nothing else.
*/
create or replace function private.portal_can_read_document(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (select private.portal_customer_ids() as ids)
  select p_name is not null and (
    exists (
      select 1
      from public.invoices i
      join private.portal_visible_invoices v on v.id = i.id
      cross join mine
      where i.document_path = p_name and i.customer_id = any (mine.ids)
    )
    or exists (
      select 1
      from public.credit_notes cn
      join private.portal_visible_credit_notes v on v.id = cn.id
      cross join mine
      where cn.document_path = p_name and cn.customer_id = any (mine.ids)
    )
    or exists (
      select 1
      from public.quotes q
      join private.portal_visible_quotes v on v.id = q.id
      cross join mine
      where q.document_path = p_name and q.customer_id = any (mine.ids)
    )
  );
$$;

comment on function private.portal_can_read_document(text) is
  'True when the object path is the stored PDF of an invoice, credit note or quote visible to one of the caller''s active memberships. Used by the storage policy only.';

revoke all on function private.portal_can_read_document(text) from public, anon;
grant execute on function private.portal_can_read_document(text) to authenticated;

create index if not exists invoices_document_idx on public.invoices (document_path) where document_path is not null;
create index if not exists credit_notes_document_idx on public.credit_notes (document_path) where document_path is not null;

create policy invoice_documents_portal_read
  on storage.objects for select to authenticated
  using (bucket_id = 'invoice-documents' and private.portal_can_read_document(name));
