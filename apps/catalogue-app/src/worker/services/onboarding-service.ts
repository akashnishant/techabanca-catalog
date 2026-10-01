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

export type OnboardingContactsInput = {
  phone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
};

export type OnboardingContactsResult =
  | {
      kind: "updated";
      state: OnboardingState;
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "invalid";
    }
  | {
      kind: "prerequisite_required";
    };

function cleanRequiredText(
  value: string,
): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizedPhone(
  value: string | null,
): string | null {
  if (value === null) {
    return null;
  }

  const normalized =
    value.trim().replace(/\s+/g, " ");

  if (normalized.length === 0) {
    return null;
  }

  const digits =
    normalized.replace(/\D/g, "");

  if (
    normalized.length > 40
    || digits.length < 5
    || digits.length > 20
    || !/^[0-9+().\-\s]+$/.test(normalized)
  ) {
    throw new Error("invalid_phone");
  }

  return normalized;
}

function normalizedWhatsapp(
  value: string | null,
): string | null {
  if (value === null) {
    return null;
  }

  const compact = value
    .trim()
    .replace(/[\s().-]/g, "");

  if (compact.length === 0) {
    return null;
  }

  const digits = compact.startsWith("+")
    ? compact.slice(1)
    : compact;

  if (
    !/^\d+$/.test(digits)
    || digits.length < 7
    || digits.length > 15
  ) {
    throw new Error("invalid_whatsapp");
  }

  return compact.startsWith("+")
    ? `+${digits}`
    : digits;
}

function normalizedEmail(
  value: string | null,
): string | null {
  if (value === null) {
    return null;
  }

  const normalized =
    value.trim().toLowerCase();

  if (normalized.length === 0) {
    return null;
  }

  if (
    normalized.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalized,
    )
  ) {
    throw new Error("invalid_email");
  }

  return normalized;
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

  async updateContacts(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    input: OnboardingContactsInput,
    now: Date,
  ): Promise<OnboardingContactsResult> {
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

    if (!state.progress.catalogueStarted) {
      return {
        kind: "prerequisite_required",
      };
    }

    try {
      const phone =
        input.phone === undefined
          ? state.profile.phone
          : normalizedPhone(input.phone);

      const whatsappNumber =
        input.whatsappNumber === undefined
          ? state.profile.whatsappNumber
          : normalizedWhatsapp(
              input.whatsappNumber,
            );

      const email =
        input.email === undefined
          ? state.profile.email
          : normalizedEmail(input.email);

      if (
        phone === null
        && whatsappNumber === null
        && email === null
      ) {
        return {
          kind: "invalid",
        };
      }

      const updated =
        await this.repository.updateContacts(
          tenant,
          {
            phone,
            whatsappNumber,
            email,
            updatedAt: now.toISOString(),
          },
        );

      if (!updated) {
        throw new Error(
          "onboarding_profile_missing",
        );
      }

      return {
        kind: "updated",
        state: await this.repository.getState(
          tenant,
        ),
      };
    } catch (error) {
      if (
        error instanceof Error
        && (
          error.message === "invalid_phone"
          || error.message ===
            "invalid_whatsapp"
          || error.message === "invalid_email"
        )
      ) {
        return {
          kind: "invalid",
        };
      }

      throw error;
    }
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
