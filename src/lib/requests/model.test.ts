import { describe, expect, it } from "vitest";
import {
  attachmentMimeFor,
  attachmentProblem,
  bytesMatchMime,
  contentDisposition,
  displayFileName,
  normalizeRequest,
  validateRequest,
} from "@/lib/requests/model";

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(32).fill(0)]);
const ascii = (text: string, offset = 0) => {
  const out = new Uint8Array(32);
  [...text].forEach((char, index) => (out[offset + index] = char.charCodeAt(0)));
  return out;
};

describe("a request", () => {
  it("is trimmed, and needs a known category, a subject and a description", () => {
    expect(normalizeRequest({ category: " issue ", subject: "  Knop   werkt niet ", description: "  Op mobiel.  " })).toEqual({ category: "issue", subject: "Knop werkt niet", description: "Op mobiel." });
    expect(validateRequest(normalizeRequest({ category: "issue", subject: "x", description: "y" }))).toEqual({});
    expect(Object.keys(validateRequest(normalizeRequest({ category: "hack", subject: " ", description: "" }))).sort()).toEqual(["category", "description", "subject"]);
    expect(validateRequest(normalizeRequest({ category: "other", subject: "x".repeat(201), description: "y" })).subject).toBeTruthy();
  });
});

describe("an attachment", () => {
  it("is accepted as an image or a PDF whose extension agrees with its type", () => {
    expect(attachmentMimeFor({ name: "foto.JPG", type: "image/jpeg" })).toBe("image/jpeg");
    expect(attachmentMimeFor({ name: "scan.pdf", type: "application/pdf" })).toBe("application/pdf");
    expect(attachmentMimeFor({ name: "IMG_1.HEIC", type: "" })).toBe("image/heic");
    expect(attachmentMimeFor({ name: "foto.png", type: "image/jpeg" })).toBeUndefined();
    for (const file of [
      { name: "logo.svg", type: "image/svg+xml" },
      { name: "page.html", type: "text/html" },
      { name: "app.exe", type: "application/x-msdownload" },
      { name: "files.zip", type: "application/zip" },
      { name: "script.js", type: "" },
      { name: "foto.jpg.exe", type: "" },
    ]) {
      expect(attachmentMimeFor(file), file.name).toBeUndefined();
    }
  });

  it("is refused empty or over 15 MB", () => {
    expect(attachmentProblem({ name: "a.jpg", type: "image/jpeg", size: 0 })).toBe("empty");
    expect(attachmentProblem({ name: "a.jpg", type: "image/jpeg", size: 15 * 1024 * 1024 + 1 })).toBe("size");
    expect(attachmentProblem({ name: "a.jpg", type: "image/jpeg", size: 15 * 1024 * 1024 })).toBeUndefined();
  });

  it("has to start with the bytes of its type", () => {
    expect(bytesMatchMime(bytes(0xff, 0xd8, 0xff), "image/jpeg")).toBe(true);
    expect(bytesMatchMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png")).toBe(true);
    const webp = ascii("RIFF");
    webp.set(ascii("WEBP").slice(0, 4), 8);
    expect(bytesMatchMime(webp, "image/webp")).toBe(true);
    expect(bytesMatchMime(ascii("%PDF-1.7"), "application/pdf")).toBe(true);
    const heic = ascii("....ftypheic");
    expect(bytesMatchMime(heic, "image/heic")).toBe(true);
    expect(bytesMatchMime(ascii("<svg"), "image/png")).toBe(false);
    expect(bytesMatchMime(ascii("<html>"), "image/jpeg")).toBe(false);
    expect(bytesMatchMime(ascii("MZ"), "application/pdf")).toBe(false);
  });

  it("keeps its name for display only, made safe for a header", () => {
    expect(displayFileName("a/b\\c\u0000d.pdf")).toBe("a_b_c_d.pdf");
    expect(displayFileName("   ")).toBe("bijlage");
    const header = contentDisposition('evil";\r\nSet-Cookie: x=1.pdf', false);
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.startsWith('attachment; filename="')).toBe(true);
    expect(header.split('"').length).toBe(3);
  });
});
