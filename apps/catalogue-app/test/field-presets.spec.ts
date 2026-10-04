import { env } from "cloudflare:workers";
import {
  describe,
  expect,
  it,
} from "vitest";
import type {
  AuthoringAttributeDefinition,
  AuthoringItemAttribute,
} from "../src/client/authoring-api";
import {
  FIELD_PACKS,
  availableFieldPacks,
  defaultFieldPack,
  fieldPackAttributeCodes,
  fieldPackQuickStartCodes,
  groupEditorAttributes,
  isFieldPackCode,
} from "../src/client/item-field-presets";

function definition(
  code: string,
  options: Partial<AuthoringAttributeDefinition> = {},
): AuthoringAttributeDefinition {
  return {
    id: `atr_${code}`,
    source: "system",
    code,
    label: code,
    dataType: "text",
    appliesTo: "product",
    unitHint: null,
    sortOrder: 0,
    isActive: true,
    version: 1,
    isSuggested: false,
    isRequired: false,
    suggestedSortOrder: null,
    ...options,
  };
}

describe("comprehensive item field presets", () => {
  it("ships every system field referenced by every field pack", async () => {
    const rows = await env.DB.prepare(
      `SELECT code
       FROM attribute_definitions
       WHERE organization_id IS NULL
         AND is_active = 1`,
    ).all<{ code: string }>();

    const available =
      new Set(
        rows.results.map(
          (row) => row.code,
        ),
      );

    const referenced =
      new Set(
        FIELD_PACKS.flatMap(
          (pack) =>
            pack.sections.flatMap(
              (section) =>
                section.attributeCodes,
            ),
        ),
      );

    for (const code of referenced) {
      expect(
        available.has(code),
        `missing system field: ${code}`,
      ).toBe(true);
    }

    expect(
      available.has("item-template"),
    ).toBe(true);

    expect(available.size).toBe(208);
  });

  it("keeps every pack field compatible with the pack item type", async () => {
    const rows = await env.DB.prepare(
      `SELECT code, applies_to
       FROM attribute_definitions
       WHERE organization_id IS NULL
         AND is_active = 1`,
    ).all<{
      code: string;
      applies_to:
        | "product"
        | "service"
        | "both";
    }>();

    const appliesByCode =
      new Map<
        string,
        "product" | "service" | "both"
      >(
        rows.results.map(
          (row) => [
            row.code,
            row.applies_to,
          ] as const,
        ),
      );

    for (const pack of FIELD_PACKS) {
      for (
        const code
        of pack.sections.flatMap(
          (section) =>
            section.attributeCodes,
        )
      ) {
        const applies =
          appliesByCode.get(code);

        expect(
          applies === "both"
          || applies === pack.itemType,
          `${pack.code} has incompatible field ${code}`,
        ).toBe(true);
      }
    }
  });

  it("provides a deep chemical and raw-material template", () => {
    const codes =
      fieldPackAttributeCodes(
        "chemicals-raw-materials",
      );

    for (const code of [
      "chemical-name",
      "cas-number",
      "ec-number",
      "chemical-formula",
      "molecular-weight",
      "grade",
      "purity",
      "concentration",
      "ph",
      "density-specific-gravity",
      "flash-point",
      "hazardous-material",
      "ghs-classification",
      "un-number",
      "transport-hazard-class",
      "packing-group",
      "sds-url",
      "tds-url",
      "coa-available",
      "coa-url",
      "storage-conditions",
      "shelf-life",
      "minimum-order-quantity",
    ]) {
      expect(
        codes.has(code),
        `chemical template missing: ${code}`,
      ).toBe(true);
    }
  });

  it("has a recommended product and service fallback for all business types", () => {
    const businessTypes = [
      "manufacturer",
      "wholesale-distribution",
      "retailer",
      "industrial",
      "food-restaurant",
      "fashion-apparel",
      "electronics",
      "furniture-home",
      "automotive",
      "beauty-wellness",
      "professional-services",
      "other",
    ];

    for (
      const businessType
      of businessTypes
    ) {
      expect(
        availableFieldPacks(
          businessType,
          "product",
        ).length,
      ).toBeGreaterThan(0);

      expect(
        availableFieldPacks(
          businessType,
          "service",
        ).length,
      ).toBeGreaterThan(0);

      expect(
        defaultFieldPack(
          businessType,
          "product",
        ).itemType,
      ).toBe("product");

      expect(
        defaultFieldPack(
          businessType,
          "service",
        ).itemType,
      ).toBe("service");
    }
  });

  it("orders recommendations first without hiding other compatible templates", () => {
    const wholesale =
      availableFieldPacks(
        "wholesale-distribution",
        "product",
      );

    expect(
      wholesale[0]?.recommendedBusinessTypes,
    ).toContain(
      "wholesale-distribution",
    );

    expect(
      wholesale.some(
        (pack) =>
          pack.code
          === "chemicals-raw-materials",
      ),
    ).toBe(true);

    expect(
      isFieldPackCode(
        "chemicals-raw-materials",
      ),
    ).toBe(true);
  });

  it("groups selected-template fields with business, custom, and saved extras", () => {
    const attributes:
      AuthoringItemAttribute[] = [
        {
          definition:
            definition(
              "chemical-name",
            ),
          value: null,
        },
        {
          definition:
            definition(
              "warranty",
              {
                isSuggested: true,
                suggestedSortOrder: 10,
              },
            ),
          value: null,
        },
        {
          definition:
            definition(
              "internal-spec",
              {
                source: "custom",
                id: "atr_custom",
              },
            ),
          value: null,
        },
        {
          definition:
            definition(
              "legacy-value",
            ),
          value: {
            value: "Saved",
            valueText: "Saved",
            sortOrder: 0,
            isVisible: true,
            version: 1,
          },
        },
      ];

    const groups =
      groupEditorAttributes(
        attributes,
        "chemicals-raw-materials",
      );

    expect(
      groups.some(
        (group) =>
          group.attributes.some(
            (attribute) =>
              attribute.definition.code
              === "chemical-name",
          ),
      ),
    ).toBe(true);

    expect(
      groups.find(
        (group) =>
          group.code
          === "business-essentials",
      )?.attributes.map(
        (attribute) =>
          attribute.definition.code,
      ),
    ).toContain("warranty");

    expect(
      groups.find(
        (group) =>
          group.code === "custom",
      )?.attributes.map(
        (attribute) =>
          attribute.definition.code,
      ),
    ).toContain("internal-spec");

    expect(
      groups.find(
        (group) =>
          group.code
          === "other-saved",
      )?.attributes.map(
        (attribute) =>
          attribute.definition.code,
      ),
    ).toContain("legacy-value");
  });

  it("keeps chemical quick-start fields focused while retaining the full pack", () => {
    const quick =
      fieldPackQuickStartCodes(
        "chemicals-raw-materials",
        13,
      );

    expect(quick).toHaveLength(13);
    expect(new Set(quick).size).toBe(13);

    for (const code of [
      "chemical-name",
      "cas-number",
      "grade",
      "purity",
      "pack-size",
      "minimum-order-quantity",
      "storage-conditions",
      "shelf-life",
      "sds-url",
      "coa-available",
    ]) {
      expect(quick).toContain(code);
    }

    const full =
      fieldPackAttributeCodes(
        "chemicals-raw-materials",
      );

    for (const code of quick) {
      expect(full.has(code)).toBe(true);
    }

    expect(full.size).toBeGreaterThan(
      quick.length,
    );
  });

  it("can exclude quick-start fields from collapsed specification groups", () => {
    const attributes:
      AuthoringItemAttribute[] = [
        {
          definition:
            definition(
              "chemical-name",
            ),
          value: null,
        },
        {
          definition:
            definition(
              "cas-number",
            ),
          value: null,
        },
        {
          definition:
            definition(
              "flash-point",
            ),
          value: null,
        },
        {
          definition:
            definition(
              "warranty",
              {
                isSuggested: true,
                suggestedSortOrder: 10,
              },
            ),
          value: null,
        },
      ];

    const excluded =
      new Set([
        "chemical-name",
        "cas-number",
      ]);

    const groups =
      groupEditorAttributes(
        attributes,
        "chemicals-raw-materials",
        excluded,
      );

    const visibleCodes =
      groups.flatMap(
        (group) =>
          group.attributes.map(
            (attribute) =>
              attribute.definition.code,
          ),
      );

    expect(visibleCodes).not.toContain(
      "chemical-name",
    );
    expect(visibleCodes).not.toContain(
      "cas-number",
    );
    expect(visibleCodes).toContain(
      "flash-point",
    );
    expect(visibleCodes).toContain(
      "warranty",
    );
  });

});
