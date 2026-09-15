import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AdminLoading from "./loading";

/**
 * The boundary is what a click shows first, so it must be announceable,
 * inert for assistive technology below that, and free of anything that could
 * itself wait on data.
 */
describe("AdminLoading", () => {
  it("renders a status region with a hidden label and inert placeholders", () => {
    const html = renderToStaticMarkup(<AdminLoading />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Pagina laden");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<(a|button|input|form)\b/);
  });
});
