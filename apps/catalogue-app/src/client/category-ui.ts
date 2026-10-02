import type {
  AuthoringCategory,
} from "./authoring-api";

export type CategoryListFilter =
  | "all"
  | "root"
  | "child"
  | "visible"
  | "hidden";

export type CategoryStats = {
  total: number;
  roots: number;
  children: number;
  visible: number;
};

function compareCategory(
  left: AuthoringCategory,
  right: AuthoringCategory,
): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder
      - right.sortOrder;
  }

  const byName = left.name.localeCompare(
    right.name,
    undefined,
    {
      sensitivity: "base",
    },
  );

  if (byName !== 0) {
    return byName;
  }

  return left.id.localeCompare(
    right.id,
  );
}

export function orderCategories(
  categories: AuthoringCategory[],
): AuthoringCategory[] {
  const roots = categories
    .filter(
      (category) =>
        category.parentId === null,
    )
    .sort(compareCategory);

  const rootIds = new Set(
    roots.map((category) => category.id),
  );

  const childrenByParent =
    new Map<
      string,
      AuthoringCategory[]
    >();

  const orphaned: AuthoringCategory[] = [];

  for (const category of categories) {
    if (category.parentId === null) {
      continue;
    }

    if (!rootIds.has(category.parentId)) {
      orphaned.push(category);
      continue;
    }

    const siblings =
      childrenByParent.get(
        category.parentId,
      ) ?? [];

    siblings.push(category);
    childrenByParent.set(
      category.parentId,
      siblings,
    );
  }

  const ordered: AuthoringCategory[] = [];

  for (const root of roots) {
    ordered.push(root);

    const children =
      childrenByParent.get(root.id)
      ?? [];

    ordered.push(
      ...children.sort(compareCategory),
    );
  }

  ordered.push(
    ...orphaned.sort(compareCategory),
  );

  return ordered;
}

export function categoryMatchesQuery(
  category: AuthoringCategory,
  query: string,
): boolean {
  const normalized =
    query.trim().toLowerCase();

  if (normalized.length === 0) {
    return true;
  }

  return [
    category.name,
    category.slug,
    category.description ?? "",
  ].some(
    (value) =>
      value
        .toLowerCase()
        .includes(normalized),
  );
}

export function filterCategories(
  categories: AuthoringCategory[],
  query: string,
  filter: CategoryListFilter,
): AuthoringCategory[] {
  return orderCategories(
    categories.filter((category) => {
      if (
        !categoryMatchesQuery(
          category,
          query,
        )
      ) {
        return false;
      }

      if (filter === "root") {
        return category.parentId === null;
      }

      if (filter === "child") {
        return category.parentId !== null;
      }

      if (filter === "visible") {
        return category.isVisible;
      }

      if (filter === "hidden") {
        return !category.isVisible;
      }

      return true;
    }),
  );
}

export function categoryStats(
  categories: AuthoringCategory[],
): CategoryStats {
  const roots = categories.filter(
    (category) =>
      category.parentId === null,
  ).length;

  const visible = categories.filter(
    (category) =>
      category.isVisible,
  ).length;

  return {
    total: categories.length,
    roots,
    children:
      categories.length - roots,
    visible,
  };
}

export function categoryHasChildren(
  categories: AuthoringCategory[],
  categoryId: string,
): boolean {
  return categories.some(
    (category) =>
      category.parentId === categoryId,
  );
}

export function eligibleParentCategories(
  categories: AuthoringCategory[],
  editingCategoryId?: string,
): AuthoringCategory[] {
  return categories
    .filter(
      (category) =>
        category.parentId === null
        && category.id
          !== editingCategoryId,
    )
    .sort(compareCategory);
}
