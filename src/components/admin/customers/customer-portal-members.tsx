"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { TextField } from "@/components/admin/form-field";
import { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin/format";
import { invitePortalMember, revokePortalMember, type InviteResult } from "@/lib/admin/portal-members/actions";
import { portalMemberState, portalMemberStateLabels, type PortalMember } from "@/lib/admin/portal-members/types";

/**
 * Who may see this customer's portal, and inviting the next person.
 *
 * Compact on purpose: a list of addresses with their state, one field to
 * invite, and the way to end an access. No roles to pick -- every member is
 * a member -- and no member management by the customer themselves yet.
 */
const outcomeText: Record<InviteResult["outcome"], (email: string) => string> = {
  invited: (email) => `Uitnodiging verstuurd naar ${email}.`,
  reinvited: (email) => `Nieuwe link verstuurd naar ${email}.`,
  reactivated: (email) => `Toegang hersteld; ${email} is geïnformeerd.`,
  already_member: (email) => `${email} heeft al toegang; er is niets verstuurd.`,
};

const stateTone = { active: "success", invited: "accent", revoked: "neutral" } as const;

export default function CustomerPortalMembers({ customerId, members }: { customerId: string; members: PortalMember[] }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const invite = useSave();
  const revoke = useSave();
  const [revoking, setRevoking] = useState<string | null>(null);

  function send() {
    setMessage(null);
    invite.save(
      () => invitePortalMember(customerId, email),
      (result: InviteResult) => {
        setMessage(outcomeText[result.outcome](result.email));
        setEmail("");
      },
    );
  }

  return (
    <div className="border-t border-line pt-6">
      <h2 className="label-mono text-ink">Klantportaal</h2>

      {members.length === 0 ? (
        <p className="mt-3 text-[0.9rem] text-muted">Nog niemand uitgenodigd.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {members.map((member) => {
            const state = portalMemberState(member);
            return (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-0">
                  <p className="break-all text-[0.92rem] text-ink">{member.email}</p>
                  <p className="text-[0.8rem] text-muted">
                    {state === "revoked" && member.revokedAt
                      ? `Ingetrokken op ${formatDate(member.revokedAt)}`
                      : state === "active" && member.acceptedAt
                        ? `Actief sinds ${formatDate(member.acceptedAt)}`
                        : `Uitgenodigd op ${formatDate(member.invitedAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={stateTone[state]}>{portalMemberStateLabels[state]}</StatusBadge>
                  {state !== "revoked" ? (
                    revoking === member.id ? (
                      <span className="flex items-center gap-2 text-[0.85rem]">
                        <button
                          type="button"
                          disabled={revoke.pending}
                          onClick={() => revoke.save(() => revokePortalMember(customerId, member.id), () => setRevoking(null))}
                          className="link-static text-danger"
                        >
                          {revoke.pending ? "Bezig…" : "Ja, intrekken"}
                        </button>
                        <button type="button" onClick={() => setRevoking(null)} className="link-static text-ink">
                          Nee
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setRevoking(member.id)} className="link-static text-[0.85rem] text-ink">
                        Intrekken
                      </button>
                    )
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 space-y-3">
        <TextField
          id="portal-invite-email"
          label="Uitnodigen"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="naam@bedrijf.nl"
          hint="Deze persoon krijgt een mail om een wachtwoord in te stellen en ziet daarna het portaal van deze klant."
          error={invite.error ?? revoke.error ?? undefined}
        />
        <div className="flex flex-wrap items-center gap-3">
          <AdminButton variant="secondary" disabled={invite.pending || !email.trim()} onClick={send}>
            {invite.pending ? "Versturen…" : "Uitnodiging sturen"}
          </AdminButton>
          {message ? (
            <span role="status" className="text-[0.85rem] text-success">
              {message}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
