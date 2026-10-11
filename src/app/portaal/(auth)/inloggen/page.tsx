import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalFrame from "@/components/portal/portal-frame";
import PortalLoginForm from "@/components/portal/login-form";
import { getPortalAccess } from "@/lib/portal/auth";
import { portalNoAccessPath, portalRoot } from "@/lib/portal/paths";

export const metadata: Metadata = { title: "Inloggen" };

/**
 * The portal's front door. There is no sign-up: an account exists because YM
 * Creations invited it, and the invitation mail is where a password is first
 * set. Someone already signed in is sent on to where their session belongs.
 */
export default async function PortalLoginPage() {
  const access = await getPortalAccess();
  if (access.state === "member") redirect(portalRoot);
  if (access.state === "no_membership") redirect(portalNoAccessPath);

  return (
    <PortalFrame title="Inloggen" intro="Voor klanten van YM Creations. Log in met het e-mailadres waarop u bent uitgenodigd.">
      <PortalLoginForm />
    </PortalFrame>
  );
}
