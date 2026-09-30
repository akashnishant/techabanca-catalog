import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { tenantContextFromResolvedMembership } from "@techabanca/domain";
import {
  AuditEventRepository,
  ModerationCaseRepository,
} from "../src/worker/repositories";

const now = "2026-09-30T16:00:00.000Z";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM moderation_case_events"),
    env.DB.prepare("DELETE FROM moderation_cases"),
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

async function createModerationCase(input: {
  id: number;
  publicId: string;
  organizationId: number;
  catalogueId: number;
  status?: "open" | "reviewing" | "resolved" | "dismissed";
}) {
  const status = input.status ?? "open";
  const resolvedAt =
    status === "resolved" || status === "dismissed"
      ? now
      : null;

  await env.DB.prepare(
    `INSERT INTO moderation_cases (
       id,
       public_id,
       organization_id,
       catalogue_id,
       status,
       reason_code,
       summary,
       opened_at,
       updated_at,
       resolved_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.publicId,
      input.organizationId,
      input.catalogueId,
      status,
      "other",
      "Operational review test case.",
      now,
      now,
      resolvedAt,
    )
    .run();
}

describe("operations foundation", () => {
  beforeAll(async () => {
    await resetFixture();
  });

  it("appends immutable audit events with valid JSON metadata", async () => {
    await createOrganization(
      80101,
      "org_11111111111111111111111111111111",
      "Audit Org",
    );

    const tenant = tenantContextFromResolvedMembership({
      organizationId: 80101,
      organizationPublicId: "org_11111111111111111111111111111111",
    });
    const repository = new AuditEventRepository(env.DB);

    await repository.append(tenant, {
      actorType: "system",
      action: "catalogue.publish",
      entityType: "catalogue",
      entityPublicId: "cat_22222222222222222222222222222222",
      requestId: "req-test-001",
      metadata: {
        revision: 1,
        source: "test",
      },
      createdAt: now,
    });

    const row = await env.DB.prepare(
      `SELECT id, metadata_json
       FROM audit_events
       WHERE organization_id = ?`,
    )
      .bind(80101)
      .first<{
        id: number;
        metadata_json: string;
      }>();

    expect(row).not.toBeNull();
    expect(JSON.parse(row?.metadata_json ?? "{}")).toEqual({
      revision: 1,
      source: "test",
    });

    await expect(
      env.DB.prepare(
        `UPDATE audit_events
         SET action = ?
         WHERE id = ?`,
      )
        .bind("catalogue.changed", row?.id)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `DELETE FROM audit_events
         WHERE id = ?`,
      )
        .bind(row?.id)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `DELETE FROM organizations
         WHERE id = ?`,
      )
        .bind(80101)
        .run(),
    ).resolves.toBeDefined();

    const retained = await env.DB.prepare(
      `SELECT organization_id, action, entity_type, metadata_json
       FROM audit_events
       WHERE id = ?`,
    )
      .bind(row?.id)
      .first<{
        organization_id: number | null;
        action: string;
        entity_type: string;
        metadata_json: string;
      }>();

    expect(retained?.organization_id).toBeNull();
    expect(retained?.action).toBe("catalogue.publish");
    expect(retained?.entity_type).toBe("catalogue");
    expect(JSON.parse(retained?.metadata_json ?? "{}")).toEqual({
      revision: 1,
      source: "test",
    });
  });

  it("rejects moderation cases outside the catalogue tenant", async () => {
    await createOrganization(
      80201,
      "org_33333333333333333333333333333333",
      "Moderation Org A",
    );
    await createOrganization(
      80202,
      "org_44444444444444444444444444444444",
      "Moderation Org B",
    );
    await createCatalogue(
      80301,
      "cat_55555555555555555555555555555555",
      80201,
      "moderation-a",
    );

    await expect(
      createModerationCase({
        id: 80401,
        publicId: "mod_66666666666666666666666666666666",
        organizationId: 80202,
        catalogueId: 80301,
      }),
    ).rejects.toThrow();
  });

  it("enforces forward-only moderation status transitions", async () => {
    await createOrganization(
      80501,
      "org_77777777777777777777777777777777",
      "Moderation Status Org",
    );
    await createCatalogue(
      80601,
      "cat_88888888888888888888888888888888",
      80501,
      "moderation-status",
    );
    await createModerationCase({
      id: 80701,
      publicId: "mod_99999999999999999999999999999999",
      organizationId: 80501,
      catalogueId: 80601,
    });

    await env.DB.prepare(
      `UPDATE moderation_cases
       SET status = 'reviewing',
           updated_at = ?
       WHERE id = ?`,
    )
      .bind(now, 80701)
      .run();

    await env.DB.prepare(
      `UPDATE moderation_cases
       SET status = 'resolved',
           resolution_note = ?,
           resolved_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        "Review completed.",
        now,
        now,
        80701,
      )
      .run();

    await expect(
      env.DB.prepare(
        `UPDATE moderation_cases
         SET status = 'open',
             updated_at = ?
         WHERE id = ?`,
      )
        .bind(now, 80701)
        .run(),
    ).rejects.toThrow();
  });

  it("keeps moderation events append-only", async () => {
    await createOrganization(
      80801,
      "org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "Moderation Event Org",
    );
    await createCatalogue(
      80901,
      "cat_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      80801,
      "moderation-event",
    );
    await createModerationCase({
      id: 81001,
      publicId: "mod_cccccccccccccccccccccccccccccccc",
      organizationId: 80801,
      catalogueId: 80901,
    });

    await env.DB.prepare(
      `INSERT INTO moderation_case_events (
         id,
         moderation_case_id,
         event_type,
         note,
         created_at
       ) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        81101,
        81001,
        "note",
        "Initial moderation note.",
        now,
      )
      .run();

    await expect(
      env.DB.prepare(
        `UPDATE moderation_case_events
         SET note = ?
         WHERE id = ?`,
      )
        .bind("Changed note", 81101)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `DELETE FROM moderation_case_events
         WHERE id = ?`,
      )
        .bind(81101)
        .run(),
    ).rejects.toThrow();
  });

  it("keeps moderation repository reads inside the resolved tenant", async () => {
    await createOrganization(
      81201,
      "org_dddddddddddddddddddddddddddddddd",
      "Moderation Repository Org A",
    );
    await createOrganization(
      81202,
      "org_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "Moderation Repository Org B",
    );
    await createCatalogue(
      81301,
      "cat_ffffffffffffffffffffffffffffffff",
      81201,
      "moderation-repository-a",
    );
    await createCatalogue(
      81302,
      "cat_12121212121212121212121212121212",
      81202,
      "moderation-repository-b",
    );

    await createModerationCase({
      id: 81401,
      publicId: "mod_13131313131313131313131313131313",
      organizationId: 81201,
      catalogueId: 81301,
    });
    await createModerationCase({
      id: 81402,
      publicId: "mod_14141414141414141414141414141414",
      organizationId: 81202,
      catalogueId: 81302,
    });

    const tenantA = tenantContextFromResolvedMembership({
      organizationId: 81201,
      organizationPublicId: "org_dddddddddddddddddddddddddddddddd",
    });

    const repository = new ModerationCaseRepository(env.DB);

    await expect(
      repository.findByPublicId(
        tenantA,
        "mod_13131313131313131313131313131313",
      ),
    ).resolves.toMatchObject({
      id: 81401,
      status: "open",
      reasonCode: "other",
    });

    await expect(
      repository.findByPublicId(
        tenantA,
        "mod_14141414141414141414141414141414",
      ),
    ).resolves.toBeNull();
  });
});
