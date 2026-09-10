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
  phone?: string;
  address: CustomerAddress;
  kvkNumber?: string;
  vatNumber?: string;
  notes: string;
  status: CustomerStatus;
  /** ISO timestamp. */
  createdAt: string;
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
