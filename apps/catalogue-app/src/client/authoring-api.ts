export type AuthoringCategory = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isVisible: boolean;
  version: number;
};

export type AuthoringCategoryCreateInput = {
  name: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
};

export type AuthoringCategoryUpdateInput = {
  version: number;
  name?: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
};

export type AuthoringItemType =
  | "product"
  | "service";

export type AuthoringItemStatus =
  | "draft"
  | "published"
  | "hidden";

export type AuthoringItem = {
  id: string;
  catalogueId: string;
  categoryId: string | null;
  itemType: AuthoringItemType;
  name: string;
  slug: string;
  sku: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  priceMinorUnits: number | null;
  currencyCode: string | null;
  showPrice: boolean;
  status: AuthoringItemStatus;
  isFeatured: boolean;
  sortOrder: number;
  version: number;
};

export type AuthoringItemCreateInput = {
  itemType: AuthoringItemType;
  name: string;
  slug?: string;
  sku?: string | null;
  categoryId?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  priceMinorUnits?: number | null;
  currencyCode?: string | null;
  showPrice?: boolean;
  status?: AuthoringItemStatus;
  isFeatured?: boolean;
  sortOrder?: number;
};

export type AuthoringItemUpdateInput = {
  version: number;
  itemType?: AuthoringItemType;
  name?: string;
  slug?: string;
  sku?: string | null;
  categoryId?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  priceMinorUnits?: number | null;
  currencyCode?: string | null;
  showPrice?: boolean;
  status?: AuthoringItemStatus;
  isFeatured?: boolean;
  sortOrder?: number;
};

export type AuthoringItemFilters = {
  q?: string;
  status?: AuthoringItemStatus;
  itemType?: AuthoringItemType;
  categoryId?: string | null;
  after?: string;
  limit?: number;
};

export type AuthoringAttributeDataType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "url";

export type AuthoringAttributeAppliesTo =
  | "product"
  | "service"
  | "both";

export type AuthoringAttributeDefinition = {
  id: string;
  source: "system" | "custom";
  code: string;
  label: string;
  dataType: AuthoringAttributeDataType;
  appliesTo: AuthoringAttributeAppliesTo;
  unitHint: string | null;
  sortOrder: number;
  isActive: boolean;
  version: number;
  isSuggested: boolean;
  isRequired: boolean;
  suggestedSortOrder: number | null;
};

export type AuthoringAttributeCreateInput = {
  code?: string;
  label: string;
  dataType: AuthoringAttributeDataType;
  appliesTo?: AuthoringAttributeAppliesTo;
  unitHint?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type AuthoringAttributeUpdateInput = {
  version: number;
  code?: string;
  label?: string;
  dataType?: AuthoringAttributeDataType;
  appliesTo?: AuthoringAttributeAppliesTo;
  unitHint?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type AuthoringAttributeValue = {
  value: string | number | boolean;
  valueText: string;
  sortOrder: number;
  isVisible: boolean;
  version: number;
};

export type AuthoringItemAttribute = {
  definition: AuthoringAttributeDefinition;
  value: AuthoringAttributeValue | null;
};

export type AuthoringAttributeValueInput = {
  value: unknown;
  version?: number | null;
  sortOrder?: number;
  isVisible?: boolean;
};

export type CategoryListData = {
  catalogueId: string;
  categories: AuthoringCategory[];
};

export type CategoryData = {
  category: AuthoringCategory;
};

export type ItemListData = {
  catalogueId: string;
  items: AuthoringItem[];
  nextCursor: string | null;
};

export type ItemData = {
  item: AuthoringItem;
};

export type AttributeListData = {
  attributes: AuthoringAttributeDefinition[];
};

export type AttributeData = {
  attribute: AuthoringAttributeDefinition;
};

export type ItemAttributesData = {
  itemId: string;
  attributes: AuthoringItemAttribute[];
};

export type AttributeValueData = {
  value: AuthoringAttributeValue;
};

type ApiSuccess<T> = {
  data: T;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
};

export class AuthoringApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "AuthoringApiError";
  }
}

type Fetcher = typeof fetch;

async function readJson(
  response: Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorFromResponse(
  response: Response,
  body: unknown,
): AuthoringApiError {
  const parsed =
    typeof body === "object" && body !== null
      ? (body as ApiErrorBody)
      : {};

  return new AuthoringApiError(
    response.status,
    parsed.error?.code ?? "request_failed",
    parsed.error?.message
      ?? "The request could not be completed.",
    parsed.error?.requestId,
  );
}

function encodeId(
  value: string,
): string {
  return encodeURIComponent(value);
}

export function createAuthoringApi(
  fetcher: Fetcher = fetch,
) {
  async function request<T>(
    organizationId: string,
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const headers = new Headers(init?.headers);

    headers.set("Accept", "application/json");
    headers.set(
      "X-Techabanca-Organization",
      organizationId,
    );

    const response = await fetcher(path, {
      ...init,
      headers,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const body = await readJson(response);

    if (!response.ok) {
      throw errorFromResponse(
        response,
        body,
      );
    }

    if (
      typeof body !== "object"
      || body === null
      || !("data" in body)
    ) {
      throw new AuthoringApiError(
        500,
        "invalid_response",
        "The server returned an invalid response.",
      );
    }

    return (body as ApiSuccess<T>).data;
  }

  function jsonRequest<T>(
    organizationId: string,
    path: string,
    method:
      | "POST"
      | "PATCH"
      | "PUT"
      | "DELETE",
    payload: unknown,
  ): Promise<T> {
    return request<T>(
      organizationId,
      path,
      {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
  }

  return {
    categories(
      organizationId: string,
    ) {
      return request<CategoryListData>(
        organizationId,
        "/api/v1/catalogue/categories",
      );
    },

    category(
      organizationId: string,
      categoryId: string,
    ) {
      return request<CategoryData>(
        organizationId,
        `/api/v1/catalogue/categories/${encodeId(categoryId)}`,
      );
    },

    createCategory(
      organizationId: string,
      input: AuthoringCategoryCreateInput,
    ) {
      return jsonRequest<CategoryData>(
        organizationId,
        "/api/v1/catalogue/categories",
        "POST",
        input,
      );
    },

    updateCategory(
      organizationId: string,
      categoryId: string,
      input: AuthoringCategoryUpdateInput,
    ) {
      return jsonRequest<CategoryData>(
        organizationId,
        `/api/v1/catalogue/categories/${encodeId(categoryId)}`,
        "PATCH",
        input,
      );
    },

    deleteCategory(
      organizationId: string,
      categoryId: string,
      version: number,
    ) {
      return jsonRequest<void>(
        organizationId,
        `/api/v1/catalogue/categories/${encodeId(categoryId)}`,
        "DELETE",
        { version },
      );
    },

    items(
      organizationId: string,
      filters: AuthoringItemFilters = {},
    ) {
      const query = new URLSearchParams();

      if (filters.q !== undefined) {
        query.set("q", filters.q);
      }

      if (filters.status !== undefined) {
        query.set(
          "status",
          filters.status,
        );
      }

      if (filters.itemType !== undefined) {
        query.set(
          "itemType",
          filters.itemType,
        );
      }

      if (filters.categoryId !== undefined) {
        query.set(
          "categoryId",
          filters.categoryId === null
            ? "uncategorized"
            : filters.categoryId,
        );
      }

      if (filters.after !== undefined) {
        query.set("after", filters.after);
      }

      if (filters.limit !== undefined) {
        query.set(
          "limit",
          String(filters.limit),
        );
      }

      const suffix = query.size > 0
        ? `?${query.toString()}`
        : "";

      return request<ItemListData>(
        organizationId,
        `/api/v1/catalogue/items${suffix}`,
      );
    },

    item(
      organizationId: string,
      itemId: string,
    ) {
      return request<ItemData>(
        organizationId,
        `/api/v1/catalogue/items/${encodeId(itemId)}`,
      );
    },

    createItem(
      organizationId: string,
      input: AuthoringItemCreateInput,
    ) {
      return jsonRequest<ItemData>(
        organizationId,
        "/api/v1/catalogue/items",
        "POST",
        input,
      );
    },

    updateItem(
      organizationId: string,
      itemId: string,
      input: AuthoringItemUpdateInput,
    ) {
      return jsonRequest<ItemData>(
        organizationId,
        `/api/v1/catalogue/items/${encodeId(itemId)}`,
        "PATCH",
        input,
      );
    },

    deleteItem(
      organizationId: string,
      itemId: string,
      version: number,
    ) {
      return jsonRequest<void>(
        organizationId,
        `/api/v1/catalogue/items/${encodeId(itemId)}`,
        "DELETE",
        { version },
      );
    },

    attributes(
      organizationId: string,
      filters: {
        appliesTo?: AuthoringAttributeAppliesTo;
        includeInactive?: boolean;
      } = {},
    ) {
      const query = new URLSearchParams();

      if (filters.appliesTo !== undefined) {
        query.set(
          "appliesTo",
          filters.appliesTo,
        );
      }

      if (filters.includeInactive !== undefined) {
        query.set(
          "includeInactive",
          filters.includeInactive
            ? "true"
            : "false",
        );
      }

      const suffix = query.size > 0
        ? `?${query.toString()}`
        : "";

      return request<AttributeListData>(
        organizationId,
        `/api/v1/catalogue/attributes${suffix}`,
      );
    },

    createAttribute(
      organizationId: string,
      input: AuthoringAttributeCreateInput,
    ) {
      return jsonRequest<AttributeData>(
        organizationId,
        "/api/v1/catalogue/attributes",
        "POST",
        input,
      );
    },

    updateAttribute(
      organizationId: string,
      attributeId: string,
      input: AuthoringAttributeUpdateInput,
    ) {
      return jsonRequest<AttributeData>(
        organizationId,
        `/api/v1/catalogue/attributes/${encodeId(attributeId)}`,
        "PATCH",
        input,
      );
    },

    archiveAttribute(
      organizationId: string,
      attributeId: string,
      version: number,
    ) {
      return jsonRequest<void>(
        organizationId,
        `/api/v1/catalogue/attributes/${encodeId(attributeId)}`,
        "DELETE",
        { version },
      );
    },

    itemAttributes(
      organizationId: string,
      itemId: string,
    ) {
      return request<ItemAttributesData>(
        organizationId,
        `/api/v1/catalogue/items/${encodeId(itemId)}/attributes`,
      );
    },

    setItemAttribute(
      organizationId: string,
      itemId: string,
      attributeId: string,
      input: AuthoringAttributeValueInput,
    ) {
      return jsonRequest<AttributeValueData>(
        organizationId,
        `/api/v1/catalogue/items/${encodeId(itemId)}/attributes/${encodeId(attributeId)}`,
        "PUT",
        input,
      );
    },

    deleteItemAttribute(
      organizationId: string,
      itemId: string,
      attributeId: string,
      version: number,
    ) {
      return jsonRequest<void>(
        organizationId,
        `/api/v1/catalogue/items/${encodeId(itemId)}/attributes/${encodeId(attributeId)}`,
        "DELETE",
        { version },
      );
    },
  };
}

export const authoringApi =
  createAuthoringApi();
