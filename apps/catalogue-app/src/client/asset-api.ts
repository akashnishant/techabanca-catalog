import {
  getAssetUploadPolicy, isValidAssetUploadSize,
  type ItemMedia, type ItemMediaInput, type ReadyAssetSummary, type WebsiteMedia, type WebsiteMediaInput,
} from "@techabanca/domain";
import { AuthoringApiError } from "./authoring-api";

type AssetView = ReadyAssetSummary & { status: "pending" | "ready" | "failed" | "deleted" };
async function error(response: Response): Promise<AuthoringApiError> {
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string; requestId?: string } } | null;
  return new AuthoringApiError(response.status, body?.error?.code ?? "request_failed",
    body?.error?.message ?? "The file operation could not be completed.", body?.error?.requestId);
}
async function request<T>(org: string, path: string, payload?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: payload === undefined ? "GET" : "PUT", credentials: "same-origin",
    headers: { "Accept": "application/json", "X-Techabanca-Organization": org,
      ...(payload === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal });
  if (!response.ok) throw await error(response);
  return (await response.json() as { data: T }).data;
}
export const assetApi = {
  item: (org: string, item: string, signal?: AbortSignal) =>
    request<{ media: ItemMedia }>(org, "/api/v1/catalogue/items/" + encodeURIComponent(item) + "/media", undefined, signal),
  saveItem: (org: string, item: string, input: ItemMediaInput) =>
    request<{ media: ItemMedia }>(org, "/api/v1/catalogue/items/" + encodeURIComponent(item) + "/media", input),
  website: (org: string, signal?: AbortSignal) => request<{ media: WebsiteMedia }>(org, "/api/v1/catalogue/website/media", undefined, signal),
  saveWebsite: (org: string, input: WebsiteMediaInput) => request<{ media: WebsiteMedia }>(org, "/api/v1/catalogue/website/media", input),
  list: (org: string, kind: "image" | "document", after?: string, signal?: AbortSignal) =>
    request<{ assets: ReadyAssetSummary[]; nextCursor: string | null }>(org,
      "/api/v1/catalogue/assets?" + new URLSearchParams({ kind, ...(after ? { after } : {}) }), undefined, signal),
  async remove(org: string, asset: ReadyAssetSummary) {
    const response = await fetch("/api/v1/catalogue/assets/" + encodeURIComponent(asset.id), {
      method: "DELETE", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Techabanca-Organization": org },
      body: JSON.stringify({ version: asset.version }),
    });
    if (!response.ok) throw await error(response);
  },
  async blob(org: string, asset: string, signal?: AbortSignal) {
    const response = await fetch("/api/v1/catalogue/assets/" + encodeURIComponent(asset) + "/content", {
      headers: { "X-Techabanca-Organization": org }, credentials: "same-origin", signal,
    });
    if (!response.ok) throw await error(response);
    return response.blob();
  },
  async download(org: string, asset: ReadyAssetSummary) {
    const url = URL.createObjectURL(await assetApi.blob(org, asset.id));
    const link = document.createElement("a");
    link.href = url; link.download = asset.originalFilename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  async upload(org: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal): Promise<ReadyAssetSummary> {
    const policy = getAssetUploadPolicy(file.type);
    if (!policy) throw new Error("Choose a JPEG, PNG, WebP image or a PDF document.");
    if (!isValidAssetUploadSize(policy.assetKind, file.size)) throw new Error(policy.assetKind === "image"
      ? "Choose a non-empty image up to 8 MB." : "Choose a non-empty PDF up to 20 MB.");
    if (policy.assetKind === "image") {
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(file); }
      catch { throw new Error("This image could not be opened. Choose a valid JPEG, PNG or WebP file."); }
      bitmap.close();
    }
    signal.throwIfAborted();
    onProgress(0);
    const response = await fetch("/api/v1/catalogue/assets/upload-intents", { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Techabanca-Organization": org },
      body: JSON.stringify({ originalFilename: file.name, mimeType: policy.mimeType, expectedByteSize: file.size }), signal });
    if (!response.ok) throw await error(response);
    const intent = (await response.json() as { data: {
      asset: AssetView; upload: { url: string; headers: Record<string, string> };
    } }).data;
    // Never send a signed URL or tenant header to a different origin.
    const target = new URL(intent.upload.url, location.origin);
    if (target.origin !== location.origin || target.pathname !== "/api/v1/catalogue/assets/" + intent.asset.id + "/content") {
      throw new Error("The upload address is invalid. Reload and try again.");
    }
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();
      xhr.open("PUT", target.href);
      xhr.setRequestHeader("Content-Type", policy.mimeType);
      xhr.setRequestHeader("X-Techabanca-Organization", org);
      xhr.timeout = 120000;
      xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 85)); };
      const clean = () => signal.removeEventListener("abort", abort);
      xhr.onload = () => {
        clean();
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          let message = "The file upload failed. Retry when your connection is available.";
          try { message = (JSON.parse(xhr.responseText) as { error?: { message?: string } }).error?.message ?? message; } catch { /* fallback */ }
          reject(new Error(message));
        }
      };
      xhr.onerror = () => { clean(); reject(new Error("The upload was interrupted. Check your connection and retry.")); };
      xhr.ontimeout = () => { clean(); reject(new Error("The upload timed out. Check your connection and retry.")); };
      xhr.onabort = () => { clean(); reject(new DOMException("Upload cancelled", "AbortError")); };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { clean(); reject(new DOMException("Upload cancelled", "AbortError")); return; }
      xhr.send(file);
    });
    onProgress(90);
    const complete = await fetch("/api/v1/catalogue/assets/" + intent.asset.id + "/complete", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Techabanca-Organization": org },
      body: JSON.stringify({ version: intent.asset.version }), signal,
    });
    if (!complete.ok) throw await error(complete);
    const ready = (await complete.json() as { data: { asset: AssetView } }).data.asset;
    if (ready.status !== "ready") throw new Error("File verification did not finish. Please retry.");
    onProgress(100);
    return ready;
  },
};
