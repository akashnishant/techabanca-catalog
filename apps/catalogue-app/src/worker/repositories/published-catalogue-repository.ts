export type PublishedCategoryRecord = {
  publicId: string;
  parentPublicId: string | null;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
};

export type PublishedItemRecord = {
  publicId: string;
  categoryPublicId: string | null;
  itemType: "product" | "service";
  name: string;
  slug: string;
  sku: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  priceMinorUnits: number | null;
  currencyCode: string | null;
  showPrice: boolean;
  isFeatured: boolean;
  sortOrder: number;
};

export type PublishedAttributeRecord = {
  itemPublicId: string;
  code: string;
  label: string;
  value: string;
  unitHint: string | null;
  sortOrder: number;
};

export type PublishedImageRecord = {
  itemPublicId: string;
  assetPublicId: string;
  objectKey: string;
  mimeType: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
};

export type PublishedDocumentRecord = {
  itemPublicId: string;
  assetPublicId: string;
  objectKey: string;
  mimeType: string;
  label: string | null;
  sortOrder: number;
};

export type PublishedCatalogueRecord = {
  publicationId: number;
  publicationPublicId: string;
  revisionNumber: number;
  cataloguePublicId: string;
  slug: string;
  name: string;
  mode: "products" | "services" | "both";
  themeCode: string;
  businessName: string;
  aboutText: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappNumber: string | null;
  addressText: string | null;
  logoObjectKey: string | null;
  heroObjectKey: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroCtaLabel: string | null;
  heroCtaTarget: "catalogue" | "contact" | "whatsapp";
  showFeaturedItems: boolean;
  showCategories: boolean;
  showAbout: boolean;
  showContact: boolean;
  showWhatsapp: boolean;
  showPhone: boolean;
  showEmail: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string;
  categories: PublishedCategoryRecord[];
  items: PublishedItemRecord[];
  attributes: PublishedAttributeRecord[];
  images: PublishedImageRecord[];
  documents: PublishedDocumentRecord[];
};

type HeaderRow = {
  publication_id: number;
  publication_public_id: string;
  revision_number: number;
  catalogue_public_id: string;
  slug: string;
  name: string;
  mode: "products" | "services" | "both";
  theme_code: string;
  business_name: string;
  about_text: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp_number: string | null;
  address_text: string | null;
  logo_object_key: string | null;
  hero_object_key: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_cta_label: string | null;
  hero_cta_target: "catalogue" | "contact" | "whatsapp";
  show_featured_items: number;
  show_categories: number;
  show_about: number;
  show_contact: number;
  show_whatsapp: number;
  show_phone: number;
  show_email: number;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string;
};

export class PublishedCatalogueRepository {
  constructor(private readonly db: D1Database) {}

  async findActiveBySlug(
    slug: string,
  ): Promise<PublishedCatalogueRecord | null> {
    const header = await this.db
      .prepare(
        `SELECT
           p.id AS publication_id,
           p.public_id AS publication_public_id,
           p.revision_number,
           pc.catalogue_public_id,
           pc.slug,
           pc.name,
           pc.mode,
           pc.theme_code,
           pc.business_name,
           pc.about_text,
           pc.contact_email,
           pc.contact_phone,
           pc.whatsapp_number,
           pc.address_text,
           pc.logo_object_key,
           pc.hero_object_key,
           pc.hero_title,
           pc.hero_subtitle,
           pc.hero_cta_label,
           pc.hero_cta_target,
           pc.show_featured_items,
           pc.show_categories,
           pc.show_about,
           pc.show_contact,
           pc.show_whatsapp,
           pc.show_phone,
           pc.show_email,
           pc.seo_title,
           pc.seo_description,
           pc.published_at
         FROM public_catalogue_routes r
         INNER JOIN catalogue_publications p
           ON p.id = r.publication_id
         INNER JOIN published_catalogues pc
           ON pc.publication_id = p.id
         WHERE r.slug = ?
           AND r.status = 'active'
           AND p.state = 'active'
         LIMIT 1`,
      )
      .bind(slug)
      .first<HeaderRow>();

    if (!header) {
      return null;
    }

    const publicationId = header.publication_id;

    const [
      categoryResult,
      itemResult,
      attributeResult,
      imageResult,
      documentResult,
    ] = await Promise.all([
      this.db
        .prepare(
          `SELECT
             category_public_id,
             parent_category_public_id,
             name,
             slug,
             description,
             sort_order
           FROM published_categories
           WHERE publication_id = ?
           ORDER BY sort_order, name`,
        )
        .bind(publicationId)
        .all<{
          category_public_id: string;
          parent_category_public_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          sort_order: number;
        }>(),
      this.db
        .prepare(
          `SELECT
             item_public_id,
             category_public_id,
             item_type,
             name,
             slug,
             sku,
             short_description,
             long_description,
             price_minor_units,
             currency_code,
             show_price,
             is_featured,
             sort_order
           FROM published_items
           WHERE publication_id = ?
           ORDER BY sort_order, name`,
        )
        .bind(publicationId)
        .all<{
          item_public_id: string;
          category_public_id: string | null;
          item_type: "product" | "service";
          name: string;
          slug: string;
          sku: string | null;
          short_description: string | null;
          long_description: string | null;
          price_minor_units: number | null;
          currency_code: string | null;
          show_price: number;
          is_featured: number;
          sort_order: number;
        }>(),
      this.db
        .prepare(
          `SELECT
             item_public_id,
             attribute_code,
             label,
             value_text,
             unit_hint,
             sort_order
           FROM published_item_attributes
           WHERE publication_id = ?
           ORDER BY item_public_id, sort_order`,
        )
        .bind(publicationId)
        .all<{
          item_public_id: string;
          attribute_code: string;
          label: string;
          value_text: string;
          unit_hint: string | null;
          sort_order: number;
        }>(),
      this.db
        .prepare(
          `SELECT
             item_public_id,
             asset_public_id,
             object_key,
             mime_type,
             alt_text,
             sort_order,
             is_primary
           FROM published_item_images
           WHERE publication_id = ?
           ORDER BY item_public_id, sort_order`,
        )
        .bind(publicationId)
        .all<{
          item_public_id: string;
          asset_public_id: string;
          object_key: string;
          mime_type: string;
          alt_text: string | null;
          sort_order: number;
          is_primary: number;
        }>(),
      this.db
        .prepare(
          `SELECT
             item_public_id,
             asset_public_id,
             object_key,
             mime_type,
             label,
             sort_order
           FROM published_item_documents
           WHERE publication_id = ?
           ORDER BY item_public_id, sort_order`,
        )
        .bind(publicationId)
        .all<{
          item_public_id: string;
          asset_public_id: string;
          object_key: string;
          mime_type: string;
          label: string | null;
          sort_order: number;
        }>(),
    ]);

    return {
      publicationId,
      publicationPublicId: header.publication_public_id,
      revisionNumber: header.revision_number,
      cataloguePublicId: header.catalogue_public_id,
      slug: header.slug,
      name: header.name,
      mode: header.mode,
      themeCode: header.theme_code,
      businessName: header.business_name,
      aboutText: header.about_text,
      contactEmail: header.contact_email,
      contactPhone: header.contact_phone,
      whatsappNumber: header.whatsapp_number,
      addressText: header.address_text,
      logoObjectKey: header.logo_object_key,
      heroObjectKey: header.hero_object_key,
      heroTitle: header.hero_title,
      heroSubtitle: header.hero_subtitle,
      heroCtaLabel: header.hero_cta_label,
      heroCtaTarget: header.hero_cta_target,
      showFeaturedItems: header.show_featured_items === 1,
      showCategories: header.show_categories === 1,
      showAbout: header.show_about === 1,
      showContact: header.show_contact === 1,
      showWhatsapp: header.show_whatsapp === 1,
      showPhone: header.show_phone === 1,
      showEmail: header.show_email === 1,
      seoTitle: header.seo_title,
      seoDescription: header.seo_description,
      publishedAt: header.published_at,
      categories: categoryResult.results.map((row) => ({
        publicId: row.category_public_id,
        parentPublicId: row.parent_category_public_id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        sortOrder: row.sort_order,
      })),
      items: itemResult.results.map((row) => ({
        publicId: row.item_public_id,
        categoryPublicId: row.category_public_id,
        itemType: row.item_type,
        name: row.name,
        slug: row.slug,
        sku: row.sku,
        shortDescription: row.short_description,
        longDescription: row.long_description,
        priceMinorUnits: row.price_minor_units,
        currencyCode: row.currency_code,
        showPrice: row.show_price === 1,
        isFeatured: row.is_featured === 1,
        sortOrder: row.sort_order,
      })),
      attributes: attributeResult.results.map((row) => ({
        itemPublicId: row.item_public_id,
        code: row.attribute_code,
        label: row.label,
        value: row.value_text,
        unitHint: row.unit_hint,
        sortOrder: row.sort_order,
      })),
      images: imageResult.results.map((row) => ({
        itemPublicId: row.item_public_id,
        assetPublicId: row.asset_public_id,
        objectKey: row.object_key,
        mimeType: row.mime_type,
        altText: row.alt_text,
        sortOrder: row.sort_order,
        isPrimary: row.is_primary === 1,
      })),
      documents: documentResult.results.map((row) => ({
        itemPublicId: row.item_public_id,
        assetPublicId: row.asset_public_id,
        objectKey: row.object_key,
        mimeType: row.mime_type,
        label: row.label,
        sortOrder: row.sort_order,
      })),
    };
  }
}
