/**
 * The shapes the portal's screens and guards share. A plain module, so a
 * client component can name them without pulling the server-only guard --
 * and its `next/headers` -- into the browser bundle.
 */
export type PortalMembership = {
  customerId: string;
  companyName: string;
  role: string;
  /** ISO timestamp of the first use, or null until then. */
  acceptedAt: string | null;
};

export type PortalIdentity = {
  userId: string;
  email: string | null;
  memberships: PortalMembership[];
  /** The customer this request acts for: the remembered choice when valid, else the first. */
  current: PortalMembership;
};

export type PortalAccess =
  | { state: "anonymous" }
  | { state: "no_membership"; userId: string; email: string | null }
  | { state: "member"; member: PortalIdentity };
