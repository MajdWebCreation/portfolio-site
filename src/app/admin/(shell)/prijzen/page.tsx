import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import PricingEditor from "@/components/admin/pricing/pricing-editor";
import { requireAdminAccess } from "@/lib/admin/access";
import { getAdminPricing, getAdminPricingSettings } from "@/lib/admin/pricing/repository";

export const metadata: Metadata = { title: "Prijzen" };

export default async function PricingPage() {
  await requireAdminAccess();
  const [packages, settings] = await Promise.all([getAdminPricing(), getAdminPricingSettings()]);
  const addOnCount = packages.reduce((total, pkg) => total + pkg.addOns.length, 0);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Prijzen"
        text={`${packages.length} projecttypes en ${addOnCount} uitbreidingen, opgeslagen in de database.`}
      />
      <PricingEditor packages={packages} settings={settings} />
    </div>
  );
}
