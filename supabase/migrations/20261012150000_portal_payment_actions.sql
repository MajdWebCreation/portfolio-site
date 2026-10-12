-- The portal's two money actions: paying an invoice, activating direct debit.
--
-- Neither is a new payment architecture. Paying an invoice goes through the
-- invoice's existing payment link (pay-link.ts, checkout.ts); activating
-- direct debit through the existing EUR 0.01 activation link
-- (mandate-activation.ts). What this migration adds is what the portal
-- needs to decide, under the member's own session, whether either may be
-- offered -- and the record of a member starting one.
--
--   portal_payment_context(customer)  whether the customer's direct debit is
--                                     active, and which of their visible
--                                     invoices it collects
--   portal_events                     two more actions a member can take

-- ------------------------------------------------------------ the record

alter table public.portal_events
  drop constraint portal_events_action_check,
  add constraint portal_events_action_check check (action in (
    'member_invited', 'member_reinvited', 'member_reactivated', 'member_revoked',
    'membership_accepted', 'password_changed', 'password_reset_requested', 'customer_selected',
    'invoice_payment_started', 'mandate_activation_requested'
  )),
  drop constraint portal_events_target_kind_check,
  add constraint portal_events_target_kind_check check (target_kind in ('membership', 'user', 'invoice', 'customer'));

comment on table public.portal_events is
  'Append-only record of account and payment actions in the customer portal. Written by the admin membership actions, the portal functions and the portal''s payment boundary; never updated or deleted. No provider ids, URLs or secrets.';

-- ------------------------------------------------------- payment context

/*
  What the portal needs to know before it offers a payment action, and
  nothing a customer should not see:

    mandate_on_record          the customer has a mandate the administration
                               last saw as valid (never its id);
    activations                the customer's activation attempts, as dates
                               and Mollie's mandate state (never a link, an
                               id or a payment);
    direct_debit_invoice_ids   the customer's visible invoices that bill a
                               service collecting by direct debit -- the same
                               rule pay-link.ts applies before it makes a
                               link: such an invoice gets no pay button.

  The application turns the first two into the admin's own direct debit
  status (direct-debit-status.ts).
*/
create or replace function public.portal_payment_context(p_customer_id uuid)
returns table (
  mandate_on_record        boolean,
  activations              jsonb,
  direct_debit_invoice_ids uuid[]
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
      exists (
        select 1
        from public.customer_payment_providers cp
        where cp.customer_id = p_customer_id
          and cp.provider = 'mollie'
          and cp.provider_mandate_id is not null
      ),
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'created_at',     a.created_at,
                 'paid_at',        a.paid_at,
                 'archived_at',    a.archived_at,
                 'mandate_status', a.mandate_status
               ) order by a.created_at desc)
        from public.mandate_activations a
        where a.customer_id = p_customer_id
      ), '[]'::jsonb),
      coalesce((
        select array_agg(i.id order by i.id)
        from public.invoices i
        join private.portal_visible_invoices v on v.id = i.id
        join public.recurring_services s on s.id = i.recurring_service_id and s.customer_id = i.customer_id
        where i.customer_id = p_customer_id
          and s.status = 'active'
      ), '{}'::uuid[]);
end;
$$;

comment on function public.portal_payment_context(uuid) is
  'Direct debit facts of one of the caller''s customers (mandate on record, activation dates and states) and which visible invoices are collected by direct debit. No provider ids or links.';

revoke all on function public.portal_payment_context(uuid) from public, anon;
grant execute on function public.portal_payment_context(uuid) to authenticated;
