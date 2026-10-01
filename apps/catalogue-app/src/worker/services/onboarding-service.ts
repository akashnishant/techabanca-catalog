import type {
  OrganizationMemberRole,
  TenantContext,
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
