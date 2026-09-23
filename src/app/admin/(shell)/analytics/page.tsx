import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import AnalyticsDashboardView, { PeriodSwitch } from "@/components/admin/analytics/dashboard";
import { requireAdminAccess } from "@/lib/admin/access";
import { resolvePeriod } from "@/lib/admin/analytics/periods";
import { loadAnalyticsDashboard } from "@/lib/admin/analytics/repository";

export const metadata: Metadata = { title: "Analytics" };

type PageProps = { searchParams: Promise<{ period?: string | string[] }> };

/**
 * Bezoek, herkomst, interesse en aanvragen, uit de gesynchroniseerde
 * Google-cijfers en de eigen aanvragen. Reads the database only; no
 * provider is called while this renders.
 */
export default async function AnalyticsPage({ searchParams }: PageProps) {
  await requireAdminAccess();
  const period = resolvePeriod((await searchParams).period);
  const data = await loadAnalyticsDashboard(period);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Analytics"
        text="Wat de website deed en waar bezoekers en aanvragen vandaan kwamen, per periode."
        actions={<PeriodSwitch period={period} />}
      />
      <AnalyticsDashboardView data={data} />
    </div>
  );
}
