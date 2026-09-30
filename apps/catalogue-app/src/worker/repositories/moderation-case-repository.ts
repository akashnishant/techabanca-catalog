import type {
  ModerationStatus,
  TenantContext,
} from "@techabanca/domain";

export type ModerationCaseRecord = {
  id: number;
  publicId: string;
  catalogueId: number;
  status: ModerationStatus;
  reasonCode: string;
  summary: string;
  resolutionNote: string | null;
  openedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

type ModerationCaseRow = {
  id: number;
  public_id: string;
  catalogue_id: number;
  status: ModerationStatus;
  reason_code: string;
  summary: string;
  resolution_note: string | null;
  opened_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export class ModerationCaseRepository {
  constructor(private readonly db: D1Database) {}

  async findByPublicId(
    tenant: TenantContext,
    moderationPublicId: string,
  ): Promise<ModerationCaseRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           id,
           public_id,
           catalogue_id,
           status,
           reason_code,
           summary,
           resolution_note,
           opened_at,
           updated_at,
           resolved_at
         FROM moderation_cases
         WHERE organization_id = ?
           AND public_id = ?
         LIMIT 1`,
      )
      .bind(tenant.organizationId, moderationPublicId)
      .first<ModerationCaseRow>();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      publicId: row.public_id,
      catalogueId: row.catalogue_id,
      status: row.status,
      reasonCode: row.reason_code,
      summary: row.summary,
      resolutionNote: row.resolution_note,
      openedAt: row.opened_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
    };
  }
}
