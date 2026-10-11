import type { Metadata } from "next";
import ForgotPasswordForm from "@/components/portal/forgot-password-form";
import PortalFrame from "@/components/portal/portal-frame";

export const metadata: Metadata = { title: "Wachtwoord vergeten" };

export default function ForgotPasswordPage() {
  return (
    <PortalFrame title="Wachtwoord vergeten" intro="Vul uw e-mailadres in. U ontvangt een link waarmee u een nieuw wachtwoord instelt.">
      <ForgotPasswordForm />
    </PortalFrame>
  );
}
