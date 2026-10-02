import {
  describe,
  expect,
  it,
} from "vitest";
import {
  AuthoringApiError,
  createAuthoringApi,
} from "../src/client/authoring-api";

const ORG_ID =
  "org_11111111111111111111111111111111";

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "content-type":
          "application/json",
      },
    },
  );
}

describe("browser authoring API client", () => {
  it("loads categories with the selected tenant header", async () => {
    let capturedPath = "";
    let capturedInit:
      | RequestInit
      | undefined;

    const fetcher = (async (
      input,
      init,
    ) => {
      capturedPath = String(input);
      capturedInit = init;

      return jsonResponse({
        data: {
          catalogueId:
            "cat_22222222222222222222222222222222",
          categories: [],
        },
      });
    }) as typeof fetch;

    const api =
      createAuthoringApi(fetcher);

    await api.categories(ORG_ID);

    expect(capturedPath).toBe(
      "/api/v1/catalogue/categories",
    );

    const headers = new Headers(
      capturedInit?.headers,
    );

    expect(
      headers.get(
        "X-Techabanca-Organization",
      ),
    ).toBe(ORG_ID);
    expect(
      headers.get("accept"),
    ).toBe("application/json");
  });

  it("encodes item search, filters, uncategorized state, and cursor pagination", async () => {
    let capturedPath = "";

    const fetcher = (async (
      input,
    ) => {
      capturedPath = String(input);

      return jsonResponse({
        data: {
          catalogueId:
            "cat_22222222222222222222222222222222",
          items: [],
          nextCursor: null,
        },
      });
    }) as typeof fetch;

    const api =
      createAuthoringApi(fetcher);

    await api.items(
      ORG_ID,
      {
        q: "industrial pump",
        status: "draft",
        itemType: "product",
        categoryId: null,
        after:
          "itm_33333333333333333333333333333333",
        limit: 25,
      },
    );

    expect(capturedPath).toBe(
      "/api/v1/catalogue/items?q=industrial+pump&status=draft&itemType=product&categoryId=uncategorized&after=itm_33333333333333333333333333333333&limit=25",
    );
  });

  it("sends custom-category creation as tenant-scoped JSON", async () => {
    let capturedPath = "";
    let capturedInit:
      | RequestInit
      | undefined;

    const fetcher = (async (
      input,
      init,
    ) => {
      capturedPath = String(input);
      capturedInit = init;

      return jsonResponse(
        {
          data: {
            category: {
              id:
                "ctg_44444444444444444444444444444444",
              parentId: null,
              name: "Pumps",
              slug: "pumps",
              description: null,
              sortOrder: 0,
              isVisible: true,
              version: 1,
            },
          },
        },
        201,
      );
    }) as typeof fetch;

    const api =
      createAuthoringApi(fetcher);

    await api.createCategory(
      ORG_ID,
      {
        name: "Pumps",
        isVisible: true,
      },
    );

    expect(capturedPath).toBe(
      "/api/v1/catalogue/categories",
    );
    expect(capturedInit?.method).toBe(
      "POST",
    );

    const headers = new Headers(
      capturedInit?.headers,
    );

    expect(
      headers.get("content-type"),
    ).toBe("application/json");
    expect(
      headers.get(
        "X-Techabanca-Organization",
      ),
    ).toBe(ORG_ID);
    expect(
      JSON.parse(
        String(capturedInit?.body),
      ),
    ).toEqual({
      name: "Pumps",
      isVisible: true,
    });
  });

  it("sends optimistic delete versions and accepts 204 responses", async () => {
    let capturedPath = "";
    let capturedInit:
      | RequestInit
      | undefined;

    const fetcher = (async (
      input,
      init,
    ) => {
      capturedPath = String(input);
      capturedInit = init;

      return new Response(null, {
        status: 204,
      });
    }) as typeof fetch;

    const api =
      createAuthoringApi(fetcher);

    await expect(
      api.deleteItem(
        ORG_ID,
        "itm_55555555555555555555555555555555",
        4,
      ),
    ).resolves.toBeUndefined();

    expect(capturedPath).toBe(
      "/api/v1/catalogue/items/itm_55555555555555555555555555555555",
    );
    expect(capturedInit?.method).toBe(
      "DELETE",
    );
    expect(
      JSON.parse(
        String(capturedInit?.body),
      ),
    ).toEqual({
      version: 4,
    });
  });

  it("encodes Attribute filters and typed item-value writes", async () => {
    const paths: string[] = [];
    const inits:
      RequestInit[] = [];

    const fetcher = (async (
      input,
      init,
    ) => {
      paths.push(String(input));
      inits.push(init ?? {});

      if (
        String(input).includes(
          "/attributes?",
        )
      ) {
        return jsonResponse({
          data: {
            attributes: [],
          },
        });
      }

      return jsonResponse({
        data: {
          value: {
            value: 12.5,
            valueText: "12.5",
            sortOrder: 10,
            isVisible: true,
            version: 1,
          },
        },
      });
    }) as typeof fetch;

    const api =
      createAuthoringApi(fetcher);

    await api.attributes(
      ORG_ID,
      {
        appliesTo: "product",
        includeInactive: true,
      },
    );

    await api.setItemAttribute(
      ORG_ID,
      "itm_66666666666666666666666666666666",
      "atr_77777777777777777777777777777777",
      {
        value: 12.5,
        sortOrder: 10,
        isVisible: true,
      },
    );

    expect(paths[0]).toBe(
      "/api/v1/catalogue/attributes?appliesTo=product&includeInactive=true",
    );
    expect(paths[1]).toBe(
      "/api/v1/catalogue/items/itm_66666666666666666666666666666666/attributes/atr_77777777777777777777777777777777",
    );
    expect(inits[1].method).toBe(
      "PUT",
    );
    expect(
      JSON.parse(
        String(inits[1].body),
      ),
    ).toEqual({
      value: 12.5,
      sortOrder: 10,
      isVisible: true,
    });
  });

  it("surfaces structured authoring API errors", async () => {
    const fetcher = (async () =>
      jsonResponse(
        {
          error: {
            code:
              "item_version_conflict",
            message:
              "This item changed since it was loaded. Refresh and try again.",
            requestId: "req_authoring",
          },
        },
        409,
      )) as typeof fetch;

    const api =
      createAuthoringApi(fetcher);

    try {
      await api.updateItem(
        ORG_ID,
        "itm_88888888888888888888888888888888",
        {
          version: 2,
          name: "Updated",
        },
      );

      throw new Error(
        "Expected update to fail.",
      );
    } catch (error) {
      expect(error).toBeInstanceOf(
        AuthoringApiError,
      );

      const apiError =
        error as AuthoringApiError;

      expect(apiError.status).toBe(
        409,
      );
      expect(apiError.code).toBe(
        "item_version_conflict",
      );
      expect(apiError.requestId).toBe(
        "req_authoring",
      );
    }
  });
});
