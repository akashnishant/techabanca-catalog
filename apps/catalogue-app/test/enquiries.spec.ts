import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { tenantContextFromResolvedMembership } from "@techabanca/domain";
import { EnquiryRepository } from "../src/worker/repositories";

const now = "2026-09-30T15:00:00.000Z";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM enquiry_activity"),
    env.DB.prepare("DELETE FROM enquiries"),
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

async function createItem(
  id: number,
  publicId: string,
  catalogueId: number,
  slug: string,
) {
  await env.DB.prepare(
    `INSERT INTO catalogue_items (
       id,
       public_id,
       catalogue_id,
       item_type,
       name,
       slug,
       status,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      publicId,
      catalogueId,
      "product",
      `Item ${id}`,
      slug,
      "published",
      now,
      now,
    )
    .run();
}

async function createEnquiry(input: {
  id: number;
  publicId: string;
  organizationId: number;
  catalogueId: number;
  itemId?: number | null;
  source?: "catalogue" | "item" | "contact";
  contactName?: string;
  email?: string | null;
  phone?: string | null;
  message?: string;
}) {
  const email =
    Object.prototype.hasOwnProperty.call(input, "email")
      ? input.email ?? null
      : "buyer@example.com";

  const phone =
    Object.prototype.hasOwnProperty.call(input, "phone")
      ? input.phone ?? null
      : null;

  await env.DB.prepare(
    `INSERT INTO enquiries (
       id,
       public_id,
       organization_id,
       catalogue_id,
       item_id,
       source,
       contact_name,
       email,
       phone,
       message,
       status,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.publicId,
      input.organizationId,
      input.catalogueId,
      input.itemId ?? null,
      input.source ?? "catalogue",
      input.contactName ?? "Prospective Customer",
      email,
      phone,
      input.message ?? "Please send pricing and availability.",
      "new",
      now,
      now,
    )
    .run();
}

describe("enquiries foundation", () => {
  beforeEach(async () => {
    await resetFixture();
  });

  it("stores a valid catalogue enquiry with a reachable contact", async () => {
    await createOrganization(
      60101,
      "org_11111111111111111111111111111111",
      "Enquiry Org",
    );
    await createCatalogue(
      60201,
      "cat_22222222222222222222222222222222",
      60101,
      "enquiry-catalogue",
    );

    await expect(
      createEnquiry({
        id: 60301,
        publicId: "enq_33333333333333333333333333333333",
        organizationId: 60101,
        catalogueId: 60201,
      }),
    ).resolves.toBeUndefined();

    const row = await env.DB.prepare(
      `SELECT source, status, contact_name, email
       FROM enquiries
       WHERE id = ?`,
    )
      .bind(60301)
      .first<{
        source: string;
        status: string;
        contact_name: string;
        email: string;
      }>();

    expect(row).toEqual({
      source: "catalogue",
      status: "new",
      contact_name: "Prospective Customer",
      email: "buyer@example.com",
    });
  });

  it("rejects enquiries without an email or phone", async () => {
    await createOrganization(
      60401,
      "org_44444444444444444444444444444444",
      "Contact Validation Org",
    );
    await createCatalogue(
      60501,
      "cat_55555555555555555555555555555555",
      60401,
      "contact-validation",
    );

    await expect(
      createEnquiry({
        id: 60601,
        publicId: "enq_66666666666666666666666666666666",
        organizationId: 60401,
        catalogueId: 60501,
        email: null,
        phone: null,
      }),
    ).rejects.toThrow();
  });

  it("accepts a phone-only enquiry when email is explicitly null", async () => {
    await createOrganization(
      60611,
      "org_61616161616161616161616161616161",
      "Phone Only Org",
    );
    await createCatalogue(
      60612,
      "cat_62626262626262626262626262626262",
      60611,
      "phone-only",
    );

    await expect(
      createEnquiry({
        id: 60613,
        publicId: "enq_63636363636363636363636363636363",
        organizationId: 60611,
        catalogueId: 60612,
        email: null,
        phone: "+91 9876543210",
      }),
    ).resolves.toBeUndefined();

    const row = await env.DB.prepare(
      `SELECT email, phone
       FROM enquiries
       WHERE id = ?`,
    )
      .bind(60613)
      .first<{
        email: string | null;
        phone: string | null;
      }>();

    expect(row).toEqual({
      email: null,
      phone: "+91 9876543210",
    });
  });

  it("rejects cross-tenant and cross-catalogue item scope", async () => {
    await createOrganization(
      60701,
      "org_77777777777777777777777777777777",
      "Scope Org A",
    );
    await createOrganization(
      60702,
      "org_88888888888888888888888888888888",
      "Scope Org B",
    );

    await createCatalogue(
      60801,
      "cat_99999999999999999999999999999999",
      60701,
      "scope-a",
    );
    await createCatalogue(
      60802,
      "cat_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      60702,
      "scope-b",
    );

    await createItem(
      60901,
      "itm_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      60802,
      "foreign-item",
    );

    await expect(
      createEnquiry({
        id: 61001,
        publicId: "enq_cccccccccccccccccccccccccccccccc",
        organizationId: 60701,
        catalogueId: 60801,
        itemId: 60901,
        source: "item",
      }),
    ).rejects.toThrow();

    await expect(
      createEnquiry({
        id: 61002,
        publicId: "enq_dddddddddddddddddddddddddddddddd",
        organizationId: 60701,
        catalogueId: 60802,
      }),
    ).rejects.toThrow();
  });

  it("enforces forward-only enquiry status transitions", async () => {
    await createOrganization(
      61101,
      "org_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "Status Org",
    );
    await createCatalogue(
      61201,
      "cat_ffffffffffffffffffffffffffffffff",
      61101,
      "status-catalogue",
    );
    await createEnquiry({
      id: 61301,
      publicId: "enq_12121212121212121212121212121212",
      organizationId: 61101,
      catalogueId: 61201,
    });

    await env.DB.prepare(
      `UPDATE enquiries
       SET status = 'contacted',
           contacted_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
      .bind(now, now, 61301)
      .run();

    await env.DB.prepare(
      `UPDATE enquiries
       SET status = 'closed',
           closed_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
      .bind(now, now, 61301)
      .run();

    await expect(
      env.DB.prepare(
        `UPDATE enquiries
         SET status = 'contacted',
             updated_at = ?
         WHERE id = ?`,
      )
        .bind(now, 61301)
        .run(),
    ).rejects.toThrow();
  });

  it("validates enquiry activity semantics", async () => {
    await createOrganization(
      61401,
      "org_13131313131313131313131313131313",
      "Activity Org",
    );
    await createCatalogue(
      61501,
      "cat_14141414141414141414141414141414",
      61401,
      "activity-catalogue",
    );
    await createEnquiry({
      id: 61601,
      publicId: "enq_15151515151515151515151515151515",
      organizationId: 61401,
      catalogueId: 61501,
    });

    await expect(
      env.DB.prepare(
        `INSERT INTO enquiry_activity (
           id,
           enquiry_id,
           activity_type,
           note,
           created_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          61701,
          61601,
          "note",
          "Customer requested a callback tomorrow.",
          now,
        )
        .run(),
    ).resolves.toBeDefined();

    await expect(
      env.DB.prepare(
        `INSERT INTO enquiry_activity (
           id,
           enquiry_id,
           activity_type,
           created_at
         ) VALUES (?, ?, ?, ?)`,
      )
        .bind(61702, 61601, "note", now)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO enquiry_activity (
           id,
           enquiry_id,
           activity_type,
           from_status,
           to_status,
           created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          61703,
          61601,
          "status_changed",
          "new",
          "new",
          now,
        )
        .run(),
    ).rejects.toThrow();
  });

  it("keeps enquiry repository reads inside the resolved tenant", async () => {
    await createOrganization(
      61801,
      "org_16161616161616161616161616161616",
      "Repository Org A",
    );
    await createOrganization(
      61802,
      "org_17171717171717171717171717171717",
      "Repository Org B",
    );
    await createCatalogue(
      61901,
      "cat_18181818181818181818181818181818",
      61801,
      "repository-a",
    );
    await createCatalogue(
      61902,
      "cat_19191919191919191919191919191919",
      61802,
      "repository-b",
    );

    await createEnquiry({
      id: 62001,
      publicId: "enq_20202020202020202020202020202020",
      organizationId: 61801,
      catalogueId: 61901,
      contactName: "Tenant A Buyer",
    });

    await createEnquiry({
      id: 62002,
      publicId: "enq_21212121212121212121212121212121",
      organizationId: 61802,
      catalogueId: 61902,
      contactName: "Tenant B Buyer",
    });

    const tenantA = tenantContextFromResolvedMembership({
      organizationId: 61801,
      organizationPublicId: "org_16161616161616161616161616161616",
    });

    const repository = new EnquiryRepository(env.DB);

    await expect(
      repository.findByPublicId(
        tenantA,
        "enq_20202020202020202020202020202020",
      ),
    ).resolves.toMatchObject({
      id: 62001,
      contactName: "Tenant A Buyer",
      status: "new",
    });

    await expect(
      repository.findByPublicId(
        tenantA,
        "enq_21212121212121212121212121212121",
      ),
    ).resolves.toBeNull();
  });
});
