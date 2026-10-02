import {
  createPublicId,
  hasPublicIdPrefix,
  isValidCurrencyCode,
  isValidItemSlug,
  normalizeCurrencyCode,
  normalizeItemSlug,
  type OrganizationMemberRole,
  type TenantContext,
} from "@techabanca/domain";
import type {
  CatalogueItemRecord,
  CatalogueItemRepository,
  CatalogueItemStatus,
  CatalogueItemType,
  CategoryRepository,
} from "../repositories";

export type ItemListInput = {
  search?: string;
  status?: CatalogueItemStatus;
  itemType?: CatalogueItemType;
  categoryId?: string | null;
  after?: string;
  limit?: number;
};

export type ItemCreateInput = {
  itemType: CatalogueItemType;
  name: string;
  slug?: string;
  sku?: string | null;
  categoryId?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  priceMinorUnits?: number | null;
  currencyCode?: string | null;
  showPrice?: boolean;
  status?: CatalogueItemStatus;
  isFeatured?: boolean;
  sortOrder?: number;
};

export type ItemUpdateInput = {
  version: number;
  itemType?: CatalogueItemType;
  name?: string;
  slug?: string;
  sku?: string | null;
  categoryId?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  priceMinorUnits?: number | null;
  currencyCode?: string | null;
  showPrice?: boolean;
  status?: CatalogueItemStatus;
  isFeatured?: boolean;
  sortOrder?: number;
};

export type ItemDeleteInput = {
  version: number;
};

export type ItemListResult =
  | {
      kind: "listed";
      catalogueId: string;
      items: CatalogueItemRecord[];
      nextCursor: string | null;
    }
  | {
      kind: "catalogue_required";
    }
  | {
      kind: "invalid";
    }
  | {
      kind: "invalid_category";
    }
  | {
      kind: "invalid_cursor";
    };

export type ItemGetResult =
  | {
      kind: "found";
      item: CatalogueItemRecord;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "invalid";
    };

export type ItemMutationFailure = {
  kind:
    | "forbidden"
    | "catalogue_required"
    | "invalid"
    | "not_found"
    | "invalid_category"
    | "item_type_not_allowed"
    | "slug_conflict"
    | "sku_conflict"
    | "version_conflict"
    | "attribute_scope_conflict";
};

export type ItemCreateResult =
  | {
      kind: "created";
      item: CatalogueItemRecord;
    }
  | ItemMutationFailure;

export type ItemUpdateResult =
  | {
      kind: "updated";
      item: CatalogueItemRecord;
    }
  | ItemMutationFailure;

export type ItemDeleteResult =
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

function canMutate(
  role: OrganizationMemberRole,
): boolean {
  return role === "owner" || role === "admin";
}

function validVersion(value: number): boolean {
  return Number.isInteger(value)
    && value >= 1;
}

function validSortOrder(value: number): boolean {
  return Number.isInteger(value)
    && value >= 0
    && value <= 1_000_000;
}

function validLimit(value: number): boolean {
  return Number.isInteger(value)
    && value >= 1
    && value <= 100;
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

function cleanOptionalText(
  value: string | null | undefined,
  maxLength: number,
  collapseWhitespace: boolean,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = collapseWhitespace
    ? value.trim().replace(/\s+/g, " ")
    : value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new Error("invalid_optional_text");
  }

  return normalized;
}

function validItemType(
  value: string,
): value is CatalogueItemType {
  return value === "product"
    || value === "service";
}

function validStatus(
  value: string,
): value is CatalogueItemStatus {
  return value === "draft"
    || value === "published"
    || value === "hidden";
}

function typeAllowedByMode(
  itemType: CatalogueItemType,
  mode: "products" | "services" | "both",
): boolean {
  if (mode === "both") {
    return true;
  }

  return (
    (mode === "products" && itemType === "product")
    || (mode === "services" && itemType === "service")
  );
}

function normalizePrice(
  priceMinorUnits: number | null,
  currencyCode: string | null,
  showPrice: boolean,
):
  | {
      valid: true;
      priceMinorUnits: number | null;
      currencyCode: string | null;
      showPrice: boolean;
    }
  | {
      valid: false;
    } {
  if (
    priceMinorUnits !== null
    && (
      !Number.isSafeInteger(priceMinorUnits)
      || priceMinorUnits < 0
    )
  ) {
    return {
      valid: false,
    };
  }

  if (
    (priceMinorUnits === null)
    !== (currencyCode === null)
  ) {
    return {
      valid: false,
    };
  }

  let normalizedCurrency: string | null = null;

  if (currencyCode !== null) {
    normalizedCurrency =
      normalizeCurrencyCode(currencyCode);

    if (
      !isValidCurrencyCode(
        normalizedCurrency,
      )
    ) {
      return {
        valid: false,
      };
    }
  }

  if (
    showPrice
    && priceMinorUnits === null
  ) {
    return {
      valid: false,
    };
  }

  return {
    valid: true,
    priceMinorUnits,
    currencyCode: normalizedCurrency,
    showPrice,
  };
}

function isoTimestamp(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    throw new Error("invalid_date");
  }

  return now.toISOString();
}

function dbConflictKind(
  error: unknown,
):
  | "slug_conflict"
  | "sku_conflict"
  | "attribute_scope_conflict"
  | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const message = error.message;

  if (
    message.includes(
      "catalogue_items.catalogue_id, catalogue_items.slug",
    )
  ) {
    return "slug_conflict";
  }

  if (
    message.includes(
      "catalogue_items.catalogue_id, catalogue_items.sku",
    )
  ) {
    return "sku_conflict";
  }

  if (
    message.includes(
      "existing_item_attribute_scope_conflict",
    )
  ) {
    return "attribute_scope_conflict";
  }

  return null;
}

export class ItemService {
  constructor(
    private readonly repository:
      CatalogueItemRepository,
    private readonly categories:
      CategoryRepository,
  ) {}

  async list(
    tenant: TenantContext,
    input: ItemListInput,
  ): Promise<ItemListResult> {
    const catalogue =
      await this.repository.findCatalogueForTenant(
        tenant,
      );

    if (!catalogue) {
      return {
        kind: "catalogue_required",
      };
    }

    const limit = input.limit ?? 50;

    if (!validLimit(limit)) {
      return {
        kind: "invalid",
      };
    }

    let search: string | null = null;

    if (input.search !== undefined) {
      search = input.search
        .trim()
        .replace(/\s+/g, " ");

      if (
        search.length < 1
        || search.length > 120
      ) {
        return {
          kind: "invalid",
        };
      }
    }

    if (
      input.status !== undefined
      && !validStatus(input.status)
    ) {
      return {
        kind: "invalid",
      };
    }

    if (
      input.itemType !== undefined
      && !validItemType(input.itemType)
    ) {
      return {
        kind: "invalid",
      };
    }

    let categoryId:
      | number
      | null
      | undefined = undefined;

    if (input.categoryId !== undefined) {
      if (input.categoryId === null) {
        categoryId = null;
      } else {
        if (
          !hasPublicIdPrefix(
            input.categoryId,
            "ctg",
          )
        ) {
          return {
            kind: "invalid_category",
          };
        }

        const category =
          await this.categories.findByPublicId(
            tenant,
            input.categoryId,
          );

        if (
          !category
          || category.catalogueId
            !== catalogue.id
        ) {
          return {
            kind: "invalid_category",
          };
        }

        categoryId = category.id;
      }
    }

    let after: {
      sortOrder: number;
      name: string;
      id: number;
    } | null = null;

    if (input.after !== undefined) {
      if (
        !hasPublicIdPrefix(
          input.after,
          "itm",
        )
      ) {
        return {
          kind: "invalid_cursor",
        };
      }

      const anchor =
        await this.repository.findByPublicId(
          tenant,
          input.after,
        );

      if (
        !anchor
        || anchor.catalogueId
          !== catalogue.id
      ) {
        return {
          kind: "invalid_cursor",
        };
      }

      after = {
        sortOrder: anchor.sortOrder,
        name: anchor.name,
        id: anchor.id,
      };
    }

    const items =
      await this.repository.list(
        tenant,
        catalogue.id,
        {
          search,
          status: input.status ?? null,
          itemType:
            input.itemType ?? null,
          categoryId,
          limit: limit + 1,
          after,
        },
      );

    const hasMore = items.length > limit;
    const page = hasMore
      ? items.slice(0, limit)
      : items;

    return {
      kind: "listed",
      catalogueId: catalogue.publicId,
      items: page,
      nextCursor:
        hasMore && page.length > 0
          ? page[page.length - 1].publicId
          : null,
    };
  }

  async get(
    tenant: TenantContext,
    itemPublicId: string,
  ): Promise<ItemGetResult> {
    if (
      !hasPublicIdPrefix(
        itemPublicId,
        "itm",
      )
    ) {
      return {
        kind: "invalid",
      };
    }

    const item =
      await this.repository.findByPublicId(
        tenant,
        itemPublicId,
      );

    return item
      ? {
          kind: "found",
          item,
        }
      : {
          kind: "not_found",
        };
  }

  async create(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    input: ItemCreateInput,
    now: Date,
  ): Promise<ItemCreateResult> {
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

    if (
      !validItemType(input.itemType)
      || !typeAllowedByMode(
        input.itemType,
        catalogue.mode,
      )
    ) {
      return {
        kind: "item_type_not_allowed",
      };
    }

    const name = cleanRequiredText(
      input.name,
      180,
    );

    if (!name) {
      return {
        kind: "invalid",
      };
    }

    let sku: string | null;
    let shortDescription: string | null;
    let longDescription: string | null;

    try {
      sku =
        cleanOptionalText(
          input.sku,
          100,
          true,
        ) ?? null;

      shortDescription =
        cleanOptionalText(
          input.shortDescription,
          500,
          true,
        ) ?? null;

      longDescription =
        cleanOptionalText(
          input.longDescription,
          20_000,
          false,
        ) ?? null;
    } catch {
      return {
        kind: "invalid",
      };
    }

    const sortOrder = input.sortOrder ?? 0;
    const status = input.status ?? "draft";
    const isFeatured =
      input.isFeatured ?? false;

    if (
      !validSortOrder(sortOrder)
      || !validStatus(status)
    ) {
      return {
        kind: "invalid",
      };
    }

    const price = normalizePrice(
      input.priceMinorUnits ?? null,
      input.currencyCode ?? null,
      input.showPrice ?? false,
    );

    if (!price.valid) {
      return {
        kind: "invalid",
      };
    }

    let categoryId: number | null = null;

    if (
      input.categoryId !== undefined
      && input.categoryId !== null
    ) {
      if (
        !hasPublicIdPrefix(
          input.categoryId,
          "ctg",
        )
      ) {
        return {
          kind: "invalid_category",
        };
      }

      const category =
        await this.categories.findByPublicId(
          tenant,
          input.categoryId,
        );

      if (
        !category
        || category.catalogueId
          !== catalogue.id
      ) {
        return {
          kind: "invalid_category",
        };
      }

      categoryId = category.id;
    }

    const publicId = createPublicId("itm");

    let slug = normalizeItemSlug(
      input.slug ?? name,
    );

    if (slug.length === 0) {
      slug =
        `item-${publicId.slice(4, 12)}`;
    }

    if (!isValidItemSlug(slug)) {
      return {
        kind: "invalid",
      };
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

    if (
      sku !== null
      && await this.repository.skuExists(
        tenant,
        catalogue.id,
        sku,
      )
    ) {
      return {
        kind: "sku_conflict",
      };
    }

    let item: CatalogueItemRecord | null;

    try {
      item = await this.repository.create(
        tenant,
        {
          publicId,
          catalogueId: catalogue.id,
          categoryId,
          itemType: input.itemType,
          name,
          slug,
          sku,
          shortDescription,
          longDescription,
          priceMinorUnits:
            price.priceMinorUnits,
          currencyCode:
            price.currencyCode,
          showPrice: price.showPrice,
          status,
          isFeatured,
          sortOrder,
          now: isoTimestamp(now),
        },
      );
    } catch (error) {
      const conflict =
        dbConflictKind(error);

      if (conflict) {
        return {
          kind: conflict,
        };
      }

      throw error;
    }

    if (!item) {
      throw new Error(
        "item_create_failed",
      );
    }

    return {
      kind: "created",
      item,
    };
  }

  async update(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    itemPublicId: string,
    input: ItemUpdateInput,
    now: Date,
  ): Promise<ItemUpdateResult> {
    if (!canMutate(role)) {
      return {
        kind: "forbidden",
      };
    }

    if (
      !hasPublicIdPrefix(
        itemPublicId,
        "itm",
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
        itemPublicId,
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

    const catalogue =
      await this.repository.findCatalogueForTenant(
        tenant,
      );

    if (
      !catalogue
      || catalogue.id
        !== existing.catalogueId
    ) {
      return {
        kind: "not_found",
      };
    }

    const hasEditableField =
      input.itemType !== undefined
      || input.name !== undefined
      || input.slug !== undefined
      || input.sku !== undefined
      || input.categoryId !== undefined
      || input.shortDescription !== undefined
      || input.longDescription !== undefined
      || input.priceMinorUnits !== undefined
      || input.currencyCode !== undefined
      || input.showPrice !== undefined
      || input.status !== undefined
      || input.isFeatured !== undefined
      || input.sortOrder !== undefined;

    if (!hasEditableField) {
      return {
        kind: "invalid",
      };
    }

    const itemType =
      input.itemType ?? existing.itemType;

    if (
      !validItemType(itemType)
      || !typeAllowedByMode(
        itemType,
        catalogue.mode,
      )
    ) {
      return {
        kind: "item_type_not_allowed",
      };
    }

    const name = input.name === undefined
      ? existing.name
      : cleanRequiredText(
          input.name,
          180,
        );

    if (!name) {
      return {
        kind: "invalid",
      };
    }

    let slug = input.slug === undefined
      ? existing.slug
      : normalizeItemSlug(input.slug);

    if (
      input.slug !== undefined
      && slug.length === 0
    ) {
      return {
        kind: "invalid",
      };
    }

    if (!isValidItemSlug(slug)) {
      return {
        kind: "invalid",
      };
    }

    let sku: string | null;
    let shortDescription: string | null;
    let longDescription: string | null;

    try {
      const normalizedSku =
        cleanOptionalText(
          input.sku,
          100,
          true,
        );

      sku = normalizedSku === undefined
        ? existing.sku
        : normalizedSku;

      const normalizedShort =
        cleanOptionalText(
          input.shortDescription,
          500,
          true,
        );

      shortDescription =
        normalizedShort === undefined
          ? existing.shortDescription
          : normalizedShort;

      const normalizedLong =
        cleanOptionalText(
          input.longDescription,
          20_000,
          false,
        );

      longDescription =
        normalizedLong === undefined
          ? existing.longDescription
          : normalizedLong;
    } catch {
      return {
        kind: "invalid",
      };
    }

    let categoryId = existing.categoryId;

    if (input.categoryId !== undefined) {
      if (input.categoryId === null) {
        categoryId = null;
      } else {
        if (
          !hasPublicIdPrefix(
            input.categoryId,
            "ctg",
          )
        ) {
          return {
            kind: "invalid_category",
          };
        }

        const category =
          await this.categories.findByPublicId(
            tenant,
            input.categoryId,
          );

        if (
          !category
          || category.catalogueId
            !== existing.catalogueId
        ) {
          return {
            kind: "invalid_category",
          };
        }

        categoryId = category.id;
      }
    }

    const sortOrder = input.sortOrder === undefined
      ? existing.sortOrder
      : input.sortOrder;

    const status = input.status === undefined
      ? existing.status
      : input.status;

    const isFeatured =
      input.isFeatured === undefined
        ? existing.isFeatured
        : input.isFeatured;

    if (
      !validSortOrder(sortOrder)
      || !validStatus(status)
    ) {
      return {
        kind: "invalid",
      };
    }

    const rawPrice =
      input.priceMinorUnits === undefined
        ? existing.priceMinorUnits
        : input.priceMinorUnits;

    const rawCurrency =
      input.currencyCode === undefined
        ? existing.currencyCode
        : input.currencyCode;

    const rawShowPrice =
      input.showPrice === undefined
        ? existing.showPrice
        : input.showPrice;

    const price = normalizePrice(
      rawPrice,
      rawCurrency,
      rawShowPrice,
    );

    if (!price.valid) {
      return {
        kind: "invalid",
      };
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

    if (
      sku !== null
      && await this.repository.skuExists(
        tenant,
        existing.catalogueId,
        sku,
        existing.id,
      )
    ) {
      return {
        kind: "sku_conflict",
      };
    }

    let updated = false;

    try {
      updated = await this.repository.update(
        tenant,
        existing.id,
        input.version,
        {
          categoryId,
          itemType,
          name,
          slug,
          sku,
          shortDescription,
          longDescription,
          priceMinorUnits:
            price.priceMinorUnits,
          currencyCode:
            price.currencyCode,
          showPrice: price.showPrice,
          status,
          isFeatured,
          sortOrder,
          now: isoTimestamp(now),
        },
      );
    } catch (error) {
      const conflict =
        dbConflictKind(error);

      if (conflict) {
        return {
          kind: conflict,
        };
      }

      throw error;
    }

    if (!updated) {
      return {
        kind: "version_conflict",
      };
    }

    const item =
      await this.repository.findByPublicId(
        tenant,
        itemPublicId,
      );

    if (!item) {
      throw new Error(
        "item_update_readback_failed",
      );
    }

    return {
      kind: "updated",
      item,
    };
  }

  async delete(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    itemPublicId: string,
    input: ItemDeleteInput,
    now: Date,
  ): Promise<ItemDeleteResult> {
    if (!canMutate(role)) {
      return {
        kind: "forbidden",
      };
    }

    if (
      !hasPublicIdPrefix(
        itemPublicId,
        "itm",
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
        itemPublicId,
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