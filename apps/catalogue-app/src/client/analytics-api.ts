import type { AnalyticsSummary } from "@techabanca/domain";
import { AuthoringApiError } from "./authoring-api";

export function createAnalyticsApi(fetcher: typeof fetch = fetch) {
  return { async summary(org: string, days: 7 | 30 | 90, signal?: AbortSignal): Promise<AnalyticsSummary> {
    const response = await fetcher("/api/v1/catalogue/analytics?days=" + days, { signal, cache: "no-store",
      headers: { Accept: "application/json", "X-Techabanca-Organization": org } });
    const body = await response.json().catch(() => null) as { data?: AnalyticsSummary; error?: { code?: string; message?: string } } | null;
    if (!response.ok) throw new AuthoringApiError(response.status, body?.error?.code ?? "request_failed", body?.error?.message ?? "Analytics could not be loaded.");
    if (!body?.data) throw new AuthoringApiError(500, "invalid_response", "The server returned an invalid response.");
    return body.data;
  } };
}
export const analyticsApi = createAnalyticsApi();
