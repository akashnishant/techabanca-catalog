export type PublicationSummary = {
 id: string; revision: number; state: "building" | "active" | "retired" | "failed"; sourceRevision: number | null;
 createdAt: string; activatedAt: string | null; expiresAt: string | null; sealed: boolean;
};
export type PublicationStatus = {
 catalogueId: string; name: string; slug: string; sourceRevision: number;
 counts: { eligible: number; draft: number; hidden: number; excluded: number };
 ready: boolean; canPublish: boolean; entitled: boolean; issues: string[]; warnings: string[];
 active: PublicationSummary | null; history: PublicationSummary[]; hasChanges: boolean; publicUrl: string; routeStatus: string | null;
};
export type PreparedPublication = { publication: PublicationSummary; sourceRevision: number; expiresAt: string; previewUrl: string };
export class PublicationApiError extends Error {
 constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export function createPublicationApi(fetcher: typeof fetch = fetch) {
 async function request<T>(org: string, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers); headers.set("Accept", "application/json"); headers.set("X-Techabanca-Organization", org);
  const response = await fetcher("/api/v1/catalogue/publications" + path, { ...init, headers, credentials: "same-origin" });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!response.ok) throw new PublicationApiError(response.status, body?.error?.code ?? "publication_failed", body?.error?.message ?? "Publishing could not be completed.");
  if (!body || !("data" in body)) throw new PublicationApiError(503, "invalid_response", "Publishing details could not be loaded.");
  return body.data as T;
 }
 const post = <T,>(org: string, path: string, body: unknown) => request<T>(org, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
 return {
  status: (org: string, signal?: AbortSignal) => request<PublicationStatus>(org, "", { signal }),
  prepare: (org: string, sourceRevision: number) => post<PreparedPublication>(org, "/prepare", { sourceRevision }),
  activate: (org: string, publicationId: string, sourceRevision: number) => post<{ publication: PublicationSummary; publicUrl: string }>(org, "/activate", { publicationId, sourceRevision }),
  unpublish: (org: string, publicationId: string, sourceRevision: number) => post<void>(org, "/unpublish", { publicationId, sourceRevision }),
  discard: (org: string, publicationId: string) => request<void>(org, "/" + encodeURIComponent(publicationId), { method: "DELETE" }),
 };
}
export const publicationApi = createPublicationApi();
