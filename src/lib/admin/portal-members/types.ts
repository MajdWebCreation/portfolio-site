/**
 * A portal membership as the admin sees it. Kept apart from the repository so
 * a client component can name the shape and the labels without pulling the
 * server-only reader into its bundle.
 */
export type PortalMember = {
  id: string;
  userId: string;
  /** The address the invitation went to. */
  email: string;
  role: string;
  /** ISO timestamps. */
  invitedAt: string;
  acceptedAt?: string;
  revokedAt?: string;
};

export type PortalMemberState = "revoked" | "invited" | "active";

export function portalMemberState(member: Pick<PortalMember, "acceptedAt" | "revokedAt">): PortalMemberState {
  if (member.revokedAt) return "revoked";
  if (!member.acceptedAt) return "invited";
  return "active";
}

export const portalMemberStateLabels: Record<PortalMemberState, string> = {
  revoked: "Ingetrokken",
  invited: "Uitgenodigd",
  active: "Actief",
};
