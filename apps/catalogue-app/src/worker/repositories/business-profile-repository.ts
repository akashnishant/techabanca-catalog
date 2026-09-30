import type { TenantContext } from "@techabanca/domain";

export type BusinessProfileRecord = {
  organizationId: number;
  legalOrDisplayName: string;
  tagline: string | null;
  shortDescription: string | null;
  aboutText: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  countryCode: string | null;
  websiteUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type BusinessProfileRow = {
  organization_id: number;
  legal_or_display_name: string;
  tagline: string | null;
  short_description: string | null;
  about_text: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  email: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country_code: string | null;
  website_url: string | null;
  created_at: string;
  updated_at: string;
};

export class BusinessProfileRepository {
  constructor(private readonly db: D1Database) {}

  async findByTenant(
    tenant: TenantContext,
  ): Promise<BusinessProfileRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           organization_id,
           legal_or_display_name,
           tagline,
           short_description,
           about_text,
           phone,
           whatsapp_number,
           email,
           address_line_1,
           address_line_2,
           city,
           state_region,
           postal_code,
           country_code,
           website_url,
           created_at,
           updated_at
         FROM business_profiles
         WHERE organization_id = ?
         LIMIT 1`,
      )
      .bind(tenant.organizationId)
      .first<BusinessProfileRow>();

    if (!row) {
      return null;
    }

    return {
      organizationId: row.organization_id,
      legalOrDisplayName: row.legal_or_display_name,
      tagline: row.tagline,
      shortDescription: row.short_description,
      aboutText: row.about_text,
      phone: row.phone,
      whatsappNumber: row.whatsapp_number,
      email: row.email,
      addressLine1: row.address_line_1,
      addressLine2: row.address_line_2,
      city: row.city,
      stateRegion: row.state_region,
      postalCode: row.postal_code,
      countryCode: row.country_code,
      websiteUrl: row.website_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
