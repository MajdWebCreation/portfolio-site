"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/payments/rate-limit";
import { getPortalAccess } from "@/lib/portal/auth";
import { portalDetailsPath, portalLoginPath, portalNoAccessPath } from "@/lib/portal/paths";
import {
  fieldOfColumn,
  normalizeProfile,
  profileFieldOrder,
  validateProfile,
  type ProfileErrors,
  type ProfileFields,
} from "@/lib/portal/profile/model";
import { readPortalProfile } from "@/lib/portal/profile/read";
import { PortalDenied, portalReader } from "@/lib/portal/rpc";

/**
 * "Wijzigingen opslaan" on /portaal/gegevens.
 *
 * The customer is the one this session acts for, never one the form names;
 * the form's customer id is only compared, so a page left open from before
 * a switch of company cannot save into the other one. The version the page
 * read goes with the save, and the database refuses it when the record
 * changed since (another tab, a colleague, YM Creations). The write itself
 * is portal_update_customer_profile: its parameters are the fields a
 * customer may change, and nothing else can be named.
 *
 * Nothing here touches the sign-in address: that lives in Supabase Auth and
 * is not a customer detail.
 */
export type ProfileFormState =
  | { status: "idle" }
  | { status: "saved" | "unchanged"; fields: ProfileFields; version: string }
  | { status: "invalid"; errors: ProfileErrors }
  | { status: "conflict" | "stale_customer" | "error"; message: string };

const messages = {
  conflict: "Uw gegevens zijn intussen gewijzigd, in een ander venster of door een collega. Laad de pagina opnieuw om de actuele gegevens te zien; uw invoer is niet opgeslagen.",
  staleCustomer: "U werkt inmiddels voor een ander bedrijf in het portaal. Laad de pagina opnieuw voordat u gegevens wijzigt.",
  denied: "U heeft geen toegang (meer) tot de gegevens van dit bedrijf.",
  busy: "U heeft net een paar keer opgeslagen. Wacht een minuut en probeer het dan opnieuw.",
  failed: "Opslaan lukte nu niet. Probeer het over een minuut opnieuw.",
  plainText: "Gebruik in de velden gewone tekst, zonder < of > en zonder speciale tekens.",
};

export async function saveProfileAction(_previous: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const access = await getPortalAccess();
  if (access.state === "anonymous") redirect(portalLoginPath);
  if (access.state === "no_membership") redirect(portalNoAccessPath);

  const customerId = access.member.current.customerId;
  if (String(formData.get("customerId") ?? "") !== customerId) return { status: "stale_customer", message: messages.staleCustomer };

  const fields = normalizeProfile(Object.fromEntries(profileFieldOrder.map((field) => [field, formData.get(field)])));
  const errors = validateProfile(fields);
  if (Object.keys(errors).length > 0) return { status: "invalid", errors };

  if (!rateLimit(`portal-profile:${access.member.userId}`, 20, 60).allowed) return { status: "error", message: messages.busy };

  const db = await portalReader();
  const { data, error } = await db.rpc("portal_update_customer_profile", {
    p_customer_id: customerId,
    p_expected_updated_at: String(formData.get("version") ?? ""),
    p_company_name: fields.companyName,
    p_contact_name: fields.contactName,
    p_email: fields.email,
    p_billing_email: fields.billingEmail,
    p_phone: fields.phone,
    p_street: fields.street,
    p_postal_code: fields.postalCode,
    p_city: fields.city,
    p_country: fields.country,
    p_kvk_number: fields.kvkNumber,
    p_vat_number: fields.vatNumber,
  });

  if (error) {
    if (error.code === "42501") return { status: "error", message: messages.denied };
    if (error.code === "22023") {
      const column = error.message.startsWith("invalid:") ? error.message.slice("invalid:".length) : "";
      const field = fieldOfColumn(column);
      if (field) return { status: "invalid", errors: { [field]: "Deze waarde kan niet worden opgeslagen." } };
      return { status: "error", message: messages.plainText };
    }
    /* A malformed version is the same story as a stale one: the page is older than the record. */
    if (error.code === "22007" || error.code === "22008") return { status: "conflict", message: messages.conflict };
    console.error("Portal profile save failed", { code: error.code });
    return { status: "error", message: messages.failed };
  }

  const outcome = data?.[0]?.outcome;
  if (outcome === "conflict") return { status: "conflict", message: messages.conflict };
  if (outcome !== "updated" && outcome !== "unchanged") return { status: "error", message: messages.failed };

  revalidatePath(portalDetailsPath);
  /* What is stored now, read back the way the page reads it. Access can end in between; the save itself stands. */
  try {
    const fresh = await readPortalProfile(customerId);
    return { status: outcome === "updated" ? "saved" : "unchanged", fields: fresh.fields, version: fresh.version };
  } catch (error) {
    if (error instanceof PortalDenied) return { status: "error", message: messages.denied };
    throw error;
  }
}
