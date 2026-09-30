import type {
  SubscriptionStatus,
  TenantContext,
} from "@techabanca/domain";

export type CurrentSubscriptionRecord = {
  id: number;
  publicId: string;
  planId: number;
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  billingInterval: "monthly" | "annual" | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
};

type CurrentSubscriptionRow = {
  id: number;
  public_id: string;
  plan_id: number;
  plan_code: string;
  plan_name: string;
  status: SubscriptionStatus;
  billing_interval: "monthly" | "annual" | null;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  cancel_at_period_end: number;
};

export class SubscriptionRepository {
  constructor(private readonly db: D1Database) {}

  async findCurrent(
    tenant: TenantContext,
  ): Promise<CurrentSubscriptionRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           s.id,
           s.public_id,
           s.plan_id,
           p.code AS plan_code,
           p.name AS plan_name,
           s.status,
           s.billing_interval,
           s.trial_ends_at,
           s.current_period_ends_at,
           s.cancel_at_period_end
         FROM subscriptions s
         INNER JOIN subscription_plans p
           ON p.id = s.plan_id
         WHERE s.organization_id = ?
           AND s.status IN ('trialing', 'active', 'past_due')
         LIMIT 1`,
      )
      .bind(tenant.organizationId)
      .first<CurrentSubscriptionRow>();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      publicId: row.public_id,
      planId: row.plan_id,
      planCode: row.plan_code,
      planName: row.plan_name,
      status: row.status,
      billingInterval: row.billing_interval,
      trialEndsAt: row.trial_ends_at,
      currentPeriodEndsAt: row.current_period_ends_at,
      cancelAtPeriodEnd: row.cancel_at_period_end === 1,
    };
  }
}
