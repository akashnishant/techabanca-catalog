import {
  tenantContextFromResolvedMembership,
  type OrganizationMemberRole,
  type TenantContext,
} from "@techabanca/domain";

type ResolvedTenantAccessRow = {
  organization_id: number;
  organization_public_id: string;
  organization_name: string;
  role: OrganizationMemberRole;
};

type ActiveTenantMembershipRow = {
  organization_public_id: string;
  organization_name: string;
  role: OrganizationMemberRole;
};

export type ResolvedTenantAccess = {
  tenant: TenantContext;
  organizationName: string;
  role: OrganizationMemberRole;
};

export type ActiveTenantMembership = {
  organizationPublicId: string;
  organizationName: string;
  role: OrganizationMemberRole;
};

export class TenantAccessRepository {
  constructor(private readonly db: D1Database) {}

  async listForUser(
    userId: number,
  ): Promise<ActiveTenantMembership[]> {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return [];
    }

    const result = await this.db
      .prepare(
        `SELECT
           o.public_id AS organization_public_id,
           o.name AS organization_name,
           m.role
         FROM organization_members m
         INNER JOIN organizations o
           ON o.id = m.organization_id
         INNER JOIN users u
           ON u.id = m.user_id
         WHERE u.id = ?
           AND u.status = 'active'
           AND u.deleted_at IS NULL
           AND m.status = 'active'
           AND o.status = 'active'
           AND o.deleted_at IS NULL
         ORDER BY o.name COLLATE NOCASE ASC, o.public_id ASC`,
      )
      .bind(userId)
      .all<ActiveTenantMembershipRow>();

    return result.results.map((row) => ({
      organizationPublicId: row.organization_public_id,
      organizationName: row.organization_name,
      role: row.role,
    }));
  }

  async resolveAccessForUser(
    userId: number,
    organizationPublicId: string,
  ): Promise<ResolvedTenantAccess | null> {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return null;
    }

    const row = await this.db
      .prepare(
        `SELECT
           o.id AS organization_id,
           o.public_id AS organization_public_id,
           o.name AS organization_name,
           m.role
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
      .first<ResolvedTenantAccessRow>();

    if (!row) {
      return null;
    }

    return {
      tenant: tenantContextFromResolvedMembership({
        organizationId: row.organization_id,
        organizationPublicId: row.organization_public_id,
      }),
      organizationName: row.organization_name,
      role: row.role,
    };
  }

  async resolveForUser(
    userId: number,
    organizationPublicId: string,
  ): Promise<TenantContext | null> {
    const access = await this.resolveAccessForUser(
      userId,
      organizationPublicId,
    );

    return access?.tenant ?? null;
  }
}
