import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilterSummary, NoMatches } from "@/components/admin/filter-bar";

describe("FilterSummary", () => {
  it("offers the way back only while a filter is set", () => {
    const plain = renderToStaticMarkup(
      <FilterSummary filtered={false} onReset={() => {}}>
        3 van 3 klanten
      </FilterSummary>,
    );
    const filtered = renderToStaticMarkup(
      <FilterSummary filtered onReset={() => {}}>
        1 van 3 klanten
      </FilterSummary>,
    );

    expect(plain).not.toContain("Filters wissen");
    expect(filtered).toContain("Filters wissen");
    expect(filtered).toContain('aria-live="polite"');
  });
});

describe("NoMatches", () => {
  it("renders the message as a plain line, not a button", () => {
    const html = renderToStaticMarkup(<NoMatches>Geen klanten die aan deze filters voldoen.</NoMatches>);
    expect(html).toContain("Geen klanten");
    expect(html).not.toContain("<button");
  });
});
