import { env } from "cloudflare:workers";
import { tenantContextFromResolvedMembership } from "@techabanca/domain";
import { SessionRepository } from "../src/worker/repositories";
import { AuthSessionService } from "../src/worker/services/auth-session-service";
import { SECURE_SESSION_COOKIE_NAME } from "../src/worker/http/session-cookie";
export const id = (prefix: string, value: number) => prefix + "_" + value.toString(16).padStart(32, "0");
let sequence = 920000;
export const previewConfig = { PUBLICATION_PREVIEW_SECRET: "b".repeat(64), ALLOW_UNSUBSCRIBED_PUBLISHING: "true", LOCAL_PREVIEW: "false" };
export async function publicationFixture() {
 const n = ++sequence, now = new Date().toISOString(), slug = "publisher-" + n;
 const tenant = tenantContextFromResolvedMembership({ organizationId: n, organizationPublicId: id("org", n) });
 const product = n * 10 + 1, service = n * 10 + 2;
 const imageKey = "publisher/" + n + "/image.png", documentKey = "publisher/" + n + "/sheet.pdf";
 const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X8AAAAASUVORK5CYII="), c => c.charCodeAt(0));
 const pdf = new TextEncoder().encode("%PDF-1.4\nPublication fixture.\n%%EOF");
 const image = await env.ASSETS.put(imageKey, png, { httpMetadata: { contentType: "image/png" } });
 const document = await env.ASSETS.put(documentKey, pdf, { httpMetadata: { contentType: "application/pdf" } });
 const hash = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes))), x => x.toString(16).padStart(2, "0")).join("");
 const queries = [
  env.DB.prepare("INSERT INTO organizations (id, public_id, name, country_code, status, business_type_id, created_at, updated_at) VALUES (?, ?, 'Northstar Supply', 'IN', 'active', 1, ?, ?)").bind(n, id("org", n), now, now),
  env.DB.prepare("INSERT INTO business_profiles (organization_id, legal_or_display_name, about_text, email, phone, whatsapp_number, city, created_at, updated_at) VALUES (?, 'Northstar Supply', 'Public business introduction', 'orders@example.test', '+919876543210', '+919876543210', 'Mumbai', ?, ?)").bind(n, now, now),
  env.DB.prepare("INSERT INTO catalogues (id, public_id, organization_id, name, slug, mode, created_at, updated_at) VALUES (?, ?, ?, 'Northstar Catalogue', ?, 'both', ?, ?)").bind(n, id("cat", n), n, slug, now, now),
 ];
 for (const [value, role] of [[n * 10 + 1, "owner"], [n * 10 + 2, "admin"], [n * 10 + 3, "editor"]] as const) {
  queries.push(env.DB.prepare("INSERT INTO users (id, public_id, email, password_hash, display_name, created_at, updated_at) VALUES (?, ?, ?, 'test-hash', ?, ?, ?)").bind(value, id("usr", value), role + n + "@publisher.test", role, now, now));
  queries.push(env.DB.prepare("INSERT INTO organization_members (public_id, organization_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)").bind(id("mem", value), n, value, role, now, now));
 }
 for (const [value, key, mime, body, etag] of [[product, imageKey, "image/png", png, image!.etag], [service, documentKey, "application/pdf", pdf, document!.etag]] as const) {
  queries.push(env.DB.prepare("INSERT INTO assets (id, public_id, organization_id, asset_kind, object_key, original_filename, mime_type, byte_size, checksum_sha256, etag, status, ready_at, verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)")
   .bind(value, id("ast", value), n, mime === "image/png" ? "image" : "document", key, mime === "image/png" ? "pump.png" : "sheet.pdf", mime, body.length, await hash(body), etag, now, now, now, now));
 }
 for (const [value, name, visible, parent] of [[n * 10 + 1, "Hardware", 1, null], [n * 10 + 2, "Hidden category SECRET", 0, null], [n * 10 + 3, "Hidden child SECRET", 1, n * 10 + 2]] as const) {
  queries.push(env.DB.prepare("INSERT INTO categories (id, public_id, catalogue_id, parent_id, name, slug, is_visible, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
   .bind(value, id("ctg", value), n, parent, name, "category-" + value, visible, now, now));
 }
 for (const [value, name, status, category, type] of [[product, "Precision Pump", "published", n * 10 + 1, "product"],
  [service, "Maintenance Visit", "published", null, "service"], [n * 10 + 3, "Draft SECRET", "draft", null, "product"],
  [n * 10 + 4, "Hidden SECRET", "hidden", null, "product"], [n * 10 + 5, "Hidden category item SECRET", "published", n * 10 + 3, "product"]] as const) {
  queries.push(env.DB.prepare("INSERT INTO catalogue_items (id, public_id, catalogue_id, category_id, item_type, name, slug, short_description, price_minor_units, currency_code, show_price, status, is_featured, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'Public item summary', 127525, 'INR', ?, ?, 1, ?, ?)")
   .bind(value, id("itm", value), n, category, type, name, "item-" + value, value === product ? 1 : 0, status, now, now));
 }
 queries.push(env.DB.prepare("INSERT INTO catalogue_website_settings (catalogue_id, logo_asset_id, hero_asset_id, hero_title, created_at, updated_at) VALUES (?, ?, ?, 'Reliable products and services', ?, ?)").bind(n, product, product, now, now));
 queries.push(env.DB.prepare("INSERT INTO item_images (item_id, asset_id, alt_text, is_primary, created_at) VALUES (?, ?, 'Precision Pump front view', 1, ?)").bind(product, product, now));
 queries.push(env.DB.prepare("INSERT INTO item_documents (item_id, asset_id, label, is_visible, created_at) VALUES (?, ?, 'Safety sheet', 1, ?)").bind(product, service, now));
 queries.push(env.DB.prepare("INSERT INTO item_documents (item_id, asset_id, label, is_visible, created_at) VALUES (?, ?, 'Hidden document SECRET', 0, ?)").bind(service, service, now));
 queries.push(env.DB.prepare("INSERT INTO item_attribute_values (item_id, attribute_definition_id, value_text, is_visible, created_at, updated_at) VALUES (?, 1, 'Northstar', 1, ?, ?)").bind(product, now, now));
 queries.push(env.DB.prepare("INSERT INTO item_attribute_values (item_id, attribute_definition_id, value_text, is_visible, created_at, updated_at) VALUES (?, 3, 'Hidden specification SECRET', 0, ?, ?)").bind(product, now, now));
 await env.DB.batch(queries);
 const session = async (user = product) => {
  const auth = await new AuthSessionService(new SessionRepository(env.DB)).create(user, new Date());
  return SECURE_SESSION_COOKIE_NAME + "=" + auth.token;
 };
 return { n, tenant, slug, product, service, imageKey, documentKey, imageId: id("ast", product), owner: product, admin: service, editor: n * 10 + 3, session };
}
