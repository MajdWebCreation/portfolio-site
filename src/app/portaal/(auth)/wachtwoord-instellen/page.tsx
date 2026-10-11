import type { Metadata } from "next";
import Link from "next/link";
import PortalFrame from "@/components/portal/portal-frame";
import SetPasswordForm from "@/components/portal/set-password-form";
import { portalForgotPasswordPath, portalLoginPath } from "@/lib/portal/paths";

/*
  `referrer: no-referrer`: the page's URL carries the token, and a link to any
  other page -- ours, with analytics -- would otherwise hand that URL along as
  the Referer.
*/
export const metadata: Metadata = { title: "Wachtwoord instellen", referrer: "no-referrer" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const tokenTypes = ["invite", "magiclink", "recovery"] as const;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * Where an invitation and a password reset land. The token stays in the page
 * until the visitor submits a password; nothing is verified on arrival, so
 * a link that was opened by a mail scanner spends nothing.
 */
export default async function SetPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tokenHash = single(params.token_hash).trim();
  const type = single(params.type);
  const valid = tokenHash.length > 0 && (tokenTypes as readonly string[]).includes(type);
  const recovery = type === "recovery";

  if (!valid) {
    return (
      <PortalFrame title="Link niet geldig">
        <p className="mt-6 text-[0.95rem] text-body">
          Deze link is niet compleet of niet meer geldig. Vraag een nieuwe aan via{" "}
          <Link href={portalForgotPasswordPath} className="link-static text-ink">
            wachtwoord vergeten
          </Link>{" "}
          of neem contact op met YM Creations.
        </p>
        <p className="mt-4 text-[0.9rem]">
          <Link href={portalLoginPath} className="link-static text-ink">
            Naar inloggen
          </Link>
        </p>
      </PortalFrame>
    );
  }

  return (
    <PortalFrame
      title={recovery ? "Nieuw wachtwoord" : "Welkom"}
      intro={
        recovery
          ? "Kies een nieuw wachtwoord voor uw account. Daarna bent u direct ingelogd."
          : "Stel een wachtwoord in voor uw account in het klantportaal van YM Creations. Daarna bent u direct ingelogd."
      }
    >
      <SetPasswordForm tokenHash={tokenHash} type={type} />
    </PortalFrame>
  );
}
