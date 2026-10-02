export type CatalogueMode =
  | "products"
  | "services"
  | "both";

export type OnboardingBusinessType = {
  code: string;
  name: string;
  description: string | null;
};

export type OnboardingTheme = {
  code: string;
  name: string;
  description: string | null;
};

export type OnboardingState = {
  organization: {
    id: string;
    name: string;
    countryCode: string | null;
    timezone: string;
    businessType: {
      code: string;
      name: string;
    } | null;
  };
  profile: {
    businessName: string;
    city: string | null;
    phone: string | null;
    whatsappNumber: string | null;
    email: string | null;
  };
  catalogue: {
    id: string;
    name: string;
    slug: string | null;
    slugClaimed: boolean;
    mode: CatalogueMode;
    status:
      | "draft"
      | "published"
      | "suspended"
      | "archived";
  } | null;
  website: {
    theme: OnboardingTheme | null;
  };
  firstItem: {
    id: string;
    itemType: "product" | "service";
    name: string;
    slug: string;
    shortDescription: string | null;
    status:
      | "draft"
      | "published"
      | "hidden";
  } | null;
  reference: {
    businessTypes: OnboardingBusinessType[];
    themes: OnboardingTheme[];
    suggestedAttributes: Array<{
      code: string;
      label: string;
      dataType: string;
      appliesTo: string;
      unitHint: string | null;
      sortOrder: number;
      required: boolean;
    }>;
  };
  progress: {
    identityComplete: boolean;
    businessTypeComplete: boolean;
    catalogueStarted: boolean;
    contactsComplete: boolean;
    themeComplete: boolean;
    slugComplete: boolean;
    firstItemComplete: boolean;
    readyToPublish: boolean;
  };
};

export type SlugAvailability = {
  slug: string;
  available: boolean;
  reason:
    | "invalid"
    | "reserved"
    | "claimed"
    | "available";
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

export class OnboardingApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "OnboardingApiError";
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

function apiErrorFromResponse(
  response: Response,
  body: unknown,
): OnboardingApiError {
  const parsed =
    typeof body === "object" && body !== null
      ? (body as ApiErrorBody)
      : {};

  return new OnboardingApiError(
    response.status,
    parsed.error?.code ?? "request_failed",
    parsed.error?.message
      ?? "The request could not be completed.",
    parsed.error?.requestId,
  );
}

export function createOnboardingApi(
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

    const body = await readJson(response);

    if (!response.ok) {
      throw apiErrorFromResponse(
        response,
        body,
      );
    }

    if (
      typeof body !== "object"
      || body === null
      || !("data" in body)
    ) {
      throw new OnboardingApiError(
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
    method: "POST" | "PATCH",
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
    state(organizationId: string) {
      return request<OnboardingState>(
        organizationId,
        "/api/v1/onboarding/state",
      );
    },

    updateIdentity(
      organizationId: string,
      input: {
        businessName: string;
        countryCode: string;
        city: string;
      },
    ) {
      return jsonRequest<OnboardingState>(
        organizationId,
        "/api/v1/onboarding/identity",
        "PATCH",
        input,
      );
    },

    updateBusinessType(
      organizationId: string,
      businessTypeCode: string,
    ) {
      return jsonRequest<OnboardingState>(
        organizationId,
        "/api/v1/onboarding/business-type",
        "PATCH",
        { businessTypeCode },
      );
    },

    updateCatalogueMode(
      organizationId: string,
      mode: CatalogueMode,
    ) {
      return jsonRequest<OnboardingState>(
        organizationId,
        "/api/v1/onboarding/catalogue-mode",
        "PATCH",
        { mode },
      );
    },

    updateContacts(
      organizationId: string,
      input: {
        phone: string | null;
        whatsappNumber: string | null;
        email: string | null;
      },
    ) {
      return jsonRequest<OnboardingState>(
        organizationId,
        "/api/v1/onboarding/contacts",
        "PATCH",
        input,
      );
    },

    updateTheme(
      organizationId: string,
      themeCode: string,
    ) {
      return jsonRequest<OnboardingState>(
        organizationId,
        "/api/v1/onboarding/theme",
        "PATCH",
        { themeCode },
      );
    },

    slugAvailability(
      organizationId: string,
      candidate: string,
    ) {
      const query = new URLSearchParams({
        slug: candidate,
      });

      return request<SlugAvailability>(
        organizationId,
        `/api/v1/onboarding/slug-availability?${query.toString()}`,
      );
    },

    claimSlug(
      organizationId: string,
      slug: string,
    ) {
      return jsonRequest<OnboardingState>(
        organizationId,
        "/api/v1/onboarding/slug",
        "PATCH",
        { slug },
      );
    },

    createFirstItem(
      organizationId: string,
      input: {
        name: string;
        itemType?: "product" | "service";
        shortDescription?: string | null;
      },
    ) {
      return jsonRequest<OnboardingState>(
        organizationId,
        "/api/v1/onboarding/first-item",
        "POST",
        input,
      );
    },
  };
}

export const onboardingApi =
  createOnboardingApi();
