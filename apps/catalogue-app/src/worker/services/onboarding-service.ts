import {
  createPublicId,
  type OrganizationMemberRole,
  type TenantContext,
} from "@techabanca/domain";
import type {
  OnboardingRepository,
  OnboardingState,
} from "../repositories";

export type OnboardingIdentityInput = {
  businessName: string;
  countryCode: string;
  city: string;
};

export type OnboardingIdentityResult =
  | {
      kind: "updated";
      state: OnboardingState;
    }
  | {
      kind: "forbidden";
    };

export type OnboardingBusinessTypeResult =
  | {
      kind: "updated";
      state: OnboardingState;
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "unavailable";
    };

export type OnboardingCatalogueMode =
  | "products"
  | "services"
  | "both";

export type OnboardingCatalogueModeResult =
  | {
      kind: "updated";
      state: OnboardingState;
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "prerequisite_required";
    };

function cleanRequiredText(
  value: string,
): string {
  return value.trim().replace(/\s+/g, " ");
}

export class OnboardingService {
  constructor(
    private readonly repository: OnboardingRepository,
  ) {}

  state(
    tenant: TenantContext,
  ): Promise<OnboardingState> {
    return this.repository.getState(tenant);
  }

  async updateCatalogueMode(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    mode: OnboardingCatalogueMode,
    now: Date,
  ): Promise<OnboardingCatalogueModeResult> {
    if (role === "editor") {
      return {
        kind: "forbidden",
      };
    }

    if (Number.isNaN(now.getTime())) {
      throw new Error("invalid_date");
    }

    const state =
      await this.repository.getState(tenant);

    if (
      !state.progress.identityComplete
      || !state.progress.businessTypeComplete
    ) {
      return {
        kind: "prerequisite_required",
      };
    }

    const publicId =
      state.catalogue?.id
      ?? createPublicId("cat");

    const internalSlug =
      `draft-${publicId.slice(4).toLowerCase()}`;

    await this.repository.upsertCatalogueMode(
      tenant,
      {
        publicId,
        name: state.profile.businessName,
        internalSlug,
        mode,
        updatedAt: now.toISOString(),
      },
    );

    return {
      kind: "updated",
      state: await this.repository.getState(tenant),
    };
  }

  async updateBusinessType(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    businessTypeCode: string,
    now: Date,
  ): Promise<OnboardingBusinessTypeResult> {
    if (role === "editor") {
      return {
        kind: "forbidden",
      };
    }

    if (Number.isNaN(now.getTime())) {
      throw new Error("invalid_date");
    }

    const normalizedCode =
      businessTypeCode.trim().toLowerCase();

    const updated =
      await this.repository.updateBusinessType(
        tenant,
        normalizedCode,
        now.toISOString(),
      );

    if (!updated) {
      return {
        kind: "unavailable",
      };
    }

    return {
      kind: "updated",
      state: await this.repository.getState(tenant),
    };
  }

  async updateIdentity(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    input: OnboardingIdentityInput,
    now: Date,
  ): Promise<OnboardingIdentityResult> {
    if (role === "editor") {
      return {
        kind: "forbidden",
      };
    }

    if (Number.isNaN(now.getTime())) {
      throw new Error("invalid_date");
    }

    const businessName =
      cleanRequiredText(input.businessName);
    const countryCode =
      input.countryCode.trim().toUpperCase();
    const city =
      cleanRequiredText(input.city);

    await this.repository.updateIdentity(
      tenant,
      {
        businessName,
        countryCode,
        city,
        updatedAt: now.toISOString(),
      },
    );

    return {
      kind: "updated",
      state: await this.repository.getState(tenant),
    };
  }
}
