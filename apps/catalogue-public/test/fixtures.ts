import { env } from "cloudflare:workers";
import type { Site } from "../src/model";

export const now = "2026-10-04T12:00:00.000Z";
export function publicId(prefix: string, number: number): string { return prefix + "_" + number.toString(16).padStart(32, "0"); }
let sequence = 610000;
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X8AAAAASUVORK5CYII="), char => char.charCodeAt(0));
export const pdf = "%PDF-1.4\nPublic document test fixture.\n%%EOF";
const headerColumns = ["name", "mode", "theme_code", "business_name", "about_text", "contact_email", "contact_phone", "whatsapp_number", "address_text", "logo_asset_public_id", "logo_object_key", "hero_asset_public_id", "hero_object_key", "hero_title", "hero_subtitle", "hero_cta_label", "hero_cta_target", "show_featured_items", "show_categories", "show_about", "show_contact", "show_whatsapp", "show_phone", "show_email", "seo_title", "seo_description", "published_at"] as const;

export async function createFixture(overrides: Partial<Site> = {}, extraItems = 0) {
  const n = ++sequence;
  const slug = "renderer-" + n;
  const catalogueId = publicId("cat", n);
  const publicationId = publicId("pub", n);
  const productId = publicId("itm", n * 10 + 1);
  const serviceId = publicId("itm", n * 10 + 2);
  const childItemId = publicId("itm", n * 10 + 3);
  const hardware = publicId("ctg", n * 10 + 1);
  const fasteners = publicId("ctg", n * 10 + 2);
  const services = publicId("ctg", n * 10 + 3);
  const imageId = publicId("ast", n * 10 + 1);
  const heroId = publicId("ast", n * 10 + 2);
  const documentId = publicId("ast", n * 10 + 4);
  const unreferencedId = publicId("ast", n * 10 + 9);
  const imageKey = "m6-fixtures/" + n + "/image.png";
  const heroKey = "m6-fixtures/" + n + "/hero.png";
  const documentKey = "m6-fixtures/" + n + "/sheet.pdf";
  const header: Record<typeof headerColumns[number], string | number | null> = {
    name: "Northstar Catalogue", mode: "both", theme_code: "professional", business_name: "Northstar Supply",
    about_text: "Published business introduction.", contact_email: "orders@example.test", contact_phone: "+91 98765 43210",
    whatsapp_number: "+91 98765 43210", address_text: "Demo address, Mumbai", logo_asset_public_id: imageId, logo_object_key: imageKey,
    hero_asset_public_id: heroId, hero_object_key: heroKey, hero_title: "Reliable supplies for your next project.",
    hero_subtitle: "Published selection of useful products and services.", hero_cta_label: "Browse catalogue", hero_cta_target: "catalogue",
    show_featured_items: 1, show_categories: 1, show_about: 1, show_contact: 1, show_whatsapp: 1, show_phone: 1, show_email: 1,
    seo_title: "Northstar products and services", seo_description: "Published SEO description.", published_at: now,
  };
  for (const column of headerColumns) if (column in overrides) header[column] = overrides[column] as string | number | null;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO organizations (id, public_id, name, country_code, timezone, status, business_type_id, created_at, updated_at) VALUES (?, ?, ?, 'IN', 'Asia/Kolkata', 'active', 1, ?, ?)").bind(n, publicId("org", n), "Source organization SECRET", now, now),
    env.DB.prepare("INSERT INTO catalogues (id, public_id, organization_id, name, slug, mode, status, version, created_at, updated_at) VALUES (?, ?, ?, 'Source catalogue SECRET', ?, 'both', 'draft', 1, ?, ?)").bind(n, catalogueId, n, slug, now, now),
    env.DB.prepare("INSERT INTO catalogue_items (id, public_id, catalogue_id, item_type, name, slug, long_description, status, created_at, updated_at) VALUES (?, ?, ?, 'product', 'Unpublished item SECRET', 'precision-pump', 'Unpublished detail SECRET', 'published', ?, ?)").bind(n * 10 + 1, productId, n, now, now),
    env.DB.prepare("INSERT INTO catalogue_items (id, public_id, catalogue_id, item_type, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'product', 'Hidden item SECRET', 'hidden-only', 'hidden', ?, ?)").bind(n * 10 + 9, publicId("itm", n * 10 + 9), n, now, now),
    env.DB.prepare("INSERT INTO catalogue_publications (id, public_id, catalogue_id, catalogue_public_id, revision_number, state, source_catalogue_version, created_at) VALUES (?, ?, ?, ?, 1, 'building', 1, ?)").bind(n, publicationId, n, catalogueId, now),
    env.DB.prepare("INSERT INTO published_catalogues (publication_id, catalogue_public_id, slug, " + headerColumns.join(", ") + ") VALUES (" + Array(3 + headerColumns.length).fill("?").join(", ") + ")").bind(n, catalogueId, slug, ...headerColumns.map(column => header[column])),
    env.DB.prepare("INSERT INTO published_categories (publication_id, category_public_id, name, slug, sort_order) VALUES (?, ?, 'Hardware', 'hardware', 1)").bind(n, hardware),
    env.DB.prepare("INSERT INTO published_categories (publication_id, category_public_id, parent_category_public_id, name, slug, sort_order) VALUES (?, ?, ?, 'Fasteners', 'fasteners', 2)").bind(n, fasteners, hardware),
    env.DB.prepare("INSERT INTO published_categories (publication_id, category_public_id, name, slug, sort_order) VALUES (?, ?, 'Services', 'services', 3)").bind(n, services),
    env.DB.prepare("INSERT INTO published_items (publication_id, item_public_id, category_public_id, item_type, name, slug, sku, short_description, long_description, price_minor_units, currency_code, show_price, is_featured, sort_order) VALUES (?, ?, ?, 'product', 'Precision Pump', 'precision-pump', 'PUMP-01', 'Reliable pump for everyday requirements.', 'Published long description.', 127525, 'INR', 1, 1, 1)").bind(n, productId, hardware),
    env.DB.prepare("INSERT INTO published_items (publication_id, item_public_id, category_public_id, item_type, name, slug, short_description, price_minor_units, currency_code, show_price, is_featured, sort_order) VALUES (?, ?, ?, 'service', 'Maintenance Visit', 'maintenance-visit', 'A useful scheduled maintenance service.', 999999, 'INR', 0, 1, 2)").bind(n, serviceId, services),
    env.DB.prepare("INSERT INTO published_items (publication_id, item_public_id, category_public_id, item_type, name, slug, sku, short_description, show_price, sort_order) VALUES (?, ?, ?, 'product', 'Stainless Fastener', 'stainless-fastener', 'BOLT_01', '100% stainless construction.', 0, 3)").bind(n, childItemId, fasteners),
    env.DB.prepare("INSERT INTO published_item_attributes (publication_id, item_public_id, attribute_code, label, value_text, unit_hint, sort_order) VALUES (?, ?, 'material', 'Material', 'Stainless steel', NULL, 1)").bind(n, productId),
    env.DB.prepare("INSERT INTO published_item_images (publication_id, item_public_id, asset_public_id, object_key, mime_type, alt_text, is_primary, sort_order) VALUES (?, ?, ?, ?, 'image/png', 'Front of Precision Pump', 1, 1)").bind(n, productId, imageId, imageKey),
    env.DB.prepare("INSERT INTO published_item_documents (publication_id, item_public_id, asset_public_id, object_key, mime_type, label, sort_order) VALUES (?, ?, ?, ?, 'application/pdf', 'Safety data sheet', 1)").bind(n, productId, documentId, documentKey),
  ]);
  if (extraItems) await env.DB.batch(Array.from({ length: extraItems }, (_, index) => env.DB.prepare(
    "INSERT INTO published_items (publication_id, item_public_id, category_public_id, item_type, name, slug, show_price, sort_order) VALUES (?, ?, ?, 'product', ?, ?, 0, ?)",
  ).bind(n, publicId("itm", n * 1000 + index), hardware, "Batch Pump " + String(index + 1).padStart(3, "0"), "batch-pump-" + (index + 1), index + 10)));
  await Promise.all([
    env.ASSETS.put(imageKey, png, { httpMetadata: { contentType: "image/png" } }),
    env.ASSETS.put(heroKey, png, { httpMetadata: { contentType: "image/png" } }),
    env.ASSETS.put(documentKey, pdf, { httpMetadata: { contentType: "application/pdf" } }),
    env.ASSETS.put("m6-fixtures/" + n + "/unreferenced.png", png, { httpMetadata: { contentType: "image/png" } }),
  ]);
  await env.DB.batch([
    env.DB.prepare("UPDATE catalogue_publications SET state = 'active', activated_at = ? WHERE id = ?").bind(now, n),
    env.DB.prepare("INSERT INTO public_catalogue_routes (slug, catalogue_public_id, publication_id, status, updated_at) VALUES (?, ?, ?, 'active', ?)").bind(slug, catalogueId, n, now),
  ]);
  const accessStart = new Date(Date.now() - 86400000).toISOString(), accessEnd = new Date(Date.now() + 14 * 86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO subscription_plans (id, code, name, created_at, updated_at) VALUES (?, ?, 'Public fixture trial', ?, ?)").bind(n, "public-trial-" + n, accessStart, accessStart),
    env.DB.prepare("INSERT INTO plan_entitlements (plan_id, entitlement_key, value_type, boolean_value, created_at, updated_at) VALUES (?, 'catalogue.publish', 'boolean', 1, ?, ?)").bind(n, accessStart, accessStart),
    env.DB.prepare("INSERT INTO subscriptions (public_id, organization_id, plan_id, status, trial_starts_at, trial_ends_at, created_at, updated_at) VALUES (?, ?, ?, 'trialing', ?, ?, ?, ?)").bind(publicId("sub", n), n, n, accessStart, accessEnd, accessStart, accessStart),
  ]);
  return { n, slug, catalogueId, publicationId, productId, imageId, heroId, documentId, unreferencedId, imageKey, heroKey, documentKey, header, origin: "https://" + slug + ".techabanca.com" };
}
