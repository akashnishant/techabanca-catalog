// Policy is re-evaluated inside both publication transactions, not only at the HTTP boundary.
// The opt-in no-subscription path is for local/prelaunch use; an existing subscription never falls back.
export const publicationPolicySql = `(
  EXISTS (
    SELECT 1 FROM subscriptions s JOIN subscription_plans plan ON plan.id = s.plan_id
    JOIN plan_entitlements e ON e.plan_id = s.plan_id
    WHERE s.organization_id = c.organization_id AND plan.is_active = 1
      AND s.status IN ('trialing', 'active') AND e.entitlement_key = 'catalogue.publish'
      AND e.value_type = 'boolean' AND e.boolean_value = 1
      AND (s.status <> 'trialing' OR s.trial_ends_at IS NULL OR s.trial_ends_at > ?)
      AND (s.current_period_ends_at IS NULL OR s.current_period_ends_at > ?)
  ) OR (? = 1 AND NOT EXISTS (SELECT 1 FROM subscriptions history WHERE history.organization_id = c.organization_id))
)`;
export const publicationActorSql = `EXISTS (
  SELECT 1 FROM organization_members member JOIN users actor ON actor.id = member.user_id
  WHERE member.organization_id = c.organization_id AND member.user_id = ?
    AND member.status = 'active' AND member.role IN ('owner', 'admin')
    AND actor.status = 'active' AND actor.deleted_at IS NULL
)`;
