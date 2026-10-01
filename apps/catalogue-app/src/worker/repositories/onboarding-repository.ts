import type { TenantContext } from "@techabanca/domain";

export type OnboardingBusinessType = {
  code: string;
  name: string;
  description: string | null;
};

export type OnboardingTheme = {
  code: string;
  name: string;
  description: string | null;
};

export type OnboardingCatalogueSummary = {
  id: string;
  name: string;
  slug: string;
  mode: "products" | "services" | "both";
  status:
    | "draft"
    | "published"
    | "suspended"
    | "archived";
};

export type OnboardingState = {
  organization: {
    id: string;
    name: string;
    countryCode: string | null;
    timezone: string;
    businessType: {
      code: string;
      name: string;
    } | null;
  };
  profile: {
    businessName: string;
    city: string | null;
    phone: string | null;
    whatsappNumber: string | null;
    email: string | null;
  };
  catalogue: OnboardingCatalogueSummary | null;
  reference: {
    businessTypes: OnboardingBusinessType[];
    themes: OnboardingTheme[];
  };
  progress: {
    identityComplete: boolean;
    businessTypeComplete: boolean;
    catalogueStarted: boolean;
  };
};

export type UpdateOnboardingIdentityInput = {
  businessName: string;
  countryCode: string;
  city: string;
  updatedAt: string;
};

type IdentityRow = {
  organization_name: string;
  organization_country_code: string | null;
  timezone: string;
  business_type_code: string | null;
  business_type_name: string | null;
  legal_or_display_name: string;
  city: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  email: string | null;
};

type BusinessTypeRow = {
  code: string;
  name: string;
  description: string | null;
};

type ThemeRow = {
  code: string;
  name: string;
  description: string | null;
};

type CatalogueRow = {
  public_id: string;
  name: string;
  slug: string;
  mode: "products" | "services" | "both";
  status:
    | "draft"
    | "published"
    | "suspended"
    | "archived";
};

export class OnboardingRepository {
  constructor(private readonly db: D1Database) {}

  async getState(
    tenant: TenantContext,
  ): Promise<OnboardingState> {
    const [
      identity,
      businessTypes,
      themes,
      catalogue,
    ] = await Promise.all([
      this.db
        .prepare(
          `SELECT
             o.name AS organization_name,
             o.country_code AS organization_country_code,
             o.timezone,
             bt.code AS business_type_code,
             bt.name AS business_type_name,
             bp.legal_or_display_name,
             bp.city,
             bp.phone,
             bp.whatsapp_number,
             bp.email
           FROM organizations o
           INNER JOIN business_profiles bp
             ON bp.organization_id = o.id
           LEFT JOIN business_types bt
             ON bt.id = o.business_type_id
           WHERE o.id = ?
             AND o.status = 'active'
             AND o.deleted_at IS NULL
           LIMIT 1`,
        )
        .bind(tenant.organizationId)
        .first<IdentityRow>(),
      this.db
        .prepare(
          `SELECT
             code,
             name,
             description
           FROM business_types
           WHERE is_active = 1
           ORDER BY sort_order, id`,
        )
        .all<BusinessTypeRow>(),
      this.db
        .prepare(
          `SELECT
             code,
             name,
             description
           FROM theme_presets
           WHERE is_active = 1
           ORDER BY sort_order, code`,
        )
        .all<ThemeRow>(),
      this.db
        .prepare(
          `SELECT
             public_id,
             name,
             slug,
             mode,
             status
           FROM catalogues
           WHERE organization_id = ?
             AND deleted_at IS NULL
           ORDER BY id
           LIMIT 1`,
        )
        .bind(tenant.organizationId)
        .first<CatalogueRow>(),
    ]);

    if (!identity) {
      throw new Error("onboarding_identity_missing");
    }

    const businessType =
      identity.business_type_code
      && identity.business_type_name
        ? {
            code: identity.business_type_code,
            name: identity.business_type_name,
          }
        : null;

    const normalizedCountry =
      identity.organization_country_code?.toUpperCase()
      ?? null;

    const normalizedCity =
      identity.city?.trim() || null;

    return {
      organization: {
        id: tenant.organizationPublicId,
        name: identity.organization_name,
        countryCode: normalizedCountry,
        timezone: identity.timezone,
        businessType,
      },
      profile: {
        businessName: identity.legal_or_display_name,
        city: normalizedCity,
        phone: identity.phone,
        whatsappNumber: identity.whatsapp_number,
        email: identity.email,
      },
      catalogue: catalogue
        ? {
            id: catalogue.public_id,
            name: catalogue.name,
            slug: catalogue.slug,
            mode: catalogue.mode,
            status: catalogue.status,
          }
        : null,
      reference: {
        businessTypes: businessTypes.results.map(
          (row) => ({
            code: row.code,
            name: row.name,
            description: row.description,
          }),
        ),
        themes: themes.results.map((row) => ({
          code: row.code,
          name: row.name,
          description: row.description,
        })),
      },
      progress: {
        identityComplete:
          identity.legal_or_display_name.trim().length > 0
          && normalizedCountry !== null
          && normalizedCity !== null,
        businessTypeComplete: businessType !== null,
        catalogueStarted: catalogue !== null,
      },
    };
  }

  async updateIdentity(
    tenant: TenantContext,
    input: UpdateOnboardingIdentityInput,
  ): Promise<void> {
    const organizationUpdate = this.db
      .prepare(
        `UPDATE organizations
         SET
           name = ?,
           country_code = ?,
           updated_at = ?
         WHERE id = ?
           AND status = 'active'
           AND deleted_at IS NULL`,
      )
      .bind(
        input.businessName,
        input.countryCode,
        input.updatedAt,
        tenant.organizationId,
      );

    const profileUpsert = this.db
      .prepare(
        `INSERT INTO business_profiles (
           organization_id,
           legal_or_display_name,
           city,
           country_code,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(organization_id) DO UPDATE SET
           legal_or_display_name = excluded.legal_or_display_name,
           city = excluded.city,
           country_code = excluded.country_code,
           updated_at = excluded.updated_at`,
      )
      .bind(
        tenant.organizationId,
        input.businessName,
        input.city,
        input.countryCode,
        input.updatedAt,
        input.updatedAt,
      );

    await this.db.batch([
      organizationUpdate,
      profileUpsert,
    ]);
  }
}
