import type { TenantContext } from "@techabanca/domain";

export type AppendAuditEventInput = {
  actorUserId?: number | null;
  actorType: "user" | "system" | "admin";
  action: string;
  entityType: string;
  entityPublicId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export class AuditEventRepository {
  constructor(private readonly db: D1Database) {}

  async append(
    tenant: TenantContext,
    input: AppendAuditEventInput,
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO audit_events (
           organization_id,
           actor_user_id,
           actor_type,
           action,
           entity_type,
           entity_public_id,
           request_id,
           metadata_json,
           created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        tenant.organizationId,
        input.actorUserId ?? null,
        input.actorType,
        input.action,
        input.entityType,
        input.entityPublicId ?? null,
        input.requestId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.createdAt,
      )
      .run();
  }
}
