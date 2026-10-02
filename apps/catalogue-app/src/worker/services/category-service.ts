import {
  createPublicId,
  hasPublicIdPrefix,
  isValidItemSlug,
  normalizeItemSlug,
  type OrganizationMemberRole,
  type TenantContext,
} from "@techabanca/domain";
import type {
  AuthoringCatalogueRecord,
  CategoryRecord,
  CategoryRepository,
} from "../repositories";

export type CategoryCreateInput = {
  name: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
};

export type CategoryUpdateInput = {
  version: number;
  name?: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
};

export type CategoryDeleteInput = {
  version: number;
};

export type CategoryListResult =
  | {
      kind: "listed";
      catalogue: AuthoringCatalogueRecord;
      categories: CategoryRecord[];
    }
  | {
      kind: "catalogue_required";
    };

export type CategoryGetResult =
  | {
      kind: "found";
      category: CategoryRecord;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "invalid";
    };

export type CategoryMutationFailure = {
  kind:
    | "forbidden"
    | "catalogue_required"
    | "invalid"
    | "not_found"
    | "invalid_parent"
    | "slug_conflict"
    | "version_conflict"
    | "has_children";
};

export type CategoryCreateResult =
  | {
      kind: "created";
      category: CategoryRecord;
    }
  | CategoryMutationFailure;

export type CategoryUpdateResult =
  | {
      kind: "updated";
      category: CategoryRecord;
    }
  | CategoryMutationFailure;

export type CategoryMutationResult =
  | CategoryCreateResult
  | CategoryUpdateResult;

export type CategoryDeleteResult =
  | {
      kind: "deleted";
    }
  | {
      kind:
        | "forbidden"
        | "invalid"
        | "not_found"
        | "version_conflict";
    };

function canMutate(role: OrganizationMemberRole): boolean {
  return role === "owner" || role === "admin";
}

function cleanRequiredText(
  value: string,
  maxLength: number,
): string | null {
  const normalized =
    value.trim().replace(/\s+/g, " ");

  if (
    normalized.length < 1
    || normalized.length > maxLength
  ) {
    return null;
  }

  return normalized;
}

function cleanDescription(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length > 2000) {
    throw new Error("invalid_category_description");
  }

  return normalized;
}

function validSortOrder(value: number): boolean {
  return Number.isInteger(value)
    && value >= 0
    && value <= 1_000_000;
}

function validVersion(value: number): boolean {
  return Number.isInteger(value)
    && value >= 1;
}

function isoTimestamp(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    throw new Error("invalid_date");
  }

  return now.toISOString();
}

export class CategoryService {
  constructor(
    private readonly repository: CategoryRepository,
  ) {}

  async list(
    tenant: TenantContext,
  ): Promise<CategoryListResult> {
    const catalogue =
      await this.repository.findCatalogueForTenant(
        tenant,
      );

    if (!catalogue) {
      return {
        kind: "catalogue_required",
      };
    }

    return {
      kind: "listed",
      catalogue,
      categories: await this.repository.list(
        tenant,
        catalogue.id,
      ),
    };
  }

  async get(
    tenant: TenantContext,
    categoryPublicId: string,
  ): Promise<CategoryGetResult> {
    if (
      !hasPublicIdPrefix(
        categoryPublicId,
        "ctg",
      )
    ) {
      return {
        kind: "invalid",
      };
    }

    const category =
      await this.repository.findByPublicId(
        tenant,
        categoryPublicId,
      );

    return category
      ? {
          kind: "found",
          category,
        }
      : {
          kind: "not_found",
        };
  }

  async create(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    input: CategoryCreateInput,
    now: Date,
  ): Promise<CategoryCreateResult> {
    if (!canMutate(role)) {
      return {
        kind: "forbidden",
      };
    }

    const catalogue =
      await this.repository.findCatalogueForTenant(
        tenant,
      );

    if (!catalogue) {
      return {
        kind: "catalogue_required",
      };
    }

    const name = cleanRequiredText(
      input.name,
      120,
    );

    let description: string | null;

    try {
      description =
        cleanDescription(input.description) ?? null;
    } catch {
      return {
        kind: "invalid",
      };
    }

    const sortOrder = input.sortOrder ?? 0;
    const isVisible = input.isVisible ?? true;

    if (
      !name
      || !validSortOrder(sortOrder)
    ) {
      return {
        kind: "invalid",
      };
    }

    const slug = normalizeItemSlug(
      input.slug ?? name,
    );

    if (!isValidItemSlug(slug)) {
      return {
        kind: "invalid",
      };
    }

    let parentId: number | null = null;

    if (input.parentId !== undefined && input.parentId !== null) {
      if (!hasPublicIdPrefix(input.parentId, "ctg")) {
        return {
          kind: "invalid_parent",
        };
      }

      const parent =
        await this.repository.findByPublicId(
          tenant,
          input.parentId,
        );

      if (
        !parent
        || parent.catalogueId !== catalogue.id
        || parent.parentId !== null
      ) {
        return {
          kind: "invalid_parent",
        };
      }

      parentId = parent.id;
    }

    if (
      await this.repository.slugExists(
        tenant,
        catalogue.id,
        slug,
      )
    ) {
      return {
        kind: "slug_conflict",
      };
    }

    let created: CategoryRecord | null;

    try {
      created = await this.repository.create(
        tenant,
        {
          publicId: createPublicId("ctg"),
          catalogueId: catalogue.id,
          parentId,
          name,
          slug,
          description: description ?? null,
          sortOrder,
          isVisible,
          now: isoTimestamp(now),
        },
      );
    } catch (error) {
      if (
        error instanceof Error
        && error.message.includes(
          "UNIQUE constraint failed",
        )
      ) {
        return {
          kind: "slug_conflict",
        };
      }

      throw error;
    }

    if (!created) {
      throw new Error("category_create_failed");
    }

    return {
      kind: "created",
      category: created,
    };
  }

  async update(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    categoryPublicId: string,
    input: CategoryUpdateInput,
    now: Date,
  ): Promise<CategoryUpdateResult> {
    if (!canMutate(role)) {
      return {
        kind: "forbidden",
      };
    }

    if (
      !hasPublicIdPrefix(
        categoryPublicId,
        "ctg",
      )
      || !validVersion(input.version)
    ) {
      return {
        kind: "invalid",
      };
    }

    const existing =
      await this.repository.findByPublicId(
        tenant,
        categoryPublicId,
      );

    if (!existing) {
      return {
        kind: "not_found",
      };
    }

    if (existing.version !== input.version) {
      return {
        kind: "version_conflict",
      };
    }

    const hasEditableField =
      input.name !== undefined
      || input.slug !== undefined
      || input.description !== undefined
      || input.parentId !== undefined
      || input.sortOrder !== undefined
      || input.isVisible !== undefined;

    if (!hasEditableField) {
      return {
        kind: "invalid",
      };
    }

    const name = input.name === undefined
      ? existing.name
      : cleanRequiredText(input.name, 120);

    if (!name) {
      return {
        kind: "invalid",
      };
    }

    const slug = input.slug === undefined
      ? existing.slug
      : normalizeItemSlug(input.slug);

    if (!isValidItemSlug(slug)) {
      return {
        kind: "invalid",
      };
    }

    let description: string | null;

    try {
      const normalizedDescription =
        cleanDescription(input.description);

      description = normalizedDescription === undefined
        ? existing.description
        : normalizedDescription;
    } catch {
      return {
        kind: "invalid",
      };
    }

    const sortOrder = input.sortOrder === undefined
      ? existing.sortOrder
      : input.sortOrder;

    if (!validSortOrder(sortOrder)) {
      return {
        kind: "invalid",
      };
    }

    const isVisible = input.isVisible === undefined
      ? existing.isVisible
      : input.isVisible;

    let parentId = existing.parentId;

    if (input.parentId !== undefined) {
      if (input.parentId === null) {
        parentId = null;
      } else {
        if (
          !hasPublicIdPrefix(
            input.parentId,
            "ctg",
          )
          || input.parentId === categoryPublicId
        ) {
          return {
            kind: "invalid_parent",
          };
        }

        const parent =
          await this.repository.findByPublicId(
            tenant,
            input.parentId,
          );

        if (
          !parent
          || parent.catalogueId !== existing.catalogueId
          || parent.parentId !== null
        ) {
          return {
            kind: "invalid_parent",
          };
        }

        if (
          await this.repository.hasActiveChildren(
            tenant,
            existing.id,
          )
        ) {
          return {
            kind: "has_children",
          };
        }

        parentId = parent.id;
      }
    }

    if (
      await this.repository.slugExists(
        tenant,
        existing.catalogueId,
        slug,
        existing.id,
      )
    ) {
      return {
        kind: "slug_conflict",
      };
    }

    let updated = false;

    try {
      updated = await this.repository.update(
        tenant,
        existing.id,
        input.version,
        {
          parentId,
          name,
          slug,
          description,
          sortOrder,
          isVisible,
          now: isoTimestamp(now),
        },
      );
    } catch (error) {
      if (
        error instanceof Error
        && error.message.includes(
          "UNIQUE constraint failed",
        )
      ) {
        return {
          kind: "slug_conflict",
        };
      }

      throw error;
    }

    if (!updated) {
      return {
        kind: "version_conflict",
      };
    }

    const category =
      await this.repository.findByPublicId(
        tenant,
        categoryPublicId,
      );

    if (!category) {
      throw new Error("category_update_readback_failed");
    }

    return {
      kind: "updated",
      category,
    };
  }

  async delete(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    categoryPublicId: string,
    input: CategoryDeleteInput,
    now: Date,
  ): Promise<CategoryDeleteResult> {
    if (!canMutate(role)) {
      return {
        kind: "forbidden",
      };
    }

    if (
      !hasPublicIdPrefix(
        categoryPublicId,
        "ctg",
      )
      || !validVersion(input.version)
    ) {
      return {
        kind: "invalid",
      };
    }

    const existing =
      await this.repository.findByPublicId(
        tenant,
        categoryPublicId,
      );

    if (!existing) {
      return {
        kind: "not_found",
      };
    }

    if (existing.version !== input.version) {
      return {
        kind: "version_conflict",
      };
    }

    const deleted =
      await this.repository.softDelete(
        tenant,
        existing.id,
        input.version,
        isoTimestamp(now),
      );

    return deleted
      ? {
          kind: "deleted",
        }
      : {
          kind: "version_conflict",
        };
  }
}