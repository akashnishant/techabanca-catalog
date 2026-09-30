import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { tenantContextFromResolvedMembership } from "@techabanca/domain";
import { WebsiteSettingsRepository } from "../src/worker/repositories";

const now = "2026-09-30T14:00:00.000Z";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM catalogue_website_settings"),
    env.DB.prepare("DELETE FROM item_images"),
    env.DB.prepare("DELETE FROM item_documents"),
    env.DB.prepare("DELETE FROM item_attribute_values"),
    env.DB.prepare("DELETE FROM catalogue_items"),
    env.DB.prepare("DELETE FROM assets"),
    env.DB.prepare(
      "DELETE FROM attribute_definitions WHERE organization_id IS NOT NULL",
    ),
    env.DB.prepare("DELETE FROM categories"),
    env.DB.prepare("DELETE FROM catalogues"),
    env.DB.prepare("DELETE FROM business_profiles"),
    env.DB.prepare("DELETE FROM organization_members"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM organizations"),
    env.DB.prepare("DELETE FROM users"),
  ]);
}

async function createOrganization(
  id: number,
  publicId: string,
  name: string,
) {
  await env.DB.prepare(
    `INSERT INTO organizations (
       id,
       public_id,
       name,
       country_code,
       timezone,
       status,
       business_type_id,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      publicId,
      name,
      "IN",
      "Asia/Kolkata",
      "active",
      1,
      now,
      now,
    )
    .run();
}

async function createCatalogue(
  id: number,
  publicId: string,
  organizationId: number,
  slug: string,
) {
  await env.DB.prepare(
    `INSERT INTO catalogues (
       id,
       public_id,
       organization_id,
       name,
       slug,
       mode,
       status,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      publicId,
      organizationId,
      `Catalogue ${id}`,
      slug,
      "products",
      "draft",
      now,
      now,
    )
    .run();
}

async function createAsset(input: {
  id: number;
  publicId: string;
  organizationId: number;
  assetKind: "image" | "document";
  key: string;
  filename: string;
  mimeType: string;
}) {
  await env.DB.prepare(
    `INSERT INTO assets (
       id,
       public_id,
       organization_id,
       asset_kind,
       object_key,
       original_filename,
       mime_type,
       byte_size,
       status,
       created_at,
       updated_at,
       ready_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.publicId,
      input.organizationId,
      input.assetKind,
      input.key,
      input.filename,
      input.mimeType,
      2048,
      "ready",
      now,
      now,
      now,
    )
    .run();
}

describe("controlled website settings", () => {
  beforeEach(async () => {
    await resetFixture();
  });

  it("seeds only the initial Professional theme", async () => {
    const themes = await env.DB.prepare(
      "SELECT code, name, is_active FROM theme_presets ORDER BY sort_order",
    ).all<{
      code: string;
      name: string;
      is_active: number;
    }>();

    expect(themes.results).toEqual([
      {
        code: "professional",
        name: "Professional",
        is_active: 1,
      },
    ]);
  });

  it("stores controlled website configuration for a catalogue", async () => {
    await createOrganization(
      40101,
      "org_11111111111111111111111111111111",
      "Website Settings Test",
    );
    await createCatalogue(
      40201,
      "cat_22222222222222222222222222222222",
      40101,
      "website-settings-test",
    );

    await env.DB.prepare(
      `INSERT INTO catalogue_website_settings (
         catalogue_id,
         theme_code,
         hero_title,
         hero_subtitle,
         hero_cta_label,
         hero_cta_target,
         seo_title,
         seo_description,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        40201,
        "professional",
        "Industrial products built for demanding work",
        "Browse specifications and request a quote directly.",
        "View catalogue",
        "catalogue",
        "Website Settings Test | Product Catalogue",
        "Browse products, specifications and contact details.",
        now,
        now,
      )
      .run();

    const row = await env.DB.prepare(
      `SELECT theme_code, hero_cta_target, show_categories, show_contact
       FROM catalogue_website_settings
       WHERE catalogue_id = ?`,
    )
      .bind(40201)
      .first<{
        theme_code: string;
        hero_cta_target: string;
        show_categories: number;
        show_contact: number;
      }>();

    expect(row).toEqual({
      theme_code: "professional",
      hero_cta_target: "catalogue",
      show_categories: 1,
      show_contact: 1,
    });
  });

  it("allows only ready same-tenant images for logo and hero", async () => {
    await createOrganization(
      40301,
      "org_33333333333333333333333333333333",
      "Website Tenant A",
    );
    await createOrganization(
      40302,
      "org_44444444444444444444444444444444",
      "Website Tenant B",
    );
    await createCatalogue(
      40401,
      "cat_55555555555555555555555555555555",
      40301,
      "website-asset-test",
    );

    await createAsset({
      id: 40501,
      publicId: "ast_66666666666666666666666666666666",
      organizationId: 40301,
      assetKind: "image",
      key: "org/40301/logo.webp",
      filename: "logo.webp",
      mimeType: "image/webp",
    });
    await createAsset({
      id: 40502,
      publicId: "ast_77777777777777777777777777777777",
      organizationId: 40301,
      assetKind: "document",
      key: "org/40301/brochure.pdf",
      filename: "brochure.pdf",
      mimeType: "application/pdf",
    });
    await createAsset({
      id: 40503,
      publicId: "ast_88888888888888888888888888888888",
      organizationId: 40302,
      assetKind: "image",
      key: "org/40302/foreign.webp",
      filename: "foreign.webp",
      mimeType: "image/webp",
    });

    await expect(
      env.DB.prepare(
        `INSERT INTO catalogue_website_settings (
           catalogue_id,
           theme_code,
           logo_asset_id,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(40401, "professional", 40501, now, now)
        .run(),
    ).resolves.toBeDefined();

    await env.DB.prepare(
      "DELETE FROM catalogue_website_settings WHERE catalogue_id = ?",
    )
      .bind(40401)
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO catalogue_website_settings (
           catalogue_id,
           theme_code,
           hero_asset_id,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(40401, "professional", 40502, now, now)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO catalogue_website_settings (
           catalogue_id,
           theme_code,
           hero_asset_id,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(40401, "professional", 40503, now, now)
        .run(),
    ).rejects.toThrow();
  });

  it("keeps website settings repository reads inside the tenant", async () => {
    await createOrganization(
      40601,
      "org_99999999999999999999999999999999",
      "Repository Tenant A",
    );
    await createOrganization(
      40602,
      "org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "Repository Tenant B",
    );
    await createCatalogue(
      40701,
      "cat_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      40601,
      "website-repository-a",
    );
    await createCatalogue(
      40702,
      "cat_cccccccccccccccccccccccccccccccc",
      40602,
      "website-repository-b",
    );

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO catalogue_website_settings (
           catalogue_id,
           theme_code,
           hero_title,
           hero_cta_target,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        40701,
        "professional",
        "Tenant A hero",
        "catalogue",
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO catalogue_website_settings (
           catalogue_id,
           theme_code,
           hero_title,
           hero_cta_target,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        40702,
        "professional",
        "Tenant B hero",
        "contact",
        now,
        now,
      ),
    ]);

    const tenantA = tenantContextFromResolvedMembership({
      organizationId: 40601,
      organizationPublicId: "org_99999999999999999999999999999999",
    });

    const repository = new WebsiteSettingsRepository(env.DB);

    await expect(
      repository.findByCataloguePublicId(
        tenantA,
        "cat_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
    ).resolves.toMatchObject({
      catalogueId: 40701,
      themeCode: "professional",
      heroTitle: "Tenant A hero",
      heroCtaTarget: "catalogue",
      showFeaturedItems: true,
      showCategories: true,
      showContact: true,
    });

    await expect(
      repository.findByCataloguePublicId(
        tenantA,
        "cat_cccccccccccccccccccccccccccccccc",
      ),
    ).resolves.toBeNull();
  });
});
