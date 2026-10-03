import type {
  AuthoringCategory,
  AuthoringItem,
  AuthoringItemFilters,
  AuthoringItemStatus,
  AuthoringItemType,
} from "./authoring-api";

export type CatalogueStatusFilter =
  | "all"
  | AuthoringItemStatus;

export type CatalogueTypeFilter =
  | "all"
  | AuthoringItemType;

export type CatalogueCategoryFilter =
  | "all"
  | "uncategorized"
  | string;

export type CatalogueFilterState = {
  query: string;
  status: CatalogueStatusFilter;
  itemType: CatalogueTypeFilter;
  category: CatalogueCategoryFilter;
};

export function catalogueStatusLabel(
  status: AuthoringItemStatus,
): string {
  if (status === "published") {
    return "Published source";
  }

  if (status === "hidden") {
    return "Hidden";
  }

  return "Draft";
}

export function catalogueTypeLabel(
  itemType: AuthoringItemType,
): string {
  return itemType === "service"
    ? "Service"
    : "Product";
}

export function catalogueCategoryLabel(
  categories: AuthoringCategory[],
  categoryId: string | null,
): string {
  if (categoryId === null) {
    return "Uncategorized";
  }

  return categories.find(
    (category) =>
      category.id === categoryId,
  )?.name ?? "Category unavailable";
}

export function cataloguePriceLabel(
  item: AuthoringItem,
): string {
  if (
    !item.showPrice
    || item.priceMinorUnits === null
    || item.currencyCode === null
  ) {
    return "Price hidden";
  }

  const value =
    item.priceMinorUnits / 100;

  return `${item.currencyCode} ${value.toLocaleString(
    "en-IN",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  )}`;
}

export function buildCatalogueItemFilters(
  state: CatalogueFilterState,
  after?: string,
  limit = 25,
): AuthoringItemFilters {
  const filters: AuthoringItemFilters = {
    limit,
  };

  const query = state.query.trim();

  if (query.length > 0) {
    filters.q = query;
  }

  if (state.status !== "all") {
    filters.status = state.status;
  }

  if (state.itemType !== "all") {
    filters.itemType =
      state.itemType;
  }

  if (state.category === "uncategorized") {
    filters.categoryId = null;
  } else if (state.category !== "all") {
    filters.categoryId =
      state.category;
  }

  if (after !== undefined) {
    filters.after = after;
  }

  return filters;
}

export function activeCatalogueFilterCount(
  state: CatalogueFilterState,
): number {
  let count = 0;

  if (state.query.trim().length > 0) {
    count += 1;
  }

  if (state.status !== "all") {
    count += 1;
  }

  if (state.itemType !== "all") {
    count += 1;
  }

  if (state.category !== "all") {
    count += 1;
  }

  return count;
}

export function mergeCatalogueItemPages(
  current: AuthoringItem[],
  incoming: AuthoringItem[],
): AuthoringItem[] {
  const seen = new Set(
    current.map((item) => item.id),
  );

  const merged = [...current];

  for (const item of incoming) {
    if (seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    merged.push(item);
  }

  return merged;
}
