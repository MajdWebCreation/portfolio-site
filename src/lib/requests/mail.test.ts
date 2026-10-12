import { describe, expect, it } from "vitest";
import { buildInternalRequestMail, buildRequestReceivedMail, buildRequestStatusMail } from "@/lib/requests/mail";

describe("the request mails", () => {
  it("confirm a request with its subject and a link to it, escaping what the customer typed", () => {
    const mail = buildRequestReceivedMail({ contactName: "Jan", requestId: "r-1", subject: "<b>Nieuwe</b> pagina", category: "content" });
    expect(mail.subject).toContain("<b>Nieuwe</b> pagina");
    expect(mail.html).not.toContain("<b>Nieuwe</b>");
    expect(mail.html).toContain("&lt;b&gt;Nieuwe&lt;/b&gt;");
    expect(mail.text).toContain("/portaal/verzoeken/r-1");
  });

  it("say where a request stands now", () => {
    const mail = buildRequestStatusMail({ contactName: "", requestId: "r-1", subject: "Logo", category: "issue", status: "awaiting_customer" });
    expect(mail.subject.startsWith("Wacht op uw reactie: Logo")).toBe(true);
    expect(mail.text).toContain("Beste klant,");
  });

  it("tell YM Creations, with the description escaped and the admin link", () => {
    const mail = buildInternalRequestMail({ requestId: "r-1", companyName: "Alfa", subject: "Fout", category: "issue", description: "<script>x</script>\nregel 2" });
    expect(mail.html).not.toContain("<script>");
    expect(mail.text).toContain("/admin/verzoeken/r-1");
  });
});
