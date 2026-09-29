import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedAddOnRows, seedPackageRows, settingsRow } from "@/lib/pricing/test-fixtures";

const createClient = vi.fn();
vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: createClient }));

/* A query builder that resolves to fixed rows, whatever is chained on it. */
function table(data: unknown) {
  const result = { data, error: null };
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

beforeEach(() => {
  createClient.mockReset();
  createClient.mockReturnValue({
    from: (name: string) =>
      table(
        name === "pricing_packages"
          ? seedPackageRows
          : name === "pricing_addons"
            ? seedAddOnRows
            : settingsRow(false, 30),
      ),
  });
});

describe("getPricingCatalog", () => {
  it("reads through a client whose cache expires, so database changes reach the site", async () => {
    const { getPricingCatalog, pricingRevalidateSeconds } = await import("@/lib/pricing/source");

    const catalog = await getPricingCatalog();

    expect(createClient).toHaveBeenCalledWith({ revalidate: pricingRevalidateSeconds });
    /* Bounded: never Next's "forever" (a year), at most a day. */
    expect(pricingRevalidateSeconds).toBeGreaterThan(0);
    expect(pricingRevalidateSeconds).toBeLessThanOrEqual(86400);
    expect(catalog.packages.map((pkg) => pkg.monthlyManagementFrom)).toEqual([15, 29, 39, 35, 69]);
    expect(catalog.developmentDiscount).toBeNull();
  });
});
