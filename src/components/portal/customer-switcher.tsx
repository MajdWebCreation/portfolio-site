"use client";

import { useRef } from "react";
import { selectCustomerAction } from "@/lib/portal/auth-actions";
import type { PortalMembership } from "@/lib/portal/types";

/**
 * For a person who acts for more than one customer: which one this visit is
 * about. The choice is posted to a server action that checks it against the
 * memberships before remembering it; the select is only a convenience over
 * that form, and the form submits without JavaScript as well.
 */
export default function CustomerSwitcher({ memberships, currentId }: { memberships: PortalMembership[]; currentId: string }) {
  const form = useRef<HTMLFormElement>(null);

  return (
    <form ref={form} action={selectCustomerAction} className="flex items-center gap-2">
      <label htmlFor="portal-customer" className="label-mono text-muted">
        Bedrijf
      </label>
      <select
        id="portal-customer"
        name="customerId"
        defaultValue={currentId}
        onChange={() => form.current?.requestSubmit()}
        className="min-h-9 rounded-sm border border-line bg-surface px-2 text-[0.9rem] text-ink outline-none focus:border-ink"
      >
        {memberships.map((membership) => (
          <option key={membership.customerId} value={membership.customerId}>
            {membership.companyName}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="link-static text-[0.9rem] text-ink">
          Wissel
        </button>
      </noscript>
    </form>
  );
}
