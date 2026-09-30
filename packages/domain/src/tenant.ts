declare const tenantContextBrand: unique symbol;

export type TenantContext = Readonly<{
  organizationId: number;
  organizationPublicId: string;
  [tenantContextBrand]: true;
}>;

export function tenantContextFromResolvedMembership(input: {
  organizationId: number;
  organizationPublicId: string;
}): TenantContext {
  if (!Number.isSafeInteger(input.organizationId) || input.organizationId <= 0) {
    throw new RangeError("organizationId must be a positive safe integer.");
  }

  if (input.organizationPublicId.trim().length === 0) {
    throw new RangeError("organizationPublicId is required.");
  }

  return Object.freeze({
    organizationId: input.organizationId,
    organizationPublicId: input.organizationPublicId,
  }) as TenantContext;
}
