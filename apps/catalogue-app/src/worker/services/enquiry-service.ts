import { canTransitionEnquiryStatus, ENQUIRY_RETENTION_DAYS, hasPublicIdPrefix, isEnquiryStatus,
  type EnquiryActivity, type EnquiryDetail, type EnquiryList, type EnquiryStatus, type EnquirySummary, type TenantContext } from "@techabanca/domain";

export class EnquiryError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409, public readonly code: string, message: string) { super(message); }
}
type Row = EnquirySummary & Omit<EnquiryDetail, keyof EnquirySummary | "activity"> & { internalId: number };
const select = "SELECT e.id AS internalId, e.public_id AS id, e.contact_name AS contactName, e.company_name AS companyName, "
  + "e.email, e.phone, e.message, e.source, e.status, e.version, e.created_at AS createdAt, e.updated_at AS updatedAt, "
  + "e.expires_at AS expiresAt, e.contacted_at AS contactedAt, e.closed_at AS closedAt, e.consent_at AS consentAt, "
  + "e.consent_version AS consentVersion, e.publication_public_id AS publicationId, p.revision_number AS publicationRevision, "
  + "COALESCE(e.published_item_name, i.name) AS itemName FROM enquiries e "
  + "LEFT JOIN catalogue_items i ON i.id = e.item_id LEFT JOIN catalogue_publications p ON p.public_id = e.publication_public_id ";
const visible = "e.organization_id = ? AND e.deleted_at IS NULL AND e.expires_at > ?";
function summary(row: Row): EnquirySummary {
  return { id: row.id, contactName: row.contactName, companyName: row.companyName, email: row.email, phone: row.phone,
    status: row.status, source: row.source, version: row.version, itemName: row.itemName,
    createdAt: row.createdAt, updatedAt: row.updatedAt, expiresAt: row.expiresAt };
}
function encoded(value: unknown) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function cursor(value: string, status: string, q: string): { createdAt: string; id: string } {
  try {
    if (value.length > 2000 || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error();
    const c = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), x => x.charCodeAt(0))));
    if (Object.keys(c).sort().join(",") !== "createdAt,id,q,status" || c.q !== q || c.status !== status
      || typeof c.id !== "string" || !hasPublicIdPrefix(c.id, "enq") || typeof c.createdAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(c.createdAt) || !Number.isFinite(Date.parse(c.createdAt))) throw new Error();
    return c;
  } catch { throw new EnquiryError(400, "invalid_cursor", "Refresh the enquiry list and try again."); }
}
export class EnquiryService {
  constructor(private readonly db: D1Database) {}
  private async row(tenant: TenantContext, id: string, now: string) {
    if (!hasPublicIdPrefix(id, "enq")) throw new EnquiryError(404, "enquiry_not_found", "The enquiry could not be found.");
    const row = await this.db.prepare(select + "WHERE " + visible + " AND e.public_id = ? LIMIT 1")
      .bind(tenant.organizationId, now, id).first<Row>();
    if (!row) throw new EnquiryError(404, "enquiry_not_found", "The enquiry could not be found.");
    return row;
  }
  async list(tenant: TenantContext, query: URLSearchParams, date = new Date()): Promise<EnquiryList> {
    const allowed = new Set(["q", "status", "after", "limit"]);
    for (const name of query.keys()) if (!allowed.has(name) || query.getAll(name).length !== 1)
      throw new EnquiryError(400, "invalid_filters", "Check the enquiry filters.");
    const q = (query.get("q") ?? "").trim(), status = query.get("status") ?? "all";
    const rawLimit = query.get("limit") ?? "25", limit = Number(rawLimit);
    if (q.length > 200 || (status !== "all" && !isEnquiryStatus(status)) || !/^\d+$/.test(rawLimit)
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      throw new EnquiryError(400, "invalid_filters", "Check the enquiry filters.");
    const conditions = [visible], args: Array<string | number> = [tenant.organizationId, date.toISOString()];
    if (status !== "all") { conditions.push("e.status = ?"); args.push(status); }
    if (q) {
      conditions.push("(instr(lower(e.contact_name), lower(?)) > 0 OR instr(lower(COALESCE(e.company_name, '')), lower(?)) > 0 "
        + "OR instr(lower(COALESCE(e.email, '')), lower(?)) > 0 OR instr(COALESCE(e.phone, ''), ?) > 0 "
        + "OR instr(lower(e.message), lower(?)) > 0 OR instr(lower(COALESCE(e.published_item_name, i.name, '')), lower(?)) > 0)");
      args.push(q, q, q, q, q, q);
    }
    if (query.get("after")) {
      const c = cursor(query.get("after")!, status, q);
      conditions.push("(e.created_at < ? OR (e.created_at = ? AND e.public_id < ?))"); args.push(c.createdAt, c.createdAt, c.id);
    }
    const result = await this.db.batch([
      this.db.prepare(select + "WHERE " + conditions.join(" AND ") + " ORDER BY e.created_at DESC, e.public_id DESC LIMIT ?").bind(...args, limit + 1),
      this.db.prepare("SELECT status, COUNT(*) AS count FROM enquiries e WHERE " + visible + " GROUP BY status").bind(tenant.organizationId, date.toISOString()),
    ]);
    const rows = result[0].results as Row[], more = rows.length > limit; if (more) rows.pop();
    const counts: Record<EnquiryStatus, number> = { new: 0, contacted: 0, closed: 0 };
    for (const row of result[1].results as Array<{ status: EnquiryStatus; count: number }>) counts[row.status] = row.count;
    const last = rows.at(-1);
    return { enquiries: rows.map(summary), counts, retentionDays: ENQUIRY_RETENTION_DAYS,
      nextCursor: more && last ? encoded({ createdAt: last.createdAt, id: last.id, q, status }) : null };
  }
  async detail(tenant: TenantContext, id: string, date = new Date()): Promise<EnquiryDetail> {
    const row = await this.row(tenant, id, date.toISOString());
    const activity = (await this.db.prepare("SELECT a.activity_type AS type, a.from_status AS fromStatus, a.to_status AS toStatus, "
      + "a.note, u.display_name AS actor, a.created_at AS createdAt FROM enquiry_activity a LEFT JOIN users u ON u.id = a.actor_user_id "
      + "WHERE a.enquiry_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 100").bind(row.internalId).all<EnquiryActivity>()).results;
    return { ...summary(row), message: row.message, contactedAt: row.contactedAt, closedAt: row.closedAt,
      publicationId: row.publicationId, publicationRevision: row.publicationRevision, consentAt: row.consentAt, consentVersion: row.consentVersion, activity };
  }
  private manage(role: string) {
    if (role !== "owner" && role !== "admin") throw new EnquiryError(403, "enquiry_read_only", "Only owners and admins can manage enquiries.");
  }
  private version(value: unknown, expected: number) {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new EnquiryError(400, "invalid_version", "Refresh the enquiry before changing it.");
    if (value !== expected) throw new EnquiryError(409, "enquiry_version_conflict", "This enquiry changed. Refresh it before trying again.");
  }
  async status(tenant: TenantContext, actor: { role: string; userId: number }, id: string, version: number, status: string, date = new Date()) {
    this.manage(actor.role);
    const now = date.toISOString(), row = await this.row(tenant, id, now); this.version(version, row.version);
    if (!isEnquiryStatus(status)) throw new EnquiryError(400, "invalid_status", "Choose New, Contacted or Closed.");
    if (!canTransitionEnquiryStatus(row.status, status)) throw new EnquiryError(409, "invalid_status_transition", "Closed enquiries cannot reopen, and Contacted enquiries cannot return to New.");
    if (row.status === status) return this.detail(tenant, id, date);
    const results = await this.db.batch([
      this.db.prepare("UPDATE enquiries SET status = ?, version = version + 1, updated_at = ?, "
        + "contacted_at = CASE WHEN ? = 'contacted' THEN ? ELSE contacted_at END, closed_at = CASE WHEN ? = 'closed' THEN ? ELSE closed_at END "
        + "WHERE public_id = ? AND organization_id = ? AND version = ? AND deleted_at IS NULL AND expires_at > ?")
        .bind(status, now, status, now, status, now, id, tenant.organizationId, version, now),
      this.db.prepare("INSERT INTO enquiry_activity (enquiry_id, actor_user_id, activity_type, from_status, to_status, created_at) "
        + "SELECT id, ?, 'status_changed', ?, ?, ? FROM enquiries WHERE public_id = ? AND changes() = 1").bind(actor.userId, row.status, status, now, id),
    ]);
    if (!results[0].meta.changes) throw new EnquiryError(409, "enquiry_version_conflict", "This enquiry changed. Refresh it before trying again.");
    return this.detail(tenant, id, date);
  }
  async note(tenant: TenantContext, actor: { role: string; userId: number }, id: string, version: number, note: string, date = new Date()) {
    this.manage(actor.role);
    if (typeof note !== "string" || !note.trim() || note.trim().length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note))
      throw new EnquiryError(400, "invalid_note", "Enter a note using up to 2,000 characters.");
    const now = date.toISOString(), row = await this.row(tenant, id, now); this.version(version, row.version);
    const results = await this.db.batch([
      this.db.prepare("UPDATE enquiries SET version = version + 1, updated_at = ? WHERE public_id = ? AND organization_id = ? "
        + "AND version = ? AND deleted_at IS NULL AND expires_at > ? AND (SELECT COUNT(*) FROM enquiry_activity WHERE enquiry_id = enquiries.id AND activity_type = 'note') < 200")
        .bind(now, id, tenant.organizationId, version, now),
      this.db.prepare("INSERT INTO enquiry_activity (enquiry_id, actor_user_id, activity_type, note, created_at) "
        + "SELECT id, ?, 'note', ?, ? FROM enquiries WHERE public_id = ? AND changes() = 1").bind(actor.userId, note.trim(), now, id),
    ]);
    if (!results[0].meta.changes) throw new EnquiryError(409, "enquiry_version_conflict", "This enquiry changed or reached its note limit. Refresh it before trying again.");
    return this.detail(tenant, id, date);
  }
  async remove(tenant: TenantContext, role: string, id: string, version: number, date = new Date()) {
    this.manage(role); const now = date.toISOString(), row = await this.row(tenant, id, now); this.version(version, row.version);
    const result = await this.db.prepare("DELETE FROM enquiries WHERE public_id = ? AND organization_id = ? AND version = ? AND deleted_at IS NULL AND expires_at > ?")
      .bind(id, tenant.organizationId, version, now).run();
    if (!result.meta.changes) throw new EnquiryError(409, "enquiry_version_conflict", "This enquiry changed. Refresh it before trying again.");
  }
}
export async function purgeExpiredEnquiries(db: D1Database, date = new Date()) {
  let batches = 0;
  for (; batches < 20; batches++) {
    const result = await db.prepare("DELETE FROM enquiries WHERE id IN (SELECT id FROM enquiries WHERE expires_at <= ? OR deleted_at IS NOT NULL ORDER BY id LIMIT 500)")
      .bind(date.toISOString()).run();
    if (!result.meta.changes) break;
  }
  await db.prepare("DELETE FROM enquiry_rate_windows WHERE (catalogue_id, client_hash, window_start) IN "
    + "(SELECT catalogue_id, client_hash, window_start FROM enquiry_rate_windows WHERE expires_at <= ? LIMIT 10000)").bind(date.toISOString()).run();
  const backlog = await db.prepare("SELECT 1 FROM enquiries WHERE expires_at <= ? OR deleted_at IS NOT NULL LIMIT 1").bind(date.toISOString()).first();
  const rateBacklog = await db.prepare("SELECT 1 FROM enquiry_rate_windows WHERE expires_at <= ? LIMIT 1").bind(date.toISOString()).first();
  return { batches, hasMore: !!backlog || !!rateBacklog };
}
