import {
  tenantContextFromResolvedMembership,
  type TenantContext,
} from "@techabanca/domain";

type ResolvedTenantRow = {
  organization_id: number;
  organization_public_id: string;
};

export class TenantAccessRepository {
  constructor(private readonly db: D1Database) {}

  async resolveForUser(
    userId: number,
    organizationPublicId: string,
  ): Promise<TenantContext | null> {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return null;
    }

    const row = await this.db
      .prepare(
        `SELECT
           o.id AS organization_id,
           o.public_id AS organization_public_id
         FROM organizations o
         INNER JOIN organization_members m
           ON m.organization_id = o.id
         INNER JOIN users u
           ON u.id = m.user_id
         WHERE u.id = ?
           AND u.status = 'active'
           AND u.deleted_at IS NULL
           AND m.status = 'active'
           AND o.public_id = ?
           AND o.status = 'active'
           AND o.deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(userId, organizationPublicId)
      .first<ResolvedTenantRow>();

    if (!row) {
      return null;
    }

    return tenantContextFromResolvedMembership({
      organizationId: row.organization_id,
      organizationPublicId: row.organization_public_id,
    });
  }
}
