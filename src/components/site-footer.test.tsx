import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SiteFooter from "@/components/site-footer";
import { siteContent } from "@/lib/content/site-content";

/*
  The third way back to the portal, after the invitation and the welcome
  mail: the footer of every public page. The one address every mail names,
  /portaal; not signed in, it sends the visitor to its login page.
*/
describe("the public footer", () => {
  it.each([
    ["nl", "Klantportaal"],
    ["en", "Client portal"],
  ] as const)("links %s visitors to the customer portal at /portaal", (locale, label) => {
    const html = renderToStaticMarkup(<SiteFooter locale={locale} content={siteContent[locale]} currentPath={`/${locale}`} />);
    expect(html).toContain(`<a href="/portaal" class="text-paper/85 transition-colors hover:text-paper">${label}</a>`);
    expect(html).not.toContain("/portaal/inloggen");
  });
});
