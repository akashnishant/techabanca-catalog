import { createPublicId, getAssetUploadPolicy, isValidAssetUploadSize, isValidCatalogueSlug, PREVIEW_TTL_SECONDS, signPreview, type TenantContext } from "@techabanca/domain";
import { EntitlementService } from "./entitlement-service";
import { PublicationRepository, type PublicationRecord, type PublicationSource } from "../repositories/publication-repository";

export class PublicationError extends Error {
 constructor(readonly status: 400 | 403 | 404 | 409 | 413 | 503, readonly code: string, message: string) { super(message); }
}
export type PublicationConfig = { PUBLICATION_PREVIEW_SECRET?: string; ALLOW_UNSUBSCRIBED_PUBLISHING?: string; LOCAL_PREVIEW?: string };
export type PublicationActor = { userId: number; role: string };
function summary(p: PublicationRecord) {
 return { id: p.public_id, revision: p.revision_number, state: p.state, sourceRevision: p.source_authoring_revision,
  createdAt: p.created_at, activatedAt: p.activated_at, expiresAt: p.preview_expires_at, sealed: !!p.sealed_at };
}
function origin(slug: string, config: PublicationConfig, requestUrl: string): string {
 if (config.LOCAL_PREVIEW === "true" && ["localhost", "127.0.0.1"].includes(new URL(requestUrl).hostname)) return "http://" + slug + ".localhost:5174";
 const staging = new URL(requestUrl).hostname === "catalogue-preview.techabanca.com";
 return "https://" + slug + (staging ? ".catalogue-preview.techabanca.com" : ".techabanca.com");
}
function enabledContact(source: PublicationSource): boolean {
 const h = source.header;
 const phone = (value: string | null) => !!value && /^\+?[0-9 () .-]+$/.test(value.trim()) && /^\+?[0-9]{7,15}$/.test(value.replace(/[ () .-]/g, ""));
 return h.show_contact === 1 && ((h.show_phone === 1 && phone(h.contact_phone)) || (h.show_whatsapp === 1 && phone(h.whatsapp_number))
  || (h.show_email === 1 && !!h.contact_email && /^[^\s@<>?&#]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(h.contact_email)));
}
export class PublicationService {
 private readonly repository: PublicationRepository;
 private readonly entitlements: EntitlementService;
 constructor(private readonly db: D1Database, private readonly bucket: R2Bucket, private readonly config: PublicationConfig) {
  this.repository = new PublicationRepository(db); this.entitlements = new EntitlementService(db);
 }
 private async source(tenant: TenantContext) {
  const source = await this.repository.source(tenant);
  if (!source) throw new PublicationError(404, "catalogue_not_found", "No active catalogue was found.");
  return source;
 }
 private issues(source: PublicationSource): string[] {
  const h = source.header, issues: string[] = [];
  if (h.status === "suspended" || h.route_status === "suspended") issues.push("Publishing is paused for this catalogue.");
  if (h.business_type_active !== 1) issues.push("Choose an available business type in setup.");
  if (!h.business_name?.trim()) issues.push("Complete your business name before publishing.");
  if (!isValidCatalogueSlug(h.slug) || /^(draft|deleted)-/.test(h.slug) || h.slug === "catalogue-preview") issues.push("Choose an available public address in setup.");
  if (!h.theme_code || h.theme_active !== 1) issues.push("Choose an available website theme.");
  if (!source.counts.eligible) issues.push("Mark at least one visible item as Published source.");
  if (source.counts.eligible > 1000) issues.push("A publication supports up to 1,000 selected items.");
  if (source.assets.length > 100) issues.push("A publication supports up to 100 distinct files.");
  for (const item of source.invalidPrimary) issues.push(item.name + ": choose one primary image.");
  for (const item of source.missingRequired) issues.push(item.name + ": complete the required " + item.label + " field.");
  for (const asset of source.assets) {
   const policy = getAssetUploadPolicy(asset.mime_type ?? "");
   if (!asset.id || asset.organization_id !== h.organization_id || asset.status !== "ready" || asset.deleted_at || !asset.verified_at
    || !asset.checksum_sha256 || !asset.etag || !policy || policy.assetKind !== asset.expected_kind
    || !isValidAssetUploadSize(policy.assetKind, asset.byte_size)) issues.push("An attached file must be uploaded and verified again.");
  }
  if (!/^[a-f0-9]{64}$/i.test(this.config.PUBLICATION_PREVIEW_SECRET ?? "")) issues.push("Preview signing is not configured.");
  return [...new Set(issues)];
 }
 private async permitted(tenant: TenantContext, actor: PublicationActor, now: string) {
  if (!["owner", "admin"].includes(actor.role)) throw new PublicationError(403, "insufficient_permissions", "Owner or admin access is required.");
  if (!await this.entitlements.canPublish(tenant, this.config.ALLOW_UNSUBSCRIBED_PUBLISHING === "true", now)) {
   throw new PublicationError(403, "publishing_not_enabled", "Publishing is not enabled for this organization.");
  }
 }
 private async verifyFiles(source: PublicationSource) {
  for (const asset of source.assets) {
   const object = await this.bucket.get(asset.object_key);
   if (!object || object.size !== asset.byte_size || object.etag !== asset.etag || object.httpMetadata?.contentType !== asset.mime_type) {
    throw new PublicationError(409, "publication_media_changed", "An attached file is unavailable or changed. Re-upload it and prepare a new preview.");
   }
   const body = await object.arrayBuffer();
   const digest = await crypto.subtle.digest("SHA-256", body);
   const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
   if (checksum !== asset.checksum_sha256) throw new PublicationError(409, "publication_media_changed", "An attached file changed. Re-upload it and prepare a new preview.");
  }
 }
 async status(tenant: TenantContext, actor: PublicationActor, requestUrl: string) {
  const source = await this.source(tenant);
  const [history, active, entitled] = await Promise.all([
   this.repository.history(tenant), this.repository.active(tenant),
   this.entitlements.canPublish(tenant, this.config.ALLOW_UNSUBSCRIBED_PUBLISHING === "true", new Date().toISOString()),
  ]);
  const issues = this.issues(source);
  return { catalogueId: source.header.catalogue_public_id, name: source.header.name, slug: source.header.slug,
   sourceRevision: source.header.authoring_revision, counts: source.counts, issues,
   warnings: enabledContact(source) ? [] : ["No direct contact channel is enabled for visitors."],
   ready: issues.length === 0, canPublish: ["owner", "admin"].includes(actor.role) && entitled && issues.length === 0,
   entitled, active: active ? summary(active) : null, history: history.map(summary),
   hasChanges: !active || active.source_authoring_revision !== source.header.authoring_revision,
   publicUrl: origin(source.header.slug, this.config, requestUrl), routeStatus: source.header.route_status };
 }
 async prepare(tenant: TenantContext, actor: PublicationActor, revision: number, requestUrl: string, now = new Date()) {
  const timestamp = now.toISOString();
  await this.permitted(tenant, actor, timestamp);
  const source = await this.source(tenant);
  if (source.header.authoring_revision !== revision) throw new PublicationError(409, "publication_source_changed", "Your catalogue changed. Refresh and prepare a new preview.");
  const issues = this.issues(source);
  if (issues.length) throw new PublicationError(409, "publication_not_ready", issues[0]);
  await this.verifyFiles(source);
  const expiresAt = Math.floor(now.getTime() / 1000) + PREVIEW_TTL_SECONDS;
  const id = createPublicId("pub");
  // Signing is checked before storage; a configuration failure cannot leave a candidate behind.
  const token = await signPreview({ v: 1, publicationId: id, slug: source.header.slug, expiresAt }, this.config.PUBLICATION_PREVIEW_SECRET!, Math.floor(now.getTime() / 1000));
  const record = await this.repository.build(tenant, source, actor.userId, id, timestamp, new Date(expiresAt * 1000).toISOString(), this.config.ALLOW_UNSUBSCRIBED_PUBLISHING === "true");
  return { publication: summary(record), sourceRevision: revision, expiresAt: record.preview_expires_at!,
   previewUrl: origin(source.header.slug, this.config, requestUrl) + "/preview/" + token + "/" };
 }
 async activate(tenant: TenantContext, actor: PublicationActor, id: string, revision: number, requestUrl: string, now = new Date()) {
  const timestamp = now.toISOString();
  await this.permitted(tenant, actor, timestamp);
  const record = await this.repository.find(tenant, id);
  if (!record) throw new PublicationError(404, "publication_not_found", "This publication was not found.");
  const source = await this.source(tenant);
  const active = await this.repository.active(tenant);
  if (record.state === "active" && active?.id === record.id && source.header.route_status === "active") {
   return { publication: summary(record), publicUrl: origin(source.header.slug, this.config, requestUrl) };
  }
  if (record.state !== "building" || !record.sealed_at || record.preview_revoked_at || !record.preview_expires_at || record.preview_expires_at <= timestamp) {
   throw new PublicationError(409, "publication_preview_expired", "This preview is expired or no longer available. Prepare a new preview.");
  }
  if (record.source_authoring_revision !== revision || source.header.authoring_revision !== revision) {
   throw new PublicationError(409, "publication_source_changed", "Your catalogue changed after preview. Prepare and review a new preview.");
  }
  if (this.issues(source).length) throw new PublicationError(409, "publication_not_ready", this.issues(source)[0]);
  await this.verifyFiles(source);
  if (!await this.repository.activate(tenant, record, actor.userId, revision, timestamp, this.config.ALLOW_UNSUBSCRIBED_PUBLISHING === "true")) {
   const current = await this.repository.active(tenant);
   if (current?.id === record.id) return { publication: summary(current), publicUrl: origin(source.header.slug, this.config, requestUrl) };
   throw new PublicationError(409, "publication_source_changed", "The catalogue, permissions or live revision changed. Refresh before publishing.");
  }
  const current = await this.repository.find(tenant, id);
  return { publication: summary(current!), publicUrl: origin(source.header.slug, this.config, requestUrl) };
 }
 async discard(tenant: TenantContext, actor: PublicationActor, id: string) {
  if (!["owner", "admin"].includes(actor.role)) throw new PublicationError(403, "insufficient_permissions", "Owner or admin access is required.");
  const record = await this.repository.find(tenant, id);
  if (!record) throw new PublicationError(404, "publication_not_found", "This publication was not found.");
  if (record.state === "failed") return;
  if (record.state !== "building" || !await this.repository.discard(tenant, record, actor.userId, new Date().toISOString())) {
   throw new PublicationError(409, "publication_state_changed", "This preview can no longer be discarded.");
  }
 }
 async unpublish(tenant: TenantContext, actor: PublicationActor, revision: number, id: string) {
  if (!["owner", "admin"].includes(actor.role)) throw new PublicationError(403, "insufficient_permissions", "Owner or admin access is required.");
  const source = await this.source(tenant);
  const active = await this.repository.active(tenant);
  if (!active || active.public_id !== id || source.header.authoring_revision !== revision
   || !await this.repository.unpublish(tenant, active, actor.userId, revision, new Date().toISOString())) {
   throw new PublicationError(409, "publication_state_changed", "The catalogue or live revision changed. Refresh before taking it offline.");
  }
 }
}
