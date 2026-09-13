-- A recurring service belongs to a project, and is activated by an invoice.
--
-- Two links, both small, both stated in the database so the application does
-- not have to remember them across a webhook retry.
--
--   project_id              which project the monthly service is part of.
--                           Monthly invoices generated for the service inherit
--                           it, so the whole engagement -- the one-off project
--                           invoice and every month after -- shows up on the
--                           same project page.
--
--   activation_invoice_id   which one-off invoice is meant to establish the
--                           mandate for this service. The customer pays that
--                           invoice once and authorises the direct debit in
--                           the same step; the webhook needs to know, minutes
--                           or hours later and possibly on a retry, which
--                           service that payment was supposed to switch on.
--                           Mollie metadata carries the ids for routing, but
--                           this is the source of truth.
--
-- Both use the composite-key trick the rest of this schema uses, so neither
-- can point at another customer's project or another customer's invoice.

alter table public.recurring_services
  add column project_id uuid,
  add column activation_invoice_id uuid,

  add constraint recurring_services_project_same_customer
    foreign key (project_id, customer_id) references public.projects (id, customer_id)
    on delete set null (project_id),

  /* Restrict, not set null: an invoice that switched a service on is part of
     that service's history and is not something to remove underneath it. */
  add constraint recurring_services_activation_same_customer
    foreign key (activation_invoice_id, customer_id) references public.invoices (id, customer_id);

comment on column public.recurring_services.project_id is
  'The project this monthly service belongs to; inherited by the invoices it generates.';
comment on column public.recurring_services.activation_invoice_id is
  'The one-off invoice whose payment establishes the mandate for this service.';

-- Covering indexes for the new foreign keys, partial because a service
-- without the link has nothing to look up, and leading with the referencing
-- column so the check that runs when a project or an invoice is removed has
-- an index to use. Same shape as quotes_project_idx and invoices_project_idx.
create index recurring_services_project_idx
  on public.recurring_services (project_id, customer_id) where project_id is not null;

/*
  One invoice activates at most one service: paying a single invoice cannot be
  made to switch on two subscriptions, whatever an admin or a webhook retry
  does. Unique on the pair rather than on activation_invoice_id alone, which
  comes to the same thing -- the composite foreign key above forces
  customer_id to be that invoice's customer, so two services naming the same
  invoice necessarily agree on it -- while also covering the foreign key, so
  one index does both jobs instead of two leading with the same column.
*/
create unique index recurring_services_activation_idx
  on public.recurring_services (activation_invoice_id, customer_id) where activation_invoice_id is not null;
