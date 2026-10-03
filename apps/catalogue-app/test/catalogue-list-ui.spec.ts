import {
  describe,
  expect,
  it,
} from "vitest";
import type {
  AuthoringCategory,
  AuthoringItem,
} from "../src/client/authoring-api";
import {
  activeCatalogueFilterCount,
  buildCatalogueItemFilters,
  catalogueCategoryLabel,
  cataloguePriceLabel,
  catalogueStatusLabel,
  catalogueTypeLabel,
  mergeCatalogueItemPages,
} from "../src/client/catalogue-list-ui";

function item(
  input: Partial<AuthoringItem>
    & Pick<
      AuthoringItem,
      "id" | "name" | "slug"
    >,
): AuthoringItem {
  return {
    catalogueId: "cat_test",
    categoryId: null,
    itemType: "product",
    sku: null,
    shortDescription: null,
    longDescription: null,
    priceMinorUnits: null,
    currencyCode: null,
    showPrice: false,
    status: "draft",
    isFeatured: false,
    sortOrder: 0,
    version: 1,
    ...input,
  };
}

const CATEGORIES: AuthoringCategory[] = [
  {
    id: "ctg_pumps",
    parentId: null,
    name: "Pumps",
    slug: "pumps",
    description: null,
    sortOrder: 10,
    isVisible: true,
    version: 1,
  },
];

describe("Catalogue List UI helpers", () => {
  it("builds server-side search and status/type/category filters", () => {
    expect(
      buildCatalogueItemFilters(
        {
          query: " pump ",
          status: "draft",
          itemType: "product",
          category:
            "ctg_pumps",
        },
        "itm_cursor",
        25,
      ),
    ).toEqual({
      q: "pump",
      status: "draft",
      itemType: "product",
      categoryId: "ctg_pumps",
      after: "itm_cursor",
      limit: 25,
    });
  });

  it("maps the uncategorized selection to the API null category filter", () => {
    expect(
      buildCatalogueItemFilters({
        query: "",
        status: "all",
        itemType: "all",
        category:
          "uncategorized",
      }),
    ).toEqual({
      categoryId: null,
      limit: 25,
    });
  });

  it("counts active search and filters without counting defaults", () => {
    expect(
      activeCatalogueFilterCount({
        query: "valve",
        status: "hidden",
        itemType: "product",
        category: "all",
      }),
    ).toBe(3);

    expect(
      activeCatalogueFilterCount({
        query: " ",
        status: "all",
        itemType: "all",
        category: "all",
      }),
    ).toBe(0);
  });

  it("formats category, type, status, and price labels", () => {
    const priced = item({
      id: "itm_priced",
      name: "Pump",
      slug: "pump",
      categoryId: "ctg_pumps",
      priceMinorUnits: 125050,
      currencyCode: "INR",
      showPrice: true,
      status: "published",
    });

    expect(
      catalogueCategoryLabel(
        CATEGORIES,
        priced.categoryId,
      ),
    ).toBe("Pumps");

    expect(
      catalogueCategoryLabel(
        CATEGORIES,
        null,
      ),
    ).toBe("Uncategorized");

    expect(
      catalogueTypeLabel(
        priced.itemType,
      ),
    ).toBe("Product");

    expect(
      catalogueStatusLabel(
        priced.status,
      ),
    ).toBe("Published source");

    expect(
      cataloguePriceLabel(priced),
    ).toBe("INR 1,250.5");

    expect(
      cataloguePriceLabel(
        item({
          id: "itm_hidden_price",
          name: "Hidden",
          slug: "hidden",
        }),
      ),
    ).toBe("Price hidden");
  });

  it("merges cursor pages without duplicating existing items", () => {
    const first = item({
      id: "itm_first",
      name: "First",
      slug: "first",
    });

    const second = item({
      id: "itm_second",
      name: "Second",
      slug: "second",
    });

    const third = item({
      id: "itm_third",
      name: "Third",
      slug: "third",
    });

    expect(
      mergeCatalogueItemPages(
        [first, second],
        [second, third],
      ).map(
        (record) => record.id,
      ),
    ).toEqual([
      "itm_first",
      "itm_second",
      "itm_third",
    ]);
  });
});
