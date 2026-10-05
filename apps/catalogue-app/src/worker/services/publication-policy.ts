// Re-evaluated inside publication transactions. Clock keeps the existing two date bindings.
export const publicationPolicySql = `(
  EXISTS (
    SELECT 1 FROM (SELECT ? AS trial_now, ? AS paid_now) clock, subscriptions s
    JOIN subscription_plans plan ON plan.id = s.plan_id JOIN plan_entitlements e ON e.plan_id = s.plan_id
    WHERE s.organization_id = c.organization_id AND plan.is_active = 1
      AND e.entitlement_key = 'catalogue.publish' AND e.value_type = 'boolean' AND e.boolean_value = 1
      AND ((s.status = 'trialing' AND s.trial_starts_at <= clock.trial_now AND s.trial_ends_at > clock.trial_now)
        OR ((s.status = 'active' OR (s.paid_verified = 1 AND s.status IN ('past_due', 'canceled')))
          AND s.current_period_starts_at <= clock.paid_now AND s.current_period_ends_at > clock.paid_now))
      AND NOT EXISTS (SELECT 1 FROM plan_entitlements limit_e WHERE limit_e.plan_id = s.plan_id AND limit_e.entitlement_key = 'items.max'
        AND limit_e.value_type = 'integer' AND limit_e.integer_value < (SELECT COUNT(*) FROM catalogue_items i WHERE i.catalogue_id = c.id AND i.deleted_at IS NULL))
      AND NOT EXISTS (SELECT 1 FROM plan_entitlements limit_e WHERE limit_e.plan_id = s.plan_id AND limit_e.entitlement_key = 'storage.bytes.max'
        AND limit_e.value_type = 'integer' AND limit_e.integer_value < (SELECT COALESCE(SUM(a.byte_size), 0) FROM assets a WHERE a.organization_id = c.organization_id AND a.status = 'ready' AND a.deleted_at IS NULL))
  ) OR (? = 1 AND NOT EXISTS (SELECT 1 FROM subscriptions history WHERE history.organization_id = c.organization_id)
    AND NOT EXISTS (SELECT 1 FROM organization_trials trial WHERE trial.organization_id = c.organization_id)
    AND NOT EXISTS (SELECT 1 FROM subscription_checkouts checkout WHERE checkout.organization_id = c.organization_id))
)`;
export const publicationActorSql = `EXISTS (
  SELECT 1 FROM organization_members member JOIN users actor ON actor.id = member.user_id
  WHERE member.organization_id = c.organization_id AND member.user_id = ?
    AND member.status = 'active' AND member.role IN ('owner', 'admin')
    AND actor.status = 'active' AND actor.deleted_at IS NULL
)`;
