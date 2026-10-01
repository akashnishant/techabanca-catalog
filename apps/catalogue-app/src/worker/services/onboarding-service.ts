import {
  createPublicId,
  normalizeItemSlug,
  type OrganizationMemberRole,
  type TenantContext,
} from "@techabanca/domain";
import type {
  CatalogueSlugAvailability,
  CatalogueSlugRepository,
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

export type OnboardingThemeResult =
  | {
      kind: "updated";
      state: OnboardingState;
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "unavailable";
    }
  | {
      kind: "prerequisite_required";
    };

export type OnboardingFirstItemInput = {
  name: string;
  itemType?: "product" | "service";
  shortDescription?: string | null;
};

export type OnboardingFirstItemResult =
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
      kind: "already_complete";
    }
  | {
      kind: "prerequisite_required";
    };

export type OnboardingSlugAvailabilityResult =
  | {
      kind: "checked";
      availability: CatalogueSlugAvailability;
    }
  | {
      kind: "prerequisite_required";
    };

export type OnboardingSlugClaimResult =
  | {
      kind: "updated";
      state: OnboardingState;
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "unavailable";
      availability: CatalogueSlugAvailability;
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
    private readonly slugRepository: CatalogueSlugRepository,
  ) {}

  state(
    tenant: TenantContext,
  ): Promise<OnboardingState> {
    return this.repository.getState(tenant);
  }

  async createFirstItem(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    input: OnboardingFirstItemInput,
    now: Date,
  ): Promise<OnboardingFirstItemResult> {
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
      !state.progress.themeComplete
      || state.catalogue === null
    ) {
      return {
        kind: "prerequisite_required",
      };
    }

    if (state.progress.firstItemComplete) {
      return {
        kind: "already_complete",
      };
    }

    const name =
      cleanRequiredText(input.name);

    if (
      name.length < 1
      || name.length > 180
    ) {
      return {
        kind: "invalid",
      };
    }

    const shortDescription =
      input.shortDescription === undefined
      || input.shortDescription === null
        ? null
        : input.shortDescription
            .trim()
            .replace(/\s+/g, " ");

    if (
      shortDescription !== null
      && shortDescription.length > 500
    ) {
      return {
        kind: "invalid",
      };
    }

    let itemType: "product" | "service";

    if (state.catalogue.mode === "products") {
      if (
        input.itemType !== undefined
        && input.itemType !== "product"
      ) {
        return {
          kind: "invalid",
        };
      }

      itemType = "product";
    } else if (
      state.catalogue.mode === "services"
    ) {
      if (
        input.itemType !== undefined
        && input.itemType !== "service"
      ) {
        return {
          kind: "invalid",
        };
      }

      itemType = "service";
    } else {
      if (
        input.itemType !== "product"
        && input.itemType !== "service"
      ) {
        return {
          kind: "invalid",
        };
      }

      itemType = input.itemType;
    }

    const publicId = createPublicId("itm");
    const normalizedSlug =
      normalizeItemSlug(name);

    const slug =
      normalizedSlug.length > 0
        ? normalizedSlug
        : `item-${publicId.slice(4, 12)}`;

    const created =
      await this.repository.createFirstItem(
        tenant,
        {
          publicId,
          cataloguePublicId:
            state.catalogue.id,
          itemType,
          name,
          slug,
          shortDescription:
            shortDescription?.length
              ? shortDescription
              : null,
          updatedAt: now.toISOString(),
        },
      );

    if (!created) {
      const refreshed =
        await this.repository.getState(tenant);

      if (
        refreshed.progress.firstItemComplete
      ) {
        return {
          kind: "already_complete",
        };
      }

      throw new Error(
        "first_item_create_failed",
      );
    }

    return {
      kind: "updated",
      state: await this.repository.getState(
        tenant,
      ),
    };
  }

  async slugAvailability(
    tenant: TenantContext,
    candidate: string,
  ): Promise<OnboardingSlugAvailabilityResult> {
    const state =
      await this.repository.getState(tenant);

    if (
      !state.progress.themeComplete
      || state.catalogue === null
    ) {
      return {
        kind: "prerequisite_required",
      };
    }

    return {
      kind: "checked",
      availability:
        await this.slugRepository
          .checkAvailabilityForCatalogue(
            candidate,
            tenant,
            state.catalogue.id,
          ),
    };
  }

  async claimSlug(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    candidate: string,
    now: Date,
  ): Promise<OnboardingSlugClaimResult> {
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
      !state.progress.themeComplete
      || state.catalogue === null
    ) {
      return {
        kind: "prerequisite_required",
      };
    }

    const availability =
      await this.slugRepository
        .checkAvailabilityForCatalogue(
          candidate,
          tenant,
          state.catalogue.id,
        );

    if (!availability.available) {
      return {
        kind: "unavailable",
        availability,
      };
    }

    try {
      const claimed =
        await this.repository.claimCatalogueSlug(
          tenant,
          {
            cataloguePublicId:
              state.catalogue.id,
            slug: availability.slug,
            updatedAt: now.toISOString(),
          },
        );

      if (!claimed) {
        const after =
          await this.slugRepository
            .checkAvailabilityForCatalogue(
              candidate,
              tenant,
              state.catalogue.id,
            );

        if (!after.available) {
          return {
            kind: "unavailable",
            availability: after,
          };
        }

        throw new Error(
          "catalogue_slug_claim_failed",
        );
      }
    } catch (error) {
      const after =
        await this.slugRepository
          .checkAvailabilityForCatalogue(
            candidate,
            tenant,
            state.catalogue.id,
          );

      if (!after.available) {
        return {
          kind: "unavailable",
          availability: after,
        };
      }

      throw error;
    }

    return {
      kind: "updated",
      state: await this.repository.getState(
        tenant,
      ),
    };
  }

  async updateTheme(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    themeCode: string,
    now: Date,
  ): Promise<OnboardingThemeResult> {
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
      !state.progress.catalogueStarted
      || !state.progress.contactsComplete
      || state.catalogue === null
    ) {
      return {
        kind: "prerequisite_required",
      };
    }

    const normalizedCode =
      themeCode.trim().toLowerCase();

    const updated =
      await this.repository.upsertTheme(
        tenant,
        {
          cataloguePublicId:
            state.catalogue.id,
          themeCode: normalizedCode,
          updatedAt: now.toISOString(),
        },
      );

    if (!updated) {
      return {
        kind: "unavailable",
      };
    }

    return {
      kind: "updated",
      state: await this.repository.getState(
        tenant,
      ),
    };
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
