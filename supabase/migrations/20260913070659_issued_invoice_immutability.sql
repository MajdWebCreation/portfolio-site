-- An issued invoice is a fact, not a draft.
--
-- The moment an invoice has been sent to the customer -- `sent_at` is set --
-- it is the document they hold and the one their accountant will file. From
-- then on its figures, its snapshot and its dates may not move, because two
-- versions of the same invoice number is the one thing a financial
-- administration must never produce.
--
-- Stated here rather than in application code because application code is not
-- the only way in: a server action, a webhook, a future job, a hand-written
-- query at three in the morning. The rule holds for all of them.
--
-- What stays allowed on a sent invoice, and why:
--
--   status           the payment system moves sent -> paid -> overdue; that is
--                    the whole point of settlement and must keep working.
--   sent_at          resending the same document is legitimate.
--   recipient_email  it records where that send went.
--   updated_at       written by the trigger that keeps it honest.
--
-- Correcting a sent invoice is deliberately not possible. That needs a credit
-- note, which is its own flow and its own document; blocking the unsafe edit
-- now is what keeps that option open later.

create or replace function private.refuse_issued_invoice_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Not issued yet: still a draft, still editable.
  if old.sent_at is null then
    return new;
  end if;

  if new.number_value          is distinct from old.number_value
     or new.number_provisional is distinct from old.number_provisional
     or new.customer_id        is distinct from old.customer_id
     or new.customer_company_name is distinct from old.customer_company_name
     or new.customer_contact_name is distinct from old.customer_contact_name
     or new.customer_email        is distinct from old.customer_email
     or new.customer_street       is distinct from old.customer_street
     or new.customer_postal_code  is distinct from old.customer_postal_code
     or new.customer_city         is distinct from old.customer_city
     or new.customer_country      is distinct from old.customer_country
     or new.customer_kvk_number   is distinct from old.customer_kvk_number
     or new.customer_vat_number   is distinct from old.customer_vat_number
     or new.issue_date            is distinct from old.issue_date
     or new.due_date              is distinct from old.due_date
     or new.payment_reference     is distinct from old.payment_reference
     or new.notes                 is distinct from old.notes
     or new.recurring_service_id  is distinct from old.recurring_service_id
     or new.billing_period_start  is distinct from old.billing_period_start
     or new.billing_period_end    is distinct from old.billing_period_end
     or new.quote_id              is distinct from old.quote_id
     or new.project_id            is distinct from old.project_id
  then
    raise exception
      'Factuur % is al verstuurd; de gegevens ervan liggen vast. Corrigeren kan alleen met een creditfactuur.',
      old.number_value
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function private.refuse_issued_invoice_changes() is
  'Freezes the financial and document-defining fields of an invoice once it has been sent.';

create trigger invoices_refuse_issued_changes
  before update on public.invoices
  for each row execute function private.refuse_issued_invoice_changes();

/*
  The lines are the invoice's figures, so they are frozen with it. Replacing
  them is how `save_invoice_lines` works, which is exactly the operation this
  has to stop once the document is out.
*/
create or replace function private.refuse_issued_invoice_line_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  v_sent_at    timestamptz;
  v_number     text;
begin
  select sent_at, number_value into v_sent_at, v_number
  from public.invoices where id = v_invoice_id;

  if v_sent_at is not null then
    raise exception
      'Factuur % is al verstuurd; de regels ervan liggen vast. Corrigeren kan alleen met een creditfactuur.',
      v_number
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function private.refuse_issued_invoice_line_changes() is
  'Freezes the lines of an invoice once it has been sent.';

create trigger invoice_lines_refuse_issued_changes
  before insert or update or delete on public.invoice_lines
  for each row execute function private.refuse_issued_invoice_line_changes();
