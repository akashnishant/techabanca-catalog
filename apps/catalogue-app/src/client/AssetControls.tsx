import { useEffect, useRef, useState } from "react";
import type { ReadyAssetSummary } from "@techabanca/domain";
import { assetApi } from "./asset-api";

export const mediaButton = "rounded-lg border border-[#d8e1dd] bg-white px-3 py-2 text-xs font-bold text-[#344047] transition hover:bg-[#f4f7f5] disabled:cursor-not-allowed disabled:opacity-40";
export const mediaInput = "mt-2 w-full rounded-lg border border-[#d8e1dd] bg-white px-3 py-2 text-sm text-[#1d292e] outline-none focus:border-[#8eb84f] focus:ring-2 focus:ring-[#BAF16D]/25";
export function fileSize(bytes: number) { return bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB"; }
export function mediaError(error: unknown) { return error instanceof Error ? error.message : "Files could not be loaded or saved. Please try again."; }

export function AssetPreview({ organizationId, asset, className = "h-32 w-full" }: {
  organizationId: string; asset: ReadyAssetSummary; className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let currentUrl: string | null = null;
    setUrl(null); setFailed(false);
    assetApi.blob(organizationId, asset.id, controller.signal).then(blob => {
      if (!controller.signal.aborted) { currentUrl = URL.createObjectURL(blob); setUrl(currentUrl); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (currentUrl) URL.revokeObjectURL(currentUrl); };
  }, [organizationId, asset.id]);
  return <div className={"flex items-center justify-center overflow-hidden rounded-xl bg-[#f0f4f1] " + className}>
    {url && !failed ? <img src={url} alt={asset.originalFilename} onError={() => setFailed(true)} className="h-full w-full object-contain" />
      : <span className="px-3 text-center text-xs text-[#74807b]">{failed ? "Preview unavailable" : "Loading image..."}</span>}
  </div>;
}

export function AssetPicker({ organizationId, kind, label, disabled, excludedIds = [], onChoose, onBusy }: {
  organizationId: string; kind: "image" | "document"; label: string; disabled?: boolean; excludedIds?: string[];
  onChoose: (asset: ReadyAssetSummary) => void; onBusy?: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<ReadyAssetSummary[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const listController = useRef<AbortController | null>(null);
  const busyCallback = useRef(onBusy);
  busyCallback.current = onBusy;
  useEffect(() => () => { uploadController.current?.abort(); listController.current?.abort(); busyCallback.current?.(false); }, []);
  async function load(after?: string) {
    listController.current?.abort();
    const controller = new AbortController(); listController.current = controller;
    setLoading(true); setError(null);
    try {
      const data = await assetApi.list(organizationId, kind, after, controller.signal);
      if (!controller.signal.aborted) {
        setAssets(current => after ? [...current, ...data.assets.filter(asset => !current.some(row => row.id === asset.id))] : data.assets);
        setNext(data.nextCursor); setOpen(true);
      }
    } catch (error) { if (!controller.signal.aborted) setError(mediaError(error)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  async function upload(selected: File) {
    if (uploading || disabled) return;
    if ((kind === "image" && !["image/jpeg", "image/png", "image/webp"].includes(selected.type))
      || (kind === "document" && selected.type !== "application/pdf")) {
      setFile(null);
      setError(kind === "image" ? "Choose a JPEG, PNG or WebP image." : "Choose a PDF document."); return;
    }
    const controller = new AbortController(); uploadController.current = controller;
    setFile(selected); setUploading(true); setProgress(0); setError(null); busyCallback.current?.(true);
    try {
      const asset = await assetApi.upload(organizationId, selected, setProgress, controller.signal);
      if (!controller.signal.aborted) { onChoose(asset); setFile(null); setOpen(false); }
    } catch (error) { if (!controller.signal.aborted) setError(mediaError(error)); }
    finally {
      if (!controller.signal.aborted) { setUploading(false); busyCallback.current?.(false); }
    }
  }
  async function remove(asset: ReadyAssetSummary) {
    if (!window.confirm("Remove this file from your uploaded files? Files attached to an item or website must be detached first.")) return;
    setRemoving(asset.id); setError(null); busyCallback.current?.(true);
    try {
      await assetApi.remove(organizationId, asset);
      setAssets(current => current.filter(row => row.id !== asset.id));
    } catch (error) { setError(mediaError(error)); }
    finally { setRemoving(null); busyCallback.current?.(false); }
  }
  function cancelUpload() {
    uploadController.current?.abort();
    setUploading(false); setFile(null); setError(null); busyCallback.current?.(false);
  }
  const available = assets.filter(asset => !excludedIds.includes(asset.id)
    && asset.originalFilename.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <label className={mediaButton + (disabled || uploading ? " opacity-40" : " cursor-pointer")}>
        {label}
        <input className="sr-only" type="file" aria-label={label} disabled={disabled || uploading}
          accept={kind === "image" ? "image/jpeg,image/png,image/webp" : "application/pdf"}
          onChange={event => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) void upload(selected); }} />
      </label>
      <button type="button" className={mediaButton} disabled={disabled || uploading || loading}
        onClick={() => open ? setOpen(false) : void load()}>Choose from uploads</button>
    </div>
    {uploading && <div role="status" aria-live="polite" className="rounded-xl border border-[#dfe5e2] bg-[#f8faf9] p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-[#59665f]">
        <span className="min-w-0 break-all">{file?.name} · {progress >= 90 ? "Verifying..." : "Uploading " + progress + "%"}</span>
        <button type="button" className={mediaButton} onClick={cancelUpload}>Cancel upload</button>
      </div>
      <progress aria-label="Upload progress" className="mt-2 h-2 w-full accent-[#7eac43]" max={100} value={progress} />
    </div>}
    {error && <div role="alert" className="rounded-xl border border-[#efc7c1] bg-[#fff8f6] p-3 text-xs leading-5 text-[#8a2f25]">
      {error}
      {file && !uploading && <button type="button" className={mediaButton + " ml-2"} disabled={disabled} onClick={() => void upload(file)}>Retry upload</button>}
    </div>}
    {loading && <p role="status" className="text-xs text-[#74807b]">Loading verified uploads...</p>}
    {open && <div className="rounded-xl border border-[#dfe5e2] bg-[#f8faf9] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-[#344047]">Verified {kind === "image" ? "images" : "PDFs"}</span>
        <button type="button" className={mediaButton} onClick={() => setOpen(false)}>Close uploads</button>
      </div>
      <label className="text-xs font-bold text-[#59665f]">Find an uploaded file
        <input className={mediaInput} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search these filenames" />
      </label>
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
        {available.map(asset => <div key={asset.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#dfe5e2] bg-white p-2">
          <button type="button" disabled={disabled || uploading || removing !== null}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 p-1 text-left disabled:opacity-40"
            aria-label={"Use " + asset.originalFilename} onClick={() => { onChoose(asset); setOpen(false); }}>
            <span className="min-w-0 break-all text-xs font-bold text-[#344047]">{asset.originalFilename}</span>
            <span className="shrink-0 text-[10px] text-[#74807b]">{fileSize(asset.byteSize)}</span>
          </button>
          <button type="button" className={mediaButton} disabled={disabled || uploading || removing !== null}
            aria-label={"Delete upload " + asset.originalFilename} onClick={() => void remove(asset)}>{removing === asset.id ? "Removing..." : "Delete"}</button>
        </div>)}
        {!available.length && !loading && <p className="py-3 text-xs text-[#74807b]">No matching files available. Upload a file or load more.</p>}
      </div>
      {next && <button type="button" disabled={loading} className={mediaButton + " mt-3"} onClick={() => void load(next)}>Load more uploads</button>}
    </div>}
  </div>;
}
