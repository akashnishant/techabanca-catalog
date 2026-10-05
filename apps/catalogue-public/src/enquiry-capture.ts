import { publicSubscriptionSql, ENQUIRY_CONSENT_VERSION, ENQUIRY_RETENTION_DAYS, enquiryClientHash, verifyEnquiryToken,
  type EnquiryClaims, type EnquiryInput } from "@techabanca/domain";
import type { Item, PublicBindings, Site } from "./model";

export class EnquiryCaptureError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export async function readEnquiryForm(request: Request): Promise<Record<string, string>> {
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get("content-type") ?? ""))
    throw new EnquiryCaptureError(415, "Send the enquiry using this form.");
  const max = 64 * 1024, declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max))
    throw new EnquiryCaptureError(413, "Your enquiry is too large. Please shorten it and try again.");
  const reader = request.body?.getReader();
  if (!reader) throw new EnquiryCaptureError(400, "Complete the enquiry form.");
  const bytes = new Uint8Array(max); let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      if (length + chunk.value.length > max) { await reader.cancel(); throw new EnquiryCaptureError(413, "Your enquiry is too large. Please shorten it and try again."); }
      bytes.set(chunk.value, length); length += chunk.value.length;
    }
  } finally { reader.releaseLock(); }
  const fields: Record<string, string> = Object.create(null);
  const allowed = new Set(["contactName", "companyName", "email", "phone", "message", "consent", "formToken", "companyWebsite"]);
  try {
    const body = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes.subarray(0, length));
    for (const field of body.split("&")) {
      const at = field.indexOf("="), name = decodeURIComponent((at < 0 ? field : field.slice(0, at)).replace(/\+/g, " "));
      const value = decodeURIComponent((at < 0 ? "" : field.slice(at + 1)).replace(/\+/g, " "));
      if (!allowed.has(name) || Object.hasOwn(fields, name)) throw new Error("Unexpected form field");
      fields[name] = value;
    }
  } catch { throw new EnquiryCaptureError(400, "The enquiry form could not be read. Reload the page and try again."); }
  return fields;
}
export function enquiryInput(fields: Record<string, string>): EnquiryInput {
  return { contactName: fields.contactName ?? "", companyName: fields.companyName ?? "",
    email: fields.email ?? "", phone: fields.phone ?? "", message: fields.message ?? "", consent: fields.consent === "yes" };
}
export async function validateFormToken(fields: Record<string, string>, env: PublicBindings, site: Site, now: number) {
  const claims = await verifyEnquiryToken(fields.formToken ?? "", env.PUBLICATION_PREVIEW_SECRET, now);
  if (!claims || claims.purpose !== "form" || claims.slug !== site.slug || claims.catalogueId !== site.catalogue_public_id
    || claims.publicationId !== site.publication_public_id) throw new EnquiryCaptureError(409, "This form has expired or the catalogue changed. Reload the page before sending.");
  return claims;
}
const targetSql = " FROM public_catalogue_routes r JOIN catalogue_publications p ON p.id = r.publication_id "
  + "JOIN published_catalogues pc ON pc.publication_id = p.id JOIN catalogues c ON c.public_id = pc.catalogue_public_id "
  + "JOIN organizations o ON o.id = c.organization_id WHERE r.slug = ? AND r.status = 'active' AND p.state = 'active' "
  + "AND p.public_id = ? AND pc.catalogue_public_id = r.catalogue_public_id AND pc.slug = r.slug "
  + "AND c.deleted_at IS NULL AND o.status = 'active' AND o.deleted_at IS NULL AND pc.show_contact = 1 "
  + "AND NOT EXISTS (SELECT 1 FROM reserved_slugs rs WHERE rs.slug = r.slug)";
export async function captureEnquiry(env: PublicBindings, site: Site, claims: EnquiryClaims, input: EnquiryInput,
  item: Item | null, clientAddress: string, date = new Date()): Promise<{ accepted: boolean; retryAfter?: number }> {
  const db = env.DB, now = date.toISOString(), targetPolicy = targetSql + " AND " + publicSubscriptionSql(env.DEPLOYMENT_ENVIRONMENT === "local");
  const target = await db.prepare("SELECT c.id AS catalogue_id, c.organization_id" + targetPolicy)
    .bind(site.slug, claims.publicationId).first<{ catalogue_id: number; organization_id: number }>();
  if (!target) throw new EnquiryCaptureError(404, "This catalogue is no longer accepting enquiries.");
  const window = Math.floor(date.getTime() / 600000), client = await enquiryClientHash(clientAddress, env.PUBLICATION_PREVIEW_SECRET!);
  const expiry = new Date((window + 1) * 600000).toISOString();
  const enquiryId = "enq_" + crypto.randomUUID().replace(/-/g, "");
  const retainedUntil = new Date(date.getTime() + ENQUIRY_RETENTION_DAYS * 86400000).toISOString();
  const rate = (hash: string, limit: number) => db.prepare(
    "INSERT INTO enquiry_rate_windows (catalogue_id, client_hash, window_start, attempts, expires_at) "
    + "SELECT ?, ?, ?, 1, ? WHERE NOT EXISTS (SELECT 1 FROM enquiries WHERE submission_nonce = ?) "
    + "ON CONFLICT(catalogue_id, client_hash, window_start) DO UPDATE SET attempts = MIN(attempts + 1, ?)",
  ).bind(target.catalogue_id, hash, window, expiry, claims.nonce, limit + 1);
  const result = await db.batch([
    rate(client, 5), rate("*", 100),
    db.prepare("INSERT INTO enquiries (public_id, organization_id, catalogue_id, source, contact_name, company_name, email, phone, message, "
      + "status, created_at, updated_at, publication_public_id, published_item_public_id, published_item_name, submission_nonce, consent_at, consent_version, expires_at) "
      + "SELECT ?, c.organization_id, c.id, 'contact', ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?"
      + targetPolicy
      + " AND EXISTS (SELECT 1 FROM enquiry_rate_windows w WHERE w.catalogue_id = c.id AND w.client_hash = ? AND w.window_start = ? AND w.attempts <= 5)"
      + " AND EXISTS (SELECT 1 FROM enquiry_rate_windows w WHERE w.catalogue_id = c.id AND w.client_hash = '*' AND w.window_start = ? AND w.attempts <= 100)"
      + " AND (? IS NULL OR EXISTS (SELECT 1 FROM published_items i WHERE i.publication_id = p.id AND i.item_public_id = ?))"
      + " ON CONFLICT(submission_nonce) WHERE submission_nonce IS NOT NULL DO NOTHING")
      .bind(enquiryId, input.contactName, input.companyName || null, input.email || null, input.phone || null, input.message,
        now, now, claims.publicationId, item?.item_public_id ?? null, item?.name ?? null, claims.nonce, now, ENQUIRY_CONSENT_VERSION, retainedUntil,
        site.slug, claims.publicationId, client, window, window, claims.itemId, claims.itemId),
    db.prepare("INSERT INTO enquiry_activity (enquiry_id, activity_type, created_at) "
      + "SELECT id, 'created', ? FROM enquiries WHERE public_id = ? AND changes() = 1").bind(now, enquiryId),
  ]);
  if (result[2].meta.changes > 0) return { accepted: true };
  const existing = await db.prepare("SELECT 1 AS accepted FROM enquiries WHERE submission_nonce = ? AND catalogue_id = ?")
    .bind(claims.nonce, target.catalogue_id).first();
  if (existing) return { accepted: true };
  const limited = await db.prepare("SELECT 1 FROM enquiry_rate_windows WHERE catalogue_id = ? AND window_start = ? "
    + "AND ((client_hash = ? AND attempts > 5) OR (client_hash = '*' AND attempts > 100)) LIMIT 1")
    .bind(target.catalogue_id, window, client).first();
  if (limited) return { accepted: false, retryAfter: Math.max(1, Math.ceil(((window + 1) * 600000 - date.getTime()) / 1000)) };
  throw new EnquiryCaptureError(409, "The catalogue changed while sending. Reload the page before sending.");
}
