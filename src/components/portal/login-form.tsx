"use client";

import Link from "next/link";
import { useActionState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { TextField } from "@/components/admin/form-field";
import { portalSignInAction, type FormState } from "@/lib/portal/auth-actions";
import { portalForgotPasswordPath } from "@/lib/portal/paths";

const initialState: FormState = { error: null };

/**
 * E-mail and password, posted to a server action; the browser never talks to
 * the Auth server itself. One error message for every failure, so the form
 * says nothing about which addresses exist.
 */
export default function PortalLoginForm() {
  const [state, formAction, pending] = useActionState(portalSignInAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <TextField id="email" label="E-mailadres" type="email" autoComplete="username" autoFocus spellCheck={false} error={state.error ?? undefined} />
      <TextField id="password" label="Wachtwoord" type="password" autoComplete="current-password" />
      <AdminButton type="submit" disabled={pending} className="w-full">
        {pending ? "Bezig…" : "Inloggen"}
      </AdminButton>
      <p className="text-[0.9rem]">
        <Link href={portalForgotPasswordPath} className="link-static text-ink">
          Wachtwoord vergeten?
        </Link>
      </p>
    </form>
  );
}
