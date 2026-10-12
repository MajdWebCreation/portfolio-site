/**
 * Customers are companies YM works for. A customer can come from an inquiry
 * or a lead (kept as optional references) and will later carry quotes,
 * invoices and projects; those modules attach to `Customer.id`.
 */
export type CustomerStatus = "active" | "inactive";

export type CustomerAddress = {
  street: string;
  postalCode: string;
  city: string;
  country: string;
};

export type Customer = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  /** Where financial mail goes instead of `email`, when set. Not the portal sign-in address. */
  billingEmail?: string;
  phone?: string;
  address: CustomerAddress;
  kvkNumber?: string;
  vatNumber?: string;
  notes: string;
  status: CustomerStatus;
  /** ISO timestamp. */
  createdAt: string;
  /**
   * The version of the record: `updated_at` exactly as the database wrote it.
   * A save names the version it was made from, so an edit the customer made
   * in the portal in the meantime is never overwritten unseen.
   */
  updatedAt: string;
  /** Where the customer came from, when known. */
  sourceInquiryId?: string;
  sourceLeadId?: string;
};

export const customerStatusLabels: Record<CustomerStatus, string> = {
  active: "Actief",
  inactive: "Inactief",
};

export const customerStatusTone: Record<CustomerStatus, "success" | "neutral"> = {
  active: "success",
  inactive: "neutral",
};

/** Said when an admin save names a version the record has moved past -- often the customer's own portal edit. */
export const customerChangedReason =
  "Deze klant is intussen gewijzigd, mogelijk door de klant zelf in het klantportaal. Laad de pagina opnieuw; je wijziging is niet opgeslagen.";
