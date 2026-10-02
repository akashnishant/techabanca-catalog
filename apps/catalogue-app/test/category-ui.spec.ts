import {
  describe,
  expect,
  it,
} from "vitest";
import type {
  AuthoringCategory,
} from "../src/client/authoring-api";
import {
  categoryHasChildren,
  categoryMatchesQuery,
  categoryStats,
  eligibleParentCategories,
  filterCategories,
  orderCategories,
} from "../src/client/category-ui";

function category(
  input: Partial<AuthoringCategory>
    & Pick<
      AuthoringCategory,
      "id" | "name" | "slug"
    >,
): AuthoringCategory {
  return {
    parentId: null,
    description: null,
    sortOrder: 0,
    isVisible: true,
    version: 1,
    ...input,
  };
}

const FIXTURE: AuthoringCategory[] = [
  category({
    id: "ctg_root_b",
    name: "Valves",
    slug: "valves",
    sortOrder: 20,
  }),
  category({
    id: "ctg_child_a",
    parentId: "ctg_root_a",
    name: "Centrifugal Pumps",
    slug: "centrifugal-pumps",
    description:
      "Industrial centrifugal range",
    sortOrder: 5,
  }),
  category({
    id: "ctg_root_a",
    name: "Pumps",
    slug: "pumps",
    sortOrder: 10,
  }),
  category({
    id: "ctg_child_b",
    parentId: "ctg_root_a",
    name: "Metering Pumps",
    slug: "metering-pumps",
    sortOrder: 15,
    isVisible: false,
  }),
];

describe("Categories UI helpers", () => {
  it("orders roots by display order and places their children immediately after them", () => {
    expect(
      orderCategories(FIXTURE).map(
        (item) => item.id,
      ),
    ).toEqual([
      "ctg_root_a",
      "ctg_child_a",
      "ctg_child_b",
      "ctg_root_b",
    ]);
  });

  it("searches name, slug, and description case-insensitively", () => {
    expect(
      categoryMatchesQuery(
        FIXTURE[1],
        "CENTRIFUGAL",
      ),
    ).toBe(true);

    expect(
      categoryMatchesQuery(
        FIXTURE[1],
        "industrial",
      ),
    ).toBe(true);

    expect(
      categoryMatchesQuery(
        FIXTURE[1],
        "valves",
      ),
    ).toBe(false);
  });

  it("filters root, child, visible, and hidden category sets", () => {
    expect(
      filterCategories(
        FIXTURE,
        "",
        "root",
      ).map((item) => item.id),
    ).toEqual([
      "ctg_root_a",
      "ctg_root_b",
    ]);

    expect(
      filterCategories(
        FIXTURE,
        "",
        "child",
      ).map((item) => item.id),
    ).toEqual([
      "ctg_child_a",
      "ctg_child_b",
    ]);

    expect(
      filterCategories(
        FIXTURE,
        "",
        "hidden",
      ).map((item) => item.id),
    ).toEqual([
      "ctg_child_b",
    ]);

    expect(
      filterCategories(
        FIXTURE,
        "pump",
        "visible",
      ).map((item) => item.id),
    ).toEqual([
      "ctg_root_a",
      "ctg_child_a",
    ]);
  });

  it("computes category summary statistics", () => {
    expect(
      categoryStats(FIXTURE),
    ).toEqual({
      total: 4,
      roots: 2,
      children: 2,
      visible: 3,
    });
  });

  it("detects children and only offers root categories as parent choices", () => {
    expect(
      categoryHasChildren(
        FIXTURE,
        "ctg_root_a",
      ),
    ).toBe(true);

    expect(
      categoryHasChildren(
        FIXTURE,
        "ctg_root_b",
      ),
    ).toBe(false);

    expect(
      eligibleParentCategories(
        FIXTURE,
        "ctg_root_a",
      ).map((item) => item.id),
    ).toEqual([
      "ctg_root_b",
    ]);
  });
});
