import { describe, expect, it } from "vitest";
import { formatAddOnPrice, formatMonthly, formatStartingPrice } from "@/lib/pricing/format";

/* Intl separates the euro sign with a non-breaking space in nl-NL. */
const plain = (value: string) => value.replace(/ /g, " ");

describe("price notation", () => {
  it("shows a fixed starting price without 'vanaf'", () => {
    expect(plain(formatStartingPrice(695, "nl"))).toBe("€ 695");
    expect(plain(formatStartingPrice(1495, "nl"))).toBe("€ 1.495");
  });

  it("shows 'vanaf' only for scope-driven work, without a trailing plus", () => {
    expect(plain(formatStartingPrice(4995, "nl", true))).toBe("vanaf € 4.995");
    expect(formatStartingPrice(4995, "en", true)).toBe("from €4,995");
  });

  it("shows technical management as a plain monthly amount", () => {
    expect(plain(formatMonthly(15, "nl"))).toBe("€ 15 p/m");
    expect(formatMonthly(69, "en")).toBe("€69 per month");
  });

  it("keeps 'vanaf' on add-ons whose mode asks for it", () => {
    expect(plain(formatAddOnPrice(75, "plus", "nl"))).toBe("+ € 75");
    expect(plain(formatAddOnPrice(450, "plus-from", "nl"))).toBe("vanaf + € 450");
    expect(plain(formatAddOnPrice(8500, "from", "nl"))).toBe("vanaf € 8.500");
  });
});
