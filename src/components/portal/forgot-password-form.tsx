"use client";

import Link from "next/link";
import { useActionState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { TextField } from "@/components/admin/form-field";
import { requestPasswordResetAction, type FormState } from "@/lib/portal/auth-actions";
import { portalLoginPath } from "@/lib/portal/paths";

const initialState: FormState = { error: null };

/** Asks for the address; the answer is the same whether or not it has an account. */
export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  if (state.done) {
    return (
      <div className="mt-8 space-y-4">
        <p role="status" className="text-[0.95rem] text-body">
          Als dit e-mailadres bij ons bekend is, staat er binnen enkele minuten een mail in uw inbox met een link om een
          nieuw wachtwoord in te stellen. De link werkt één keer.
        </p>
        <p className="text-[0.9rem]">
          <Link href={portalLoginPath} className="link-static text-ink">
            Terug naar inloggen
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <TextField id="email" label="E-mailadres" type="email" autoComplete="username" autoFocus spellCheck={false} error={state.error ?? undefined} />
      <AdminButton type="submit" disabled={pending} className="w-full">
        {pending ? "Bezig…" : "Stuur mij een link"}
      </AdminButton>
      <p className="text-[0.9rem]">
        <Link href={portalLoginPath} className="link-static text-ink">
          Terug naar inloggen
        </Link>
      </p>
    </form>
  );
}
