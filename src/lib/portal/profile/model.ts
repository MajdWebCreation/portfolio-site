import { isEmailAddress } from "@/lib/email/address";

/**
 * The customer details a member may change, and the rules they have to meet.
 *
 * The same rules run in the browser (to say what is wrong next to the
 * field), in the server action, and in portal_update_customer_profile (so a
 * call that goes around the form meets them too). The database is the last
 * word; these are there so the customer reads a sentence instead of a code.
 *
 * Plain text only, trimmed. Optional fields become null when left empty. A
 * phone number keeps its own layout -- spaces folded, digits and the usual
 * separators -- and is not rewritten into a format of ours. KvK and VAT ids
 * are not checked against a pattern: there is no business rule for one here,
 * and a foreign customer's numbers look different.
 */
export type ProfileFields = {
  companyName: string;
  contactName: string;
  email: string;
  billingEmail: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  kvkNumber: string;
  vatNumber: string;
};

export type ProfileField = keyof ProfileFields;

export const profileFieldOrder: readonly ProfileField[] = [
  "companyName",
  "kvkNumber",
  "vatNumber",
  "street",
  "postalCode",
  "city",
  "country",
  "contactName",
  "email",
  "phone",
  "billingEmail",
];

export const profileLimits: Record<ProfileField, number> = {
  companyName: 200,
  contactName: 120,
  email: 254,
  billingEmail: 254,
  phone: 40,
  street: 200,
  postalCode: 20,
  city: 120,
  country: 80,
  kvkNumber: 40,
  vatNumber: 40,
};

const required: readonly ProfileField[] = ["companyName", "contactName", "email", "street", "postalCode", "city"];

export const profileLabels: Record<ProfileField, string> = {
  companyName: "Bedrijfsnaam",
  contactName: "Contactpersoon",
  email: "E-mailadres",
  billingEmail: "Facturatie-e-mailadres",
  phone: "Telefoonnummer",
  street: "Straat en huisnummer",
  postalCode: "Postcode",
  city: "Plaats",
  country: "Land",
  kvkNumber: "KvK-nummer",
  vatNumber: "Btw-id",
};

/** The database's column for each field, as the RPC and the audit name them. */
export const profileColumns: Record<ProfileField, string> = {
  companyName: "company_name",
  contactName: "contact_name",
  email: "email",
  billingEmail: "billing_email",
  phone: "phone",
  street: "street",
  postalCode: "postal_code",
  city: "city",
  country: "country",
  kvkNumber: "kvk_number",
  vatNumber: "vat_number",
};

export function fieldOfColumn(column: string): ProfileField | undefined {
  return (Object.keys(profileColumns) as ProfileField[]).find((field) => profileColumns[field] === column);
}

/** Trimmed, phone spaces folded, country defaulted the way the admin defaults it. */
export function normalizeProfile(input: Partial<Record<ProfileField, unknown>>): ProfileFields {
  const text = (field: ProfileField) => {
    const value = input[field];
    return typeof value === "string" ? value.trim() : "";
  };
  return {
    companyName: text("companyName"),
    contactName: text("contactName"),
    email: text("email"),
    billingEmail: text("billingEmail"),
    phone: text("phone").replace(/\s+/g, " "),
    street: text("street"),
    postalCode: text("postalCode"),
    city: text("city"),
    country: text("country") || "Nederland",
    kvkNumber: text("kvkNumber"),
    vatNumber: text("vatNumber"),
  };
}

export type ProfileErrors = Partial<Record<ProfileField, string>>;

const markup = /[<>\u0000-\u001f\u007f]/;

export function validateProfile(fields: ProfileFields): ProfileErrors {
  const errors: ProfileErrors = {};
  for (const field of profileFieldOrder) {
    const value = fields[field];
    if (required.includes(field) && !value) errors[field] = `Vul ${profileLabels[field].toLowerCase()} in.`;
    else if (value.length > profileLimits[field]) errors[field] = `Gebruik hooguit ${profileLimits[field]} tekens.`;
    else if (markup.test(value)) errors[field] = "Gebruik gewone tekst, zonder < of >.";
  }
  if (!errors.email && !isEmailAddress(fields.email)) errors.email = "Dit is geen geldig e-mailadres.";
  if (!errors.billingEmail && fields.billingEmail && !isEmailAddress(fields.billingEmail)) errors.billingEmail = "Dit is geen geldig e-mailadres.";
  if (!errors.phone && fields.phone && !/^[0-9+()./ -]+$/.test(fields.phone)) errors.phone = "Gebruik cijfers, spaties en eventueel + ( ) - . /";
  return errors;
}
