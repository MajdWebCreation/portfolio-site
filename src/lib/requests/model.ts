/**
 * Customer requests: what a customer asks YM Creations for from the portal.
 *
 * One small domain, shared by the portal and the admin: the categories and
 * statuses (the database holds the same lists in its check constraints),
 * the rules a request and an attachment have to meet, and the words both
 * sides use. Pure, so the browser, the server and the tests read one copy.
 */

export type RequestCategory = "website_change" | "content" | "new_feature" | "issue" | "new_project" | "other";

export const requestCategories: readonly RequestCategory[] = ["website_change", "content", "new_feature", "issue", "new_project", "other"];

export const requestCategoryLabels: Record<RequestCategory, string> = {
  website_change: "Wijziging aan website of platform",
  content: "Nieuwe pagina of content",
  new_feature: "Nieuwe functionaliteit",
  issue: "Probleem melden",
  new_project: "Nieuw project",
  other: "Anders",
};

export function isRequestCategory(value: string): value is RequestCategory {
  return (requestCategories as readonly string[]).includes(value);
}

/**
 * Where a request stands. Only the admin moves it; any status may follow
 * any other -- there is no business rule that forbids reopening, so the
 * application invents none.
 */
export type RequestStatus = "submitted" | "in_review" | "awaiting_customer" | "in_progress" | "completed" | "declined";

export const requestStatuses: readonly RequestStatus[] = ["submitted", "in_review", "awaiting_customer", "in_progress", "completed", "declined"];

export function isRequestStatus(value: string): value is RequestStatus {
  return (requestStatuses as readonly string[]).includes(value);
}

/** The customer's words. */
export const requestStatusLabels: Record<RequestStatus, string> = {
  submitted: "Ingediend",
  in_review: "Wordt bekeken",
  awaiting_customer: "Wacht op uw reactie",
  in_progress: "In uitvoering",
  completed: "Afgerond",
  declined: "Afgewezen",
};

/** The admin's words. */
export const requestStatusAdminLabels: Record<RequestStatus, string> = {
  submitted: "Nieuw",
  in_review: "In beoordeling",
  awaiting_customer: "Wacht op klant",
  in_progress: "In uitvoering",
  completed: "Afgerond",
  declined: "Afgewezen",
};

export const requestStatusTone: Record<RequestStatus, "neutral" | "accent" | "success" | "danger"> = {
  submitted: "accent",
  in_review: "accent",
  awaiting_customer: "danger",
  in_progress: "accent",
  completed: "success",
  declined: "neutral",
};

/** Still being worked on; takes attachments. */
export function isOpenRequest(status: RequestStatus): boolean {
  return status !== "completed" && status !== "declined";
}

// ------------------------------------------------------------ the request

export const requestLimits = { subject: 200, description: 5000 } as const;

export type RequestInput = { category: string; subject: string; description: string };
export type RequestErrors = Partial<Record<keyof RequestInput, string>>;

export function normalizeRequest(input: Partial<Record<keyof RequestInput, unknown>>): RequestInput {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return { category: text(input.category), subject: text(input.subject).replace(/\s+/g, " "), description: text(input.description) };
}

export function validateRequest(input: RequestInput): RequestErrors {
  const errors: RequestErrors = {};
  if (!isRequestCategory(input.category)) errors.category = "Kies een categorie.";
  if (!input.subject) errors.subject = "Vul een onderwerp in.";
  else if (input.subject.length > requestLimits.subject) errors.subject = `Gebruik hooguit ${requestLimits.subject} tekens.`;
  if (!input.description) errors.description = "Beschrijf uw verzoek.";
  else if (input.description.length > requestLimits.description) errors.description = `Gebruik hooguit ${requestLimits.description} tekens.`;
  return errors;
}

// -------------------------------------------------------------- attachments

export const attachmentRules = {
  maxFiles: 10,
  maxBytes: 15 * 1024 * 1024,
} as const;

/** Reference material: photos, screenshots and PDFs. Nothing that renders as a page or runs. */
export const attachmentTypes = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "image/heif": ["heif"],
  "application/pdf": ["pdf"],
} as const satisfies Record<string, readonly string[]>;

export type AttachmentMime = keyof typeof attachmentTypes;

export const attachmentAccept = Object.entries(attachmentTypes)
  .flatMap(([mime, extensions]) => [mime, ...extensions.map((extension) => `.${extension}`)])
  .join(",");

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/**
 * The type a file is uploaded as. The browser's claim when it is one we
 * accept and agrees with the extension; for HEIC, which browsers often
 * report as nothing, the extension alone. Anything else: not accepted.
 * This is a gate for the upload, not the security check -- the server reads
 * the file's first bytes before it becomes an attachment.
 */
export function attachmentMimeFor(file: { name: string; type: string }): AttachmentMime | undefined {
  const extension = extensionOf(file.name);
  const claimed = file.type.toLowerCase();
  const byExtension = (Object.keys(attachmentTypes) as AttachmentMime[]).find((mime) => (attachmentTypes[mime] as readonly string[]).includes(extension));
  if (claimed && claimed in attachmentTypes) {
    return byExtension === claimed ? (claimed as AttachmentMime) : undefined;
  }
  if (!claimed && (byExtension === "image/heic" || byExtension === "image/heif")) return byExtension;
  return undefined;
}

export type AttachmentProblem = "type" | "size" | "empty";

export function attachmentProblem(file: { name: string; type: string; size: number }): AttachmentProblem | undefined {
  if (file.size <= 0) return "empty";
  if (file.size > attachmentRules.maxBytes) return "size";
  if (!attachmentMimeFor(file)) return "type";
  return undefined;
}

export const attachmentProblemLabels: Record<AttachmentProblem | "limit" | "failed" | "closed" | "content" | "uploads", string> = {
  type: "Dit bestandstype wordt niet ondersteund. Gebruik JPG, PNG, WebP, HEIC of PDF.",
  size: "Dit bestand is groter dan 15 MB.",
  empty: "Dit bestand is leeg.",
  limit: "Een verzoek heeft maximaal 10 bijlagen.",
  closed: "Bij een afgerond of afgewezen verzoek kunnen geen bijlagen meer worden toegevoegd.",
  content: "De inhoud van dit bestand past niet bij het bestandstype.",
  failed: "Uploaden lukte niet. Probeer het opnieuw.",
  uploads: "Er zijn vandaag te veel bestanden geüpload voor dit verzoek. Probeer het morgen opnieuw of mail ons.",
};

/**
 * Whether a file's first bytes are what its type says. JPEG, PNG, WebP and
 * PDF have fixed signatures; HEIC/HEIF is an ISO media file whose `ftyp`
 * box names a HEIF brand.
 */
export function bytesMatchMime(head: Uint8Array, mime: AttachmentMime): boolean {
  const at = (offset: number, ...values: number[]) => values.every((value, index) => head[offset + index] === value);
  const ascii = (offset: number, text: string) => at(offset, ...[...text].map((char) => char.charCodeAt(0)));
  switch (mime) {
    case "image/jpeg":
      return at(0, 0xff, 0xd8, 0xff);
    case "image/png":
      return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "application/pdf":
      return ascii(0, "%PDF-");
    case "image/heic":
    case "image/heif":
      return ascii(4, "ftyp") && ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].some((brand) => ascii(8, brand));
  }
}

/** "foto.jpg" stays; anything a header or a file system could trip over becomes an underscore. Never used for a path. */
export function displayFileName(name: string): string {
  const cleaned = name
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/[\u0000-\u001f\u007f/\\]+/g, "_")
    .trim();
  return (cleaned || "bijlage").slice(0, 200);
}

/** A Content-Disposition that carries any name safely: an ASCII fallback and the UTF-8 original. */
export function contentDisposition(fileName: string, inline: boolean): string {
  const name = displayFileName(fileName);
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\;]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
