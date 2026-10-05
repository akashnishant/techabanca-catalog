import type { EnquiryDetail, EnquiryList, EnquiryStatus } from "@techabanca/domain";
import { AuthoringApiError } from "./authoring-api";

export function createEnquiryApi(fetcher: typeof fetch = fetch) {
 async function request<T>(organizationId: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json"); headers.set("X-Techabanca-Organization", organizationId);
  const response = await fetcher("/api/v1/catalogue/enquiries" + path, { ...init, headers, cache: "no-store" });
  const body = response.status === 204 ? null : await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!response.ok) throw new AuthoringApiError(response.status, body?.error?.code ?? "request_failed", body?.error?.message ?? "The enquiry request could not be completed.");
  if (response.status === 204) return undefined as T;
  if (!body || !("data" in body)) throw new AuthoringApiError(500, "invalid_response", "The server returned an invalid response.");
  return body.data as T;
 }
 const write = <T>(org: string, id: string, path: string, method: string, payload: unknown) =>
  request<T>(org, "/" + encodeURIComponent(id) + path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
 return {
  list(org: string, filters: { q?: string; status?: EnquiryStatus; after?: string } = {}, signal?: AbortSignal) {
   const search = new URLSearchParams();
   for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value);
   return request<EnquiryList>(org, search.size ? "?" + search : "", { signal });
  },
  detail: (org: string, id: string, signal?: AbortSignal) => request<EnquiryDetail>(org, "/" + encodeURIComponent(id), { signal }),
  status: (org: string, id: string, version: number, status: EnquiryStatus) => write<EnquiryDetail>(org, id, "/status", "POST", { version, status }),
  note: (org: string, id: string, version: number, note: string) => write<EnquiryDetail>(org, id, "/notes", "POST", { version, note }),
  remove: (org: string, id: string, version: number) => write<void>(org, id, "", "DELETE", { version }),
 };
}
export const enquiryApi = createEnquiryApi();
