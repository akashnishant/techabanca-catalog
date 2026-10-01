import { env } from "cloudflare:workers";
import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { CatalogueSlugRepository } from "../src/worker/repositories";

const now = "2026-10-01T16:00:00.000Z";
const deletedAt = "2026-10-01T16:05:00.000Z";

const ORGANIZATION_ID = 612001;
const ORGANIZATION_PUBLIC_ID =
  "org_61200161200161200161200161200161";

async function resetFixture() {
  await env.DB
    .prepare(
      `DELETE FROM organizations
       WHERE id = ?`,
    )
    .bind(ORGANIZATION_ID)
    .run();

  await env.DB
    .prepare(
      `INSERT INTO organizations (
         id,
         public_id,
         name,
         timezone,
         status,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, 'Asia/Kolkata', 'active', ?, ?)`,
    )
    .bind(
      ORGANIZATION_ID,
      ORGANIZATION_PUBLIC_ID,
      "Slug Lifecycle Test",
      now,
      now,
    )
    .run();
}

async function createCatalogue(
  id: number,
  publicId: string,
  slug: string,
  initialDeletedAt: string | null = null,
) {
  await env.DB
    .prepare(
      `INSERT INTO catalogues (
         id,
         public_id,
         organization_id,
         name,
         slug,
         mode,
         status,
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, ?, 'products', 'draft', ?, ?, ?)`,
    )
    .bind(
      id,
      publicId,
      ORGANIZATION_ID,
      `Catalogue ${id}`,
      slug,
      now,
      now,
      initialDeletedAt,
    )
    .run();
}

describe("catalogue slug lifecycle", () => {
  beforeEach(async () => {
    await resetFixture();
  });

  it("releases a public slug when a catalogue is soft deleted", async () => {
    await createCatalogue(
      612101,
      "cat_61210161210161210161210161210161",
      "precision-tools",
    );

    const repository =
      new CatalogueSlugRepository(env.DB);

    await expect(
      repository.checkAvailability(
        "precision-tools",
      ),
    ).resolves.toEqual({
      slug: "precision-tools",
      available: false,
      reason: "claimed",
    });

    await env.DB
      .prepare(
        `UPDATE catalogues
         SET
           deleted_at = ?,
           updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        deletedAt,
        deletedAt,
        612101,
      )
      .run();

    const deleted = await env.DB
      .prepare(
        `SELECT
           slug,
           released_slug,
           deleted_at
         FROM catalogues
         WHERE id = ?`,
      )
      .bind(612101)
      .first<{
        slug: string;
        released_slug: string | null;
        deleted_at: string | null;
      }>();

    expect(deleted).toEqual({
      slug: "deleted-612101",
      released_slug: "precision-tools",
      deleted_at: deletedAt,
    });

    await expect(
      repository.checkAvailability(
        "precision-tools",
      ),
    ).resolves.toEqual({
      slug: "precision-tools",
      available: true,
      reason: "available",
    });
  });

  it("allows a released slug to be claimed again while active duplicates remain blocked", async () => {
    await createCatalogue(
      612201,
      "cat_61220161220161220161220161220161",
      "industrial-pumps",
    );

    await expect(
      createCatalogue(
        612202,
        "cat_61220261220261220261220261220261",
        "industrial-pumps",
      ),
    ).rejects.toThrow();

    await env.DB
      .prepare(
        `UPDATE catalogues
         SET
           deleted_at = ?,
           updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        deletedAt,
        deletedAt,
        612201,
      )
      .run();

    await expect(
      createCatalogue(
        612202,
        "cat_61220261220261220261220261220261",
        "industrial-pumps",
      ),
    ).resolves.toBeUndefined();

    const active = await env.DB
      .prepare(
        `SELECT slug
         FROM catalogues
         WHERE id = ?`,
      )
      .bind(612202)
      .first<{ slug: string }>();

    expect(active?.slug).toBe(
      "industrial-pumps",
    );
  });

  it("keeps the deleted-* namespace internal at both repository and database boundaries", async () => {
    const repository =
      new CatalogueSlugRepository(env.DB);

    await expect(
      repository.checkAvailability(
        "deleted-612301",
      ),
    ).resolves.toEqual({
      slug: "deleted-612301",
      available: false,
      reason: "reserved",
    });

    await expect(
      createCatalogue(
        612301,
        "cat_61230161230161230161230161230161",
        "deleted-612301",
      ),
    ).rejects.toThrow();
  });

  it("normalizes an already-deleted insert into an internal tombstone while retaining its released slug", async () => {
    await createCatalogue(
      612401,
      "cat_61240161240161240161240161240161",
      "archived-machinery",
      deletedAt,
    );

    const row = await env.DB
      .prepare(
        `SELECT
           slug,
           released_slug,
           deleted_at
         FROM catalogues
         WHERE id = ?`,
      )
      .bind(612401)
      .first<{
        slug: string;
        released_slug: string | null;
        deleted_at: string | null;
      }>();

    expect(row).toEqual({
      slug: "deleted-612401",
      released_slug: "archived-machinery",
      deleted_at: deletedAt,
    });
  });
});
