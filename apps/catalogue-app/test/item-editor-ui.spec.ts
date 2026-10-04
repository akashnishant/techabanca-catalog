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
  allowedItemTypes,
  attributeInputValue,
  defaultItemType,
  definitionAppliesToItem,
  formatPriceInput,
  parseAttributeInput,
  parsePriceInput,
  sortEditorAttributes,
} from "../src/client/item-editor-ui";

function definition(
  input: Partial<AuthoringAttributeDefinition>
    & Pick<
      AuthoringAttributeDefinition,
      "id" | "label" | "dataType"
    >,
): AuthoringAttributeDefinition {
  return {
    source: "system",
    code: input.id,
    appliesTo: "both",
    unitHint: null,
    sortOrder: 0,
    isActive: true,
    version: 0,
    isSuggested: false,
    isRequired: false,
    suggestedSortOrder: null,
    ...input,
  };
}

describe("Item Editor UI helpers", () => {
  it("restricts item types to the configured catalogue mode", () => {
    expect(
      allowedItemTypes("products"),
    ).toEqual(["product"]);

    expect(
      allowedItemTypes("services"),
    ).toEqual(["service"]);

    expect(
      allowedItemTypes("both"),
    ).toEqual([
      "product",
      "service",
    ]);

    expect(
      defaultItemType("services"),
    ).toBe("service");
  });

  it("formats and parses prices as integer minor units", () => {
    expect(
      formatPriceInput(125050),
    ).toBe("1250.5");

    expect(
      parsePriceInput("1250.50"),
    ).toEqual({
      kind: "value",
      priceMinorUnits: 125050,
    });

    expect(
      parsePriceInput(""),
    ).toEqual({
      kind: "empty",
      priceMinorUnits: null,
    });

    expect(
      parsePriceInput("12.345"),
    ).toMatchObject({
      kind: "invalid",
    });
  });

  it("parses text, number, boolean, date, and URL attribute inputs", () => {
    expect(
      parseAttributeInput(
        definition({
          id: "text",
          label: "Material",
          dataType: "text",
        }),
        " Steel ",
      ),
    ).toEqual({
      kind: "value",
      value: "Steel",
    });

    expect(
      parseAttributeInput(
        definition({
          id: "number",
          label: "Power",
          dataType: "number",
        }),
        "12.5",
      ),
    ).toEqual({
      kind: "value",
      value: 12.5,
    });

    expect(
      parseAttributeInput(
        definition({
          id: "boolean",
          label: "Automatic",
          dataType: "boolean",
        }),
        "false",
      ),
    ).toEqual({
      kind: "value",
      value: false,
    });

    expect(
      parseAttributeInput(
        definition({
          id: "date",
          label: "Available from",
          dataType: "date",
        }),
        "2026-10-03",
      ),
    ).toEqual({
      kind: "value",
      value: "2026-10-03",
    });

    expect(
      parseAttributeInput(
        definition({
          id: "url",
          label: "Datasheet",
          dataType: "url",
        }),
        "https://example.com/spec",
      ),
    ).toEqual({
      kind: "value",
      value:
        "https://example.com/spec",
    });
  });

  it("rejects malformed typed attribute values and treats blanks as unset", () => {
    expect(
      parseAttributeInput(
        definition({
          id: "number",
          label: "Power",
          dataType: "number",
        }),
        "twelve",
      ),
    ).toMatchObject({
      kind: "invalid",
    });

    expect(
      parseAttributeInput(
        definition({
          id: "url",
          label: "Website",
          dataType: "url",
        }),
        "javascript:alert(1)",
      ),
    ).toMatchObject({
      kind: "invalid",
    });

    expect(
      parseAttributeInput(
        definition({
          id: "text",
          label: "Material",
          dataType: "text",
        }),
        "   ",
      ),
    ).toEqual({
      kind: "empty",
    });
  });

  it("detects applicability and sorts suggested fields before custom fields", () => {
    const productOnly =
      definition({
        id: "product",
        label: "Product field",
        dataType: "text",
        appliesTo: "product",
      });

    expect(
      definitionAppliesToItem(
        productOnly,
        "product",
      ),
    ).toBe(true);

    expect(
      definitionAppliesToItem(
        productOnly,
        "service",
      ),
    ).toBe(false);

    const custom =
      definition({
        id: "custom",
        label: "Custom",
        dataType: "text",
        source: "custom",
        sortOrder: 1,
      });

    const suggested =
      definition({
        id: "suggested",
        label: "Suggested",
        dataType: "text",
        isSuggested: true,
        suggestedSortOrder: 20,
      });

    const values:
      AuthoringItemAttribute[] = [
        {
          definition: custom,
          value: null,
        },
        {
          definition: suggested,
          value: null,
        },
      ];

    expect(
      sortEditorAttributes(
        values,
      ).map(
        (attribute) =>
          attribute.definition.id,
      ),
    ).toEqual([
      "suggested",
      "custom",
    ]);
  });

  it("converts persisted boolean and scalar values back to form inputs", () => {
    expect(
      attributeInputValue({
        definition:
          definition({
            id: "boolean",
            label: "Automatic",
            dataType: "boolean",
          }),
        value: {
          value: false,
          valueText: "false",
          sortOrder: 0,
          isVisible: true,
          version: 2,
        },
      }),
    ).toBe("false");

    expect(
      attributeInputValue({
        definition:
          definition({
            id: "number",
            label: "Power",
            dataType: "number",
          }),
        value: {
          value: 12.5,
          valueText: "12.5",
          sortOrder: 0,
          isVisible: true,
          version: 1,
        },
      }),
    ).toBe("12.5");
  });
});
