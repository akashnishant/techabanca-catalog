import type { TenantContext } from "@techabanca/domain";

export type WebsiteSettingsRecord = {
  catalogueId: number;
  cataloguePublicId: string;
  themeCode: string;
  logoAssetId: number | null;
  heroAssetId: number | null;
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
  version: number;
};

type WebsiteSettingsRow = {
  catalogue_id: number;
  catalogue_public_id: string;
  theme_code: string;
  logo_asset_id: number | null;
  hero_asset_id: number | null;
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
  version: number;
};

export class WebsiteSettingsRepository {
  constructor(private readonly db: D1Database) {}

  async findByCataloguePublicId(
    tenant: TenantContext,
    cataloguePublicId: string,
  ): Promise<WebsiteSettingsRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           s.catalogue_id,
           c.public_id AS catalogue_public_id,
           s.theme_code,
           s.logo_asset_id,
           s.hero_asset_id,
           s.hero_title,
           s.hero_subtitle,
           s.hero_cta_label,
           s.hero_cta_target,
           s.show_featured_items,
           s.show_categories,
           s.show_about,
           s.show_contact,
           s.show_whatsapp,
           s.show_phone,
           s.show_email,
           s.seo_title,
           s.seo_description,
           s.version
         FROM catalogue_website_settings s
         INNER JOIN catalogues c
           ON c.id = s.catalogue_id
         WHERE c.organization_id = ?
           AND c.public_id = ?
           AND c.deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(tenant.organizationId, cataloguePublicId)
      .first<WebsiteSettingsRow>();

    if (!row) {
      return null;
    }

    return {
      catalogueId: row.catalogue_id,
      cataloguePublicId: row.catalogue_public_id,
      themeCode: row.theme_code,
      logoAssetId: row.logo_asset_id,
      heroAssetId: row.hero_asset_id,
      heroTitle: row.hero_title,
      heroSubtitle: row.hero_subtitle,
      heroCtaLabel: row.hero_cta_label,
      heroCtaTarget: row.hero_cta_target,
      showFeaturedItems: row.show_featured_items === 1,
      showCategories: row.show_categories === 1,
      showAbout: row.show_about === 1,
      showContact: row.show_contact === 1,
      showWhatsapp: row.show_whatsapp === 1,
      showPhone: row.show_phone === 1,
      showEmail: row.show_email === 1,
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
      version: row.version,
    };
  }
}
