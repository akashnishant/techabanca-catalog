import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  MAX_ITEM_DOCUMENTS, MAX_ITEM_IMAGES, type ItemMedia, type ReadyAssetSummary,
} from "@techabanca/domain";
import { assetApi } from "./asset-api";
import { AssetPicker, AssetPreview, fileSize, mediaButton, mediaError, mediaInput } from "./AssetControls";

export type ItemMediaHandle = { validate: () => void; save: (itemId: string) => Promise<void> };
export const ItemMediaEditor = forwardRef<ItemMediaHandle, {
  organizationId: string; itemId: string | null; disabled: boolean; onBusy: (busy: boolean) => void;
}>(function ItemMediaEditor({ organizationId, itemId, disabled, onBusy }, ref) {
  const [media, setMedia] = useState<ItemMedia>({ itemId: itemId ?? "", version: 1, images: [], documents: [] });
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(itemId === null);
  const [loading, setLoading] = useState(itemId !== null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (itemId === null) return () => controller.abort();
    setLoading(true); setLoaded(false); setError(null);
    assetApi.item(organizationId, itemId, controller.signal).then(data => {
      if (!controller.signal.aborted) { setMedia(data.media); setDirty(false); setLoaded(true); }
    }).catch(error => { if (!controller.signal.aborted) setError(mediaError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [organizationId, itemId, reload]);
  useEffect(() => { onBusy(loading || uploading); }, [loading, uploading, onBusy]);
  useImperativeHandle(ref, () => ({
    validate() {
      if (!loaded || loading || uploading) throw new Error("Wait for media to finish loading or uploading before saving.");
    },
    async save(savedItemId) {
      if (!loaded || loading || uploading) throw new Error("Reload media before saving.");
      if (!dirty) return;
      try {
        const result = await assetApi.saveItem(organizationId, savedItemId, {
          version: media.version,
          images: media.images.map(({ assetId, altText, isPrimary }) => ({ assetId, altText, isPrimary })),
          documents: media.documents.map(({ assetId, label, isVisible }) => ({ assetId, label, isVisible })),
        });
        setMedia(result.media); setDirty(false); setError(null);
      } catch (error) { setError(mediaError(error)); throw error; }
    },
  }), [organizationId, media, dirty, loaded, loading, uploading]);
  function change(next: ItemMedia) { setMedia(next); setDirty(true); setError(null); }
  function add(asset: ReadyAssetSummary) {
    if ([...media.images, ...media.documents].some(row => row.assetId === asset.id)) return;
    if (asset.assetKind === "image" && media.images.length < MAX_ITEM_IMAGES) {
      change({ ...media, images: [...media.images, { assetId: asset.id, asset, altText: null,
        isPrimary: media.images.length === 0, sortOrder: media.images.length }] });
    } else if (asset.assetKind === "document" && media.documents.length < MAX_ITEM_DOCUMENTS) {
      change({ ...media, documents: [...media.documents, { assetId: asset.id, asset, label: null,
        isVisible: true, sortOrder: media.documents.length }] });
    }
  }
  function removeImage(id: string) {
    const images = media.images.filter(image => image.assetId !== id);
    if (images.length && !images.some(image => image.isPrimary)) images[0] = { ...images[0], isPrimary: true };
    change({ ...media, images });
  }
  function move(kind: "images" | "documents", index: number, direction: number) {
    if (kind === "images") {
      const rows = [...media.images]; [rows[index], rows[index + direction]] = [rows[index + direction], rows[index]];
      change({ ...media, images: rows });
    } else {
      const rows = [...media.documents]; [rows[index], rows[index + direction]] = [rows[index + direction], rows[index]];
      change({ ...media, documents: rows });
    }
  }
  async function download(asset: ReadyAssetSummary) {
    setDownloadError(null);
    try { await assetApi.download(organizationId, asset); } catch (error) { setDownloadError(mediaError(error)); }
  }
  const blocked = disabled || loading || uploading || !loaded;
  const excluded = [...media.images, ...media.documents].map(row => row.assetId);
  return <section aria-label="Item media" className="mt-7 border-t border-[#e7ece9] pt-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-semibold text-[#1d292e]">Images and documents</h3>
      {dirty && <span className="rounded-lg bg-[#f0f5e7] px-2 py-1 text-[10px] font-bold text-[#5e7c31]">Unsaved media changes</span>}
    </div>
    <p className="mt-2 text-xs leading-5 text-[#74807b]">Add clear product photos and useful documents. Attachment changes are saved with the item.</p>
    {loading && <p role="status" className="mt-3 text-xs text-[#74807b]">Loading item media...</p>}
    {error && <div role="alert" className="mt-3 rounded-xl border border-[#efc7c1] bg-[#fff8f6] p-3 text-xs leading-5 text-[#8a2f25]">
      {error}
      {itemId && <button type="button" className={mediaButton + " ml-2"} disabled={disabled || uploading}
        onClick={() => { if (!dirty || window.confirm("Discard unsaved media changes and load the saved media?")) setReload(value => value + 1); }}>Reload media</button>}
    </div>}
    {downloadError && <p role="alert" className="mt-3 text-xs text-[#8a2f25]">{downloadError}</p>}
    <fieldset className="mt-5 min-w-0" disabled={disabled}>
      <legend className="text-xs font-bold text-[#344047]">Images · {media.images.length}/{MAX_ITEM_IMAGES}</legend>
      <p className="mb-3 mt-1 text-xs leading-5 text-[#74807b]">JPEG, PNG or WebP · up to 8 MB each. The primary image is the catalogue cover.</p>
      <AssetPicker organizationId={organizationId} kind="image" label="Upload image" excludedIds={excluded}
        disabled={blocked || media.images.length >= MAX_ITEM_IMAGES} onChoose={add} onBusy={setUploading} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {media.images.map((image, index) => <article key={image.assetId} aria-label={"Image " + image.asset.originalFilename}
          className="min-w-0 rounded-xl border border-[#dfe5e2] bg-white p-3">
          <AssetPreview organizationId={organizationId} asset={image.asset} />
          <p className="mt-3 break-all text-xs font-bold text-[#344047]">{image.asset.originalFilename}</p>
          <p className="mt-1 text-[10px] text-[#87928d]">{fileSize(image.asset.byteSize)}</p>
          <label className="mt-3 block text-xs font-bold text-[#59665f]">Alt text
            <input aria-label={"Alt text for " + image.asset.originalFilename} maxLength={300} className={mediaInput} value={image.altText ?? ""}
              disabled={blocked} placeholder="Describe what the image shows"
              onChange={event => change({ ...media, images: media.images.map(row => row.assetId === image.assetId ? { ...row, altText: event.target.value } : row) })} />
          </label>
          <label className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#59665f]">
            <input type="radio" name="primary-item-image" aria-label={"Primary image " + image.asset.originalFilename} checked={image.isPrimary} disabled={blocked}
              onChange={() => change({ ...media, images: media.images.map(row => ({ ...row, isPrimary: row.assetId === image.assetId })) })} className="accent-[#7eac43]" />Primary image
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={mediaButton} disabled={blocked || index === 0} aria-label={"Move " + image.asset.originalFilename + " earlier"} onClick={() => move("images", index, -1)}>Move up</button>
            <button type="button" className={mediaButton} disabled={blocked || index === media.images.length - 1} aria-label={"Move " + image.asset.originalFilename + " later"} onClick={() => move("images", index, 1)}>Move down</button>
            <button type="button" className={mediaButton} disabled={blocked} aria-label={"Remove " + image.asset.originalFilename} onClick={() => removeImage(image.assetId)}>Remove</button>
          </div>
        </article>)}
      </div>
    </fieldset>
    <fieldset className="mt-6 min-w-0" disabled={disabled}>
      <legend className="text-xs font-bold text-[#344047]">PDF documents · {media.documents.length}/{MAX_ITEM_DOCUMENTS}</legend>
      <p className="mb-3 mt-1 text-xs leading-5 text-[#74807b]">PDF only · up to 20 MB each. Add safety sheets, certificates or brochures.</p>
      <AssetPicker organizationId={organizationId} kind="document" label="Upload PDF" excludedIds={excluded}
        disabled={blocked || media.documents.length >= MAX_ITEM_DOCUMENTS} onChoose={add} onBusy={setUploading} />
      <div className="mt-4 space-y-3">
        {media.documents.map((document, index) => <article key={document.assetId} aria-label={"Document " + document.asset.originalFilename}
          className="min-w-0 rounded-xl border border-[#dfe5e2] bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="break-all text-xs font-bold text-[#344047]">{document.asset.originalFilename}</p>
              <p className="mt-1 text-[10px] text-[#87928d]">PDF · {fileSize(document.asset.byteSize)}</p></div>
            <button type="button" className={mediaButton + " shrink-0"} disabled={disabled} aria-label={"Download " + document.asset.originalFilename} onClick={() => void download(document.asset)}>Download</button>
          </div>
          <label className="mt-3 block text-xs font-bold text-[#59665f]">Document label
            <input aria-label={"Label for " + document.asset.originalFilename} maxLength={160} className={mediaInput} value={document.label ?? ""} disabled={blocked}
              placeholder="e.g. Safety data sheet" onChange={event => change({ ...media, documents: media.documents.map(row => row.assetId === document.assetId ? { ...row, label: event.target.value } : row) })} />
          </label>
          <label className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#59665f]">
            <input type="checkbox" aria-label={"Show " + document.asset.originalFilename + " publicly"} checked={document.isVisible} disabled={blocked}
              className="accent-[#7eac43]" onChange={event => change({ ...media, documents: media.documents.map(row => row.assetId === document.assetId ? { ...row, isVisible: event.target.checked } : row) })} />Show when published
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={mediaButton} disabled={blocked || index === 0} aria-label={"Move " + document.asset.originalFilename + " earlier"} onClick={() => move("documents", index, -1)}>Move up</button>
            <button type="button" className={mediaButton} disabled={blocked || index === media.documents.length - 1} aria-label={"Move " + document.asset.originalFilename + " later"} onClick={() => move("documents", index, 1)}>Move down</button>
            <button type="button" className={mediaButton} disabled={blocked} aria-label={"Remove " + document.asset.originalFilename}
              onClick={() => change({ ...media, documents: media.documents.filter(row => row.assetId !== document.assetId) })}>Remove</button>
          </div>
        </article>)}
      </div>
    </fieldset>
    {!media.images.length && !media.documents.length && !loading && <p className="mt-4 text-xs text-[#87928d]">No files attached yet.</p>}
    <p className="mt-4 text-[10px] leading-5 text-[#87928d]">Removing a file detaches it from this item. Verified uploads remain available to reuse.</p>
  </section>;
});
