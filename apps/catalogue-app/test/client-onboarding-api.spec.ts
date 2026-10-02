import {
  describe,
  expect,
  it,
} from "vitest";
import {
  OnboardingApiError,
  createOnboardingApi,
} from "../src/client/onboarding-api";

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "content-type": "application/json",
      },
    },
  );
}

describe("browser onboarding API client", () => {
  it("loads onboarding state with the selected tenant header", async () => {
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
          organization: {
            id: "org_11111111111111111111111111111111",
            name: "Example Industries",
            countryCode: null,
            timezone: "Asia/Kolkata",
            businessType: null,
          },
          profile: {
            businessName: "Example Industries",
            city: null,
            phone: null,
            whatsappNumber: null,
            email: null,
          },
          catalogue: null,
          website: {
            theme: null,
          },
          firstItem: null,
          reference: {
            businessTypes: [],
            themes: [],
            suggestedAttributes: [],
          },
          progress: {
            identityComplete: false,
            businessTypeComplete: false,
            catalogueStarted: false,
            contactsComplete: false,
            themeComplete: false,
            slugComplete: false,
            firstItemComplete: false,
            readyToPublish: false,
          },
        },
      });
    }) as typeof fetch;

    const api = createOnboardingApi(fetcher);

    await api.state(
      "org_11111111111111111111111111111111",
    );

    expect(capturedPath).toBe(
      "/api/v1/onboarding/state",
    );

    const headers = new Headers(
      capturedInit?.headers,
    );

    expect(
      headers.get(
        "X-Techabanca-Organization",
      ),
    ).toBe(
      "org_11111111111111111111111111111111",
    );
  });

  it("sends identity updates as same-origin JSON requests", async () => {
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
        data: {},
      });
    }) as typeof fetch;

    const api = createOnboardingApi(fetcher);

    await api.updateIdentity(
      "org_11111111111111111111111111111111",
      {
        businessName: "Example Industries",
        countryCode: "IN",
        city: "Mumbai",
      },
    );

    expect(capturedPath).toBe(
      "/api/v1/onboarding/identity",
    );
    expect(capturedInit?.method).toBe(
      "PATCH",
    );

    const headers = new Headers(
      capturedInit?.headers,
    );

    expect(
      headers.get("content-type"),
    ).toBe("application/json");

    expect(
      JSON.parse(
        String(capturedInit?.body),
      ),
    ).toEqual({
      businessName: "Example Industries",
      countryCode: "IN",
      city: "Mumbai",
    });
  });

  it("encodes slug availability queries without claiming the slug", async () => {
    let capturedPath = "";
    let capturedMethod:
      | string
      | undefined;

    const fetcher = (async (
      input,
      init,
    ) => {
      capturedPath = String(input);
      capturedMethod = init?.method;

      return jsonResponse({
        data: {
          slug: "acme-tools",
          available: true,
          reason: "available",
        },
      });
    }) as typeof fetch;

    const api = createOnboardingApi(fetcher);

    const result =
      await api.slugAvailability(
        "org_11111111111111111111111111111111",
        " Acme Tools ",
      );

    expect(capturedPath).toBe(
      "/api/v1/onboarding/slug-availability?slug=+Acme+Tools+",
    );
    expect(capturedMethod).toBeUndefined();
    expect(result).toEqual({
      slug: "acme-tools",
      available: true,
      reason: "available",
    });
  });

  it("posts the minimal first-item payload", async () => {
    let capturedInit:
      | RequestInit
      | undefined;

    const fetcher = (async (
      _input,
      init,
    ) => {
      capturedInit = init;

      return jsonResponse({
        data: {},
      });
    }) as typeof fetch;

    const api = createOnboardingApi(fetcher);

    await api.createFirstItem(
      "org_11111111111111111111111111111111",
      {
        name: "Heavy Duty Pump",
        itemType: "product",
        shortDescription:
          "Industrial pump",
      },
    );

    expect(capturedInit?.method).toBe(
      "POST",
    );
    expect(
      JSON.parse(
        String(capturedInit?.body),
      ),
    ).toEqual({
      name: "Heavy Duty Pump",
      itemType: "product",
      shortDescription:
        "Industrial pump",
    });
  });

  it("surfaces structured API errors to the onboarding UI", async () => {
    const fetcher = (async () =>
      jsonResponse(
        {
          error: {
            code: "slug_unavailable",
            message:
              "That catalogue slug is already in use.",
            requestId: "req_test",
          },
        },
        400,
      )) as typeof fetch;

    const api = createOnboardingApi(fetcher);

    await expect(
      api.claimSlug(
        "org_11111111111111111111111111111111",
        "taken",
      ),
    ).rejects.toMatchObject({
      name: "OnboardingApiError",
      status: 400,
      code: "slug_unavailable",
      message:
        "That catalogue slug is already in use.",
      requestId: "req_test",
    });
  });
});
