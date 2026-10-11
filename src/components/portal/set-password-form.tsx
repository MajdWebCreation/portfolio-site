"use client";

import Link from "next/link";
import { useActionState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { TextField } from "@/components/admin/form-field";
import { setPasswordWithTokenAction, type FormState } from "@/lib/portal/auth-actions";
import { portalForgotPasswordPath, portalLoginPath, portalRoot } from "@/lib/portal/paths";
import { minimumPasswordLength } from "@/lib/portal/password";

const initialState: FormState = { error: null };

/**
 * The page a mailed link lands on. The token travels in hidden fields and is
 * only spent when the visitor submits a password: opening the link alone
 * signs nobody in.
 *
 * A link that no longer works is not a dead end: the same "wachtwoord
 * vergeten" flow issues a fresh one, for an invitation that expired as much
 * as for a forgotten password, so the screen offers exactly that.
 */
export default function SetPasswordForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const [state, formAction, pending] = useActionState(setPasswordWithTokenAction, initialState);

  if (state.kind === "invalid_link") {
    return (
      <div className="mt-8 space-y-4">
        <p role="alert" className="border-l-2 border-danger pl-4 text-[0.95rem] text-body">
          {state.error}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={portalForgotPasswordPath} className="inline-flex min-h-10 items-center rounded-sm bg-ink px-4 text-[0.92rem] font-medium text-paper hover:bg-accent">
            Nieuwe link aanvragen
          </Link>
          {state.signedIn ? (
            <Link href={portalRoot} className="link-static text-[0.92rem] text-ink">
              Naar het portaal
            </Link>
          ) : null}
        </div>
        <p className="text-[0.9rem] text-muted">
          Lukt het niet? Mail naar contact@ymcreations.com, dan sturen wij een nieuwe uitnodiging.{" "}
          <Link href={portalLoginPath} className="link-static text-ink">
            Al een wachtwoord? Log in.
          </Link>
        </p>
      </div>
    );
  }

  /*
    The Auth server refused the password after the link already opened a
    session. The link is spent; the retry rides on that session instead, so
    the visitor types a better password and is not sent off for a new link.
  */
  const retryOnSession = state.kind === "password_rejected";

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input type="hidden" name="token_hash" value={retryOnSession ? "" : tokenHash} />
      <input type="hidden" name="type" value={retryOnSession ? "session" : type} />
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
