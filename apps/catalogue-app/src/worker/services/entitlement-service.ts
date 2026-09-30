import {
  subscriptionGrantsEntitlements,
  type EntitlementValue,
  type TenantContext,
} from "@techabanca/domain";

type EntitlementRow = {
  status: "trialing" | "active" | "past_due";
  value_type: "boolean" | "integer" | "string";
  boolean_value: number | null;
  integer_value: number | null;
  string_value: string | null;
};

export class EntitlementService {
  constructor(private readonly db: D1Database) {}

  async get(
    tenant: TenantContext,
    entitlementKey: string,
  ): Promise<EntitlementValue | null> {
    const row = await this.db
      .prepare(
        `SELECT
           s.status,
           e.value_type,
           e.boolean_value,
           e.integer_value,
           e.string_value
         FROM subscriptions s
         INNER JOIN plan_entitlements e
           ON e.plan_id = s.plan_id
         WHERE s.organization_id = ?
           AND s.status IN ('trialing', 'active', 'past_due')
           AND e.entitlement_key = ?
         LIMIT 1`,
      )
      .bind(tenant.organizationId, entitlementKey)
      .first<EntitlementRow>();

    if (!row || !subscriptionGrantsEntitlements(row.status)) {
      return null;
    }

    if (row.value_type === "boolean") {
      return row.boolean_value === 1;
    }

    if (row.value_type === "integer") {
      return row.integer_value;
    }

    return row.string_value;
  }

  async isEnabled(
    tenant: TenantContext,
    entitlementKey: string,
  ): Promise<boolean> {
    return (await this.get(tenant, entitlementKey)) === true;
  }

  async getIntegerLimit(
    tenant: TenantContext,
    entitlementKey: string,
  ): Promise<number | null> {
    const value = await this.get(tenant, entitlementKey);
    return typeof value === "number" ? value : null;
  }
}
