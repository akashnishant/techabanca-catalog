import type { SubscriptionStatus } from "./subscription";

export const TRIAL_DAYS = 14;
export type BillingInterval = "monthly" | "annual";
export type SubscriptionView = {
  subscription: null | { id: string; planName: string; status: SubscriptionStatus; effectiveStatus: SubscriptionStatus;
    trialEndsAt: string | null; periodEndsAt: string | null; cancelAtPeriodEnd: boolean; version: number;
    interval: BillingInterval | null; amount: number | null; currency: string | null; provider: boolean };
  trialAvailable: boolean; canManage: boolean; canPublish: boolean;
  paymentMode: "disabled" | "test";
  checkout: null | { id: string; status: "creating" | "ready" | "unknown"; url: string | null; subscriptionId: string; version: number | null };
  offers: Array<{ id: string; name: string; interval: BillingInterval; amount: number; currency: string; cycles: number }>;
  usage: { items: number; categories: number; storageBytes: number; enquiries: number };
  limits: Record<string, boolean | number | string>;
};

export function hasSubscriptionAccess(record: { status: SubscriptionStatus; trialStartsAt?: string | null;
  trialEndsAt?: string | null; periodStartsAt?: string | null; periodEndsAt?: string | null; paidVerified?: boolean }, now = new Date()): boolean {
  const time = now.getTime();
  const within = (start?: string | null, end?: string | null) => !!start && !!end
    && Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end))
    && Date.parse(start) <= time && Date.parse(end) > time && Date.parse(end) > Date.parse(start);
  if (record.status === "trialing") return within(record.trialStartsAt, record.trialEndsAt);
  if (record.status === "active" || (record.paidVerified && (record.status === "past_due" || record.status === "canceled")))
    return within(record.periodStartsAt, record.periodEndsAt);
  return false;
}

// Alias is supplied by application code, never user input. Four bound ISO timestamps are required.
export function subscriptionAccessSql(alias = "s"): string {
  if (!/^[a-z]+$/.test(alias)) throw new Error("invalid_sql_alias");
  const s = alias;
  return `(((${s}.status = 'trialing' AND ${s}.trial_starts_at <= ? AND ${s}.trial_ends_at > ?)
    OR ((${s}.status = 'active' OR (${s}.paid_verified = 1 AND ${s}.status IN ('past_due', 'canceled')))
      AND ${s}.current_period_starts_at <= ? AND ${s}.current_period_ends_at > ?)))`;
}

// Public requests use database time and recheck the policy inside enquiry inserts.
// c and o are trusted source catalogue/organization aliases, never request data.
export function publicSubscriptionSql(allowLegacyLocal = false): string {
  const live = subscriptionAccessSql().replace(/\?/g, "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  return `(EXISTS (SELECT 1 FROM subscriptions s JOIN subscription_plans plan ON plan.id = s.plan_id
    JOIN plan_entitlements e ON e.plan_id = s.plan_id WHERE s.organization_id = c.organization_id AND plan.is_active = 1
    AND e.entitlement_key = 'catalogue.publish' AND e.value_type = 'boolean' AND e.boolean_value = 1 AND ${live})
    ${allowLegacyLocal ? "OR (NOT EXISTS (SELECT 1 FROM subscriptions history WHERE history.organization_id = c.organization_id) AND NOT EXISTS (SELECT 1 FROM organization_trials trial WHERE trial.organization_id = c.organization_id) AND NOT EXISTS (SELECT 1 FROM subscription_checkouts checkout WHERE checkout.organization_id = c.organization_id))" : ""})`;
}

export async function webhookSignatureValid(body: Uint8Array, signature: string | null, secrets: string[]): Promise<boolean> {
  if (!signature || !/^[a-f0-9]{64}$/.test(signature) || secrets.length < 1 || secrets.length > 2) return false;
  const signed = Uint8Array.from(signature.match(/../g)!, part => parseInt(part, 16));
  let valid = false;
  for (const secret of secrets) {
    if (secret.length < 32 || secret.length > 256) continue;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    valid = (await crypto.subtle.verify("HMAC", key, signed, Uint8Array.from(body))) || valid;
  }
  return valid;
}
