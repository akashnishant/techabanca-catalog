import {
  isValidCatalogueSlug,
  normalizeCatalogueSlug,
} from "@techabanca/domain";

export type CatalogueSlugAvailability = {
  slug: string;
  available: boolean;
  reason: "available" | "invalid" | "reserved" | "claimed";
};

export class CatalogueSlugRepository {
  constructor(private readonly db: D1Database) {}

  async checkAvailability(
    candidate: string,
    excludeCatalogueId?: number,
  ): Promise<CatalogueSlugAvailability> {
    const slug = normalizeCatalogueSlug(candidate);

    if (!isValidCatalogueSlug(slug)) {
      return {
        slug,
        available: false,
        reason: "invalid",
      };
    }

    const reserved = await this.db
      .prepare(
        `SELECT slug
         FROM reserved_slugs
         WHERE slug = ?
         LIMIT 1`,
      )
      .bind(slug)
      .first<{ slug: string }>();

    if (reserved) {
      return {
        slug,
        available: false,
        reason: "reserved",
      };
    }

    const claimed = excludeCatalogueId
      ? await this.db
          .prepare(
            `SELECT id
             FROM catalogues
             WHERE slug = ?
               AND id <> ?
               AND deleted_at IS NULL
             LIMIT 1`,
          )
          .bind(slug, excludeCatalogueId)
          .first<{ id: number }>()
      : await this.db
          .prepare(
            `SELECT id
             FROM catalogues
             WHERE slug = ?
               AND deleted_at IS NULL
             LIMIT 1`,
          )
          .bind(slug)
          .first<{ id: number }>();

    return {
      slug,
      available: !claimed,
      reason: claimed ? "claimed" : "available",
    };
  }
}
