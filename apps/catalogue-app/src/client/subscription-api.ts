import type { SubscriptionView } from "@techabanca/domain";
import { AuthoringApiError } from "./authoring-api";

export function createSubscriptionApi(fetcher: typeof fetch = fetch) {
  async function request(org: string, path = "", init: RequestInit = {}): Promise<SubscriptionView> {
    const headers = new Headers(init.headers); headers.set("Accept", "application/json"); headers.set("X-Techabanca-Organization", org);
    const response = await fetcher("/api/v1/catalogue/subscription" + path, { ...init, headers, cache: "no-store" });
    const body = await response.json().catch(() => null) as { data?: SubscriptionView; error?: { code?: string; message?: string } } | null;
    if (!response.ok) throw new AuthoringApiError(response.status, body?.error?.code ?? "request_failed", body?.error?.message ?? "Your subscription could not be loaded.");
    if (!body?.data) throw new AuthoringApiError(500, "invalid_response", "The server returned an invalid response.");
    return body.data;
  }
  const write = (org: string, action: string, body: unknown) => request(org, "/" + action,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { summary: (org: string, signal?: AbortSignal) => request(org, "", { signal }),
    trial: (org: string) => write(org, "trial", {}),
    checkout: (org: string, offerId: string, requestId: string) => write(org, "checkout", { offerId, requestId }),
    cancel: (org: string, id: string, version: number) => write(org, "cancel", { id, version }) };
}
export const subscriptionApi = createSubscriptionApi();
