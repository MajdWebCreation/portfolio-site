import { businessInfo } from "@/lib/content/site-content";

/**
 * YM Creations as it appears on documents. This is the only place these
 * values live: the quote and invoice PDFs read them from here, so an address
 * or bank detail is never repeated in a component.
 *
 * Identity and contact details come from `businessInfo`, the same source the
 * public site uses. The fields below it exist only on documents.
 *
 * `bic` stays null: the bank number is known, the BIC is not, and nothing on
 * a document may be invented. The invoice simply omits the line.
 */
export const companyProfile = {
  name: businessInfo.name,
  legalName: businessInfo.legalName,
  email: businessInfo.email,
  phone: businessInfo.phoneDisplay,
  website: businessInfo.websiteUrl.replace(/^https?:\/\//, ""),
  kvk: businessInfo.kvk,
  address: {
    street: "Patrijzenweg 1",
    postalCode: "1121 EX",
    city: "Landsmeer",
    country: "Nederland",
  },
  vatNumber: "NL005193483B19",
  iban: "NL70RABO0172714958",
  /** Tenaamstelling of the bank account; not necessarily the legal name. */
  accountHolder: "YM Creations",
  bic: null as null | string,
  /** From the general terms: payment within 14 calendar days of the invoice date. */
  paymentTermDays: 14,
} as const;

export type CompanyProfile = typeof companyProfile;
