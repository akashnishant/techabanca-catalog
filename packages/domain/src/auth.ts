export const USER_STATUSES = [
  "active",
  "suspended",
] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export const ORGANIZATION_MEMBER_ROLES = [
  "owner",
  "admin",
  "editor",
] as const;

export type OrganizationMemberRole =
  (typeof ORGANIZATION_MEMBER_ROLES)[number];

export const ORGANIZATION_MEMBER_STATUSES = [
  "active",
  "invited",
  "suspended",
] as const;

export type OrganizationMemberStatus =
  (typeof ORGANIZATION_MEMBER_STATUSES)[number];

export function isUserStatus(
  value: string,
): value is UserStatus {
  return (USER_STATUSES as readonly string[]).includes(value);
}

export function isOrganizationMemberRole(
  value: string,
): value is OrganizationMemberRole {
  return (ORGANIZATION_MEMBER_ROLES as readonly string[]).includes(value);
}

export function isOrganizationMemberStatus(
  value: string,
): value is OrganizationMemberStatus {
  return (ORGANIZATION_MEMBER_STATUSES as readonly string[]).includes(value);
}

export function normalizeLoginEmail(value: string): string {
  return value.trim().toLowerCase();
}
