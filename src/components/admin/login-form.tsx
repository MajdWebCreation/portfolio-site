"use client";

import { useActionState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { TextField } from "@/components/admin/form-field";
import { signInAction, type SignInState } from "@/lib/admin/auth-actions";

const initialState: SignInState = { error: null };

/**
 * The form itself. The credentials are posted to a server action; the browser
 * never talks to Supabase Auth directly, so the session cookies are written
 * server-side.
 */
export default function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <TextField
        id="email"
        label="E-mailadres"
        type="email"
        autoComplete="username"
        autoFocus
        spellCheck={false}
        error={state.error ?? undefined}
      />
      <TextField id="password" label="Wachtwoord" type="password" autoComplete="current-password" />
      <AdminButton type="submit" disabled={pending} className="w-full">
        {pending ? "Bezig…" : "Inloggen"}
      </AdminButton>
    </form>
  );
}
