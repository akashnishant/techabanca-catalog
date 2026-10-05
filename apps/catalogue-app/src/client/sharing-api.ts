import type { SharingView } from "@techabanca/domain";
import { AuthoringApiError } from "./authoring-api";

export function createSharingApi(fetcher: typeof fetch = fetch) {
  return { async view(org: string, filters: { search: string; type: "all" | "product" | "service"; page: number }, signal?: AbortSignal): Promise<SharingView> {
    const query = new URLSearchParams({ q: filters.search, type: filters.type, page: String(filters.page) });
    const response = await fetcher("/api/v1/catalogue/sharing?" + query, { signal, cache: "no-store",
      headers: { Accept: "application/json", "X-Techabanca-Organization": org } });
    const body = await response.json().catch(() => null) as { data?: SharingView; error?: { code?: string; message?: string } } | null;
    if (!response.ok) throw new AuthoringApiError(response.status, body?.error?.code ?? "request_failed", body?.error?.message ?? "Sharing tools could not be loaded.");
    if (!body?.data) throw new AuthoringApiError(500, "invalid_response", "The server returned an invalid response.");
    return body.data;
  } };
}
export const sharingApi = createSharingApi();
