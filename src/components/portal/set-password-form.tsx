"use client";

import { useActionState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { TextField } from "@/components/admin/form-field";
import { setPasswordWithTokenAction, type FormState } from "@/lib/portal/auth-actions";
import { minimumPasswordLength } from "@/lib/portal/password";

const initialState: FormState = { error: null };

/**
 * The page a mailed link lands on. The token travels in hidden fields and is
 * only spent when the visitor submits a password: opening the link alone
 * signs nobody in.
 */
export default function SetPasswordForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const [state, formAction, pending] = useActionState(setPasswordWithTokenAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <TextField
        id="password"
        label="Nieuw wachtwoord"
        type="password"
        autoComplete="new-password"
        autoFocus
        minLength={minimumPasswordLength}
        hint={`Minimaal ${minimumPasswordLength} tekens.`}
        error={state.error ?? undefined}
      />
      <TextField id="confirmation" label="Herhaal het wachtwoord" type="password" autoComplete="new-password" minLength={minimumPasswordLength} />
      <AdminButton type="submit" disabled={pending} className="w-full">
        {pending ? "Bezig…" : "Wachtwoord instellen"}
      </AdminButton>
    </form>
  );
}
