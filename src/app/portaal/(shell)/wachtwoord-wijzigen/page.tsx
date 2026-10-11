import type { Metadata } from "next";
import Link from "next/link";
import ChangePasswordForm from "@/components/portal/change-password-form";
import { requirePortalMember } from "@/lib/portal/access";
import { portalAccountPath } from "@/lib/portal/paths";

export const metadata: Metadata = { title: "Wachtwoord wijzigen" };

export default async function ChangePasswordPage() {
  await requirePortalMember();

  return (
    <div>
      <p className="label-mono">Account</p>
      <h1 className="display-md mt-4">Wachtwoord wijzigen</h1>
      <ChangePasswordForm />
      <p className="mt-8 text-[0.9rem]">
        <Link href={portalAccountPath} className="link-static text-ink">
          Terug naar uw account
        </Link>
      </p>
    </div>
  );
}
