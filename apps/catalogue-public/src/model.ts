export type PublicBindings = { DB: D1Database; ASSETS: R2Bucket; LOCAL_PREVIEW?: string; PUBLICATION_PREVIEW_SECRET?: string };
export type Site = {
  publication_id: number; publication_public_id: string; revision_number: number;
  catalogue_public_id: string; slug: string; name: string; mode: "products" | "services" | "both";
  theme_code: string; business_name: string; about_text: string | null;
  contact_email: string | null; contact_phone: string | null; whatsapp_number: string | null; address_text: string | null;
  logo_asset_public_id: string | null; logo_object_key: string | null;
  hero_asset_public_id: string | null; hero_object_key: string | null;
  hero_title: string | null; hero_subtitle: string | null; hero_cta_label: string | null;
  hero_cta_target: "catalogue" | "contact" | "whatsapp";
  show_featured_items: number; show_categories: number; show_about: number; show_contact: number;
  show_whatsapp: number; show_phone: number; show_email: number;
  seo_title: string | null; seo_description: string | null; published_at: string;
};
export type Category = {
  category_public_id: string; parent_category_public_id: string | null;
  name: string; slug: string; description: string | null; sort_order: number;
};
export type Item = {
  item_public_id: string; category_public_id: string | null; item_type: "product" | "service";
  name: string; slug: string; sku: string | null; short_description: string | null; long_description: string | null;
  price_minor_units: number | null; currency_code: string | null; show_price: number;
  is_featured: number; sort_order: number; cover_asset_public_id: string | null;
};
export type Attribute = { attribute_code: string; label: string; value_text: string; unit_hint: string | null; sort_order: number };
export type Image = { asset_public_id: string; mime_type: string; alt_text: string | null; is_primary: number; sort_order: number };
export type Document = { asset_public_id: string; mime_type: string; label: string | null; sort_order: number };
export type Detail = { item: Item; attributes: Attribute[]; images: Image[]; documents: Document[] };
export type Media = { object_key: string; mime_type: string | null; kind: "image" | "document"; label: string | null };
export type Filters = { query: string; type: "all" | "product" | "service"; category: string; page: number; featured?: boolean };
export type ItemPage = { items: Item[]; total: number; page: number; pageSize: number };
