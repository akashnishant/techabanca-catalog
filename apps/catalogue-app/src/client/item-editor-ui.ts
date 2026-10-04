import type {
  AuthoringAttributeDefinition,
  AuthoringItemAttribute,
  AuthoringItemType,
} from "./authoring-api";
import type {
  CatalogueMode,
} from "./onboarding-api";

export type AttributeInputResult =
  | {
      kind: "empty";
    }
  | {
      kind: "invalid";
      message: string;
    }
  | {
      kind: "value";
      value: string | number | boolean;
    };

export type PriceInputResult =
  | {
      kind: "empty";
      priceMinorUnits: null;
    }
  | {
      kind: "invalid";
      message: string;
    }
  | {
      kind: "value";
      priceMinorUnits: number;
    };

export function allowedItemTypes(
  mode: CatalogueMode,
): AuthoringItemType[] {
  if (mode === "products") {
    return ["product"];
  }

  if (mode === "services") {
    return ["service"];
  }

  return [
    "product",
    "service",
  ];
}

export function defaultItemType(
  mode: CatalogueMode,
): AuthoringItemType {
  return mode === "services"
    ? "service"
    : "product";
}

export function formatPriceInput(
  priceMinorUnits: number | null,
): string {
  if (priceMinorUnits === null) {
    return "";
  }

  const major =
    priceMinorUnits / 100;

  return Number.isInteger(major)
    ? String(major)
    : major.toFixed(2).replace(
        /0+$/,
        "",
      ).replace(
        /\.$/,
        "",
      );
}

export function parsePriceInput(
  input: string,
): PriceInputResult {
  const normalized = input.trim();

  if (normalized.length === 0) {
    return {
      kind: "empty",
      priceMinorUnits: null,
    };
  }

  if (
    !/^\d+(?:\.\d{1,2})?$/.test(
      normalized,
    )
  ) {
    return {
      kind: "invalid",
      message:
        "Price must be a positive amount with up to two decimal places.",
    };
  }

  const value = Number(normalized);
  const minor = Math.round(
    value * 100,
  );

  if (
    !Number.isSafeInteger(minor)
    || minor < 0
  ) {
    return {
      kind: "invalid",
      message:
        "Price is outside the supported range.",
    };
  }

  return {
    kind: "value",
    priceMinorUnits: minor,
  };
}

export function attributeInputValue(
  attribute: AuthoringItemAttribute,
): string {
  if (attribute.value === null) {
    return "";
  }

  if (
    attribute.definition.dataType
    === "boolean"
  ) {
    return attribute.value.value
      ? "true"
      : "false";
  }

  return String(
    attribute.value.value,
  );
}

export function parseAttributeInput(
  definition: AuthoringAttributeDefinition,
  input: string,
): AttributeInputResult {
  const normalized = input.trim();

  if (normalized.length === 0) {
    return {
      kind: "empty",
    };
  }

  if (
    definition.dataType === "text"
  ) {
    return {
      kind: "value",
      value: normalized,
    };
  }

  if (
    definition.dataType === "number"
  ) {
    const value = Number(normalized);

    if (!Number.isFinite(value)) {
      return {
        kind: "invalid",
        message: `${definition.label} must be a valid number.`,
      };
    }

    return {
      kind: "value",
      value,
    };
  }

  if (
    definition.dataType === "boolean"
  ) {
    if (
      normalized !== "true"
      && normalized !== "false"
    ) {
      return {
        kind: "invalid",
        message: `${definition.label} must be Yes or No.`,
      };
    }

    return {
      kind: "value",
      value:
        normalized === "true",
    };
  }

  if (
    definition.dataType === "date"
  ) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        normalized,
      )
    ) {
      return {
        kind: "invalid",
        message: `${definition.label} must be a valid date.`,
      };
    }

    return {
      kind: "value",
      value: normalized,
    };
  }

  try {
    const parsed =
      new URL(normalized);

    if (
      parsed.protocol !== "https:"
      && parsed.protocol !== "http:"
    ) {
      return {
        kind: "invalid",
        message: `${definition.label} must use http or https.`,
      };
    }
  } catch {
    return {
      kind: "invalid",
      message: `${definition.label} must be a valid URL.`,
    };
  }

  return {
    kind: "value",
    value: normalized,
  };
}

export function definitionAppliesToItem(
  definition: AuthoringAttributeDefinition,
  itemType: AuthoringItemType,
): boolean {
  return definition.appliesTo
    === "both"
    || definition.appliesTo
      === itemType;
}

export function sortEditorAttributes(
  attributes: AuthoringItemAttribute[],
): AuthoringItemAttribute[] {
  return [...attributes].sort(
    (left, right) => {
      const leftSuggested =
        left.definition.isSuggested
          ? 0
          : 1;
      const rightSuggested =
        right.definition.isSuggested
          ? 0
          : 1;

      if (
        leftSuggested
        !== rightSuggested
      ) {
        return leftSuggested
          - rightSuggested;
      }

      const leftOrder =
        left.definition
          .suggestedSortOrder
        ?? left.definition.sortOrder;

      const rightOrder =
        right.definition
          .suggestedSortOrder
        ?? right.definition.sortOrder;

      if (leftOrder !== rightOrder) {
        return leftOrder
          - rightOrder;
      }

      return left.definition.label
        .localeCompare(
          right.definition.label,
          undefined,
          {
            sensitivity: "base",
          },
        );
    },
  );
}
