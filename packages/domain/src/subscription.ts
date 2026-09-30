export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
] as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUSES)[number];

export const ENTITLEMENT_VALUE_TYPES = [
  "boolean",
  "integer",
  "string",
] as const;

export type EntitlementValueType =
  (typeof ENTITLEMENT_VALUE_TYPES)[number];

export type EntitlementValue = boolean | number | string;

export function isSubscriptionStatus(
  value: string,
): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

export function isEntitlementValueType(
  value: string,
): value is EntitlementValueType {
  return (ENTITLEMENT_VALUE_TYPES as readonly string[]).includes(value);
}

export function subscriptionGrantsEntitlements(
  status: SubscriptionStatus,
): boolean {
  return status === "trialing" || status === "active";
}
