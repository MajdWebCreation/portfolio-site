"use client";

import { useActionState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { TextField } from "@/components/admin/form-field";
import { changePasswordAction, type FormState } from "@/lib/portal/auth-actions";
import { minimumPasswordLength } from "@/lib/portal/password";

const initialState: FormState = { error: null };

/** The current password is asked again: a screen left open should not be enough to lock the owner out. */
export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="mt-6 max-w-sm space-y-5">
      <TextField id="current" label="Huidig wachtwoord" type="password" autoComplete="current-password" />
      <TextField
        id="password"
        label="Nieuw wachtwoord"
        type="password"
        autoComplete="new-password"
        minLength={minimumPasswordLength}
        hint={`Minimaal ${minimumPasswordLength} tekens.`}
        error={state.error ?? undefined}
      />
      <TextField id="confirmation" label="Herhaal het nieuwe wachtwoord" type="password" autoComplete="new-password" minLength={minimumPasswordLength} />
      <div className="flex flex-wrap items-center gap-3">
        <AdminButton type="submit" disabled={pending}>
          {pending ? "Bezig…" : "Wachtwoord wijzigen"}
        </AdminButton>
        {state.done ? (
          <span role="status" className="text-[0.9rem] text-success">
            Uw wachtwoord is gewijzigd.
          </span>
        ) : null}
      </div>
    </form>
  );
}
