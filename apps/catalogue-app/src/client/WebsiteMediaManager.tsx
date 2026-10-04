import { useEffect, useState } from "react";
import type { ReadyAssetSummary, WebsiteMedia } from "@techabanca/domain";
import { assetApi } from "./asset-api";
import { AssetPicker, AssetPreview, mediaButton, mediaError } from "./AssetControls";

export function WebsiteMediaManager({ organizationId, canManage, onBlockedChange }: { organizationId: string; canManage: boolean; onBlockedChange?: (blocked: boolean) => void }) {
  const [saved, setSaved] = useState<WebsiteMedia | null>(null);
  const [logo, setLogo] = useState<ReadyAssetSummary | null>(null);
  const [hero, setHero] = useState<ReadyAssetSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [heroUploading, setHeroUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setMessage(null); setSaved(null); setLogo(null); setHero(null);
    assetApi.website(organizationId, controller.signal).then(data => {
      if (!controller.signal.aborted) { setSaved(data.media); setLogo(data.media.logo); setHero(data.media.hero); }
    }).catch(error => { if (!controller.signal.aborted) setError(mediaError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [organizationId, reload]);
  const dirty = saved !== null && (saved.logo?.id !== logo?.id || saved.hero?.id !== hero?.id);
  const blocked = loading || saving || logoUploading || heroUploading;
  useEffect(() => { onBlockedChange?.(blocked || dirty); }, [blocked, dirty, onBlockedChange]);
  async function save() {
    if (!saved || blocked || !canManage) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const result = await assetApi.saveWebsite(organizationId, { version: saved.version, logoAssetId: logo?.id ?? null, heroAssetId: hero?.id ?? null });
      setSaved(result.media); setLogo(result.media.logo); setHero(result.media.hero); setMessage("Website images saved.");
    } catch (error) { setError(mediaError(error)); }
    finally { setSaving(false); }
  }
  return <section aria-label="Website images" className="mt-6 rounded-2xl border border-[#dfe5e2] bg-white p-5 shadow-[0_12px_36px_rgba(8,16,20,0.04)] sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#1d292e]">Business logo and hero image</h2>
      {dirty && <span className="rounded-lg bg-[#f0f5e7] px-2 py-1 text-[10px] font-bold text-[#5e7c31]">Unsaved changes</span>}
    </div>
    <p className="mt-2 text-xs leading-5 text-[#74807b]">Choose your business logo and the main website image. JPEG, PNG or WebP · up to 8 MB each.</p>
    {loading && <p role="status" className="mt-4 text-sm text-[#74807b]">Loading website images...</p>}
    {error && <div role="alert" className="mt-4 rounded-xl border border-[#efc7c1] bg-[#fff8f6] p-3 text-xs leading-5 text-[#8a2f25]">
      {error}
      <button type="button" className={mediaButton + " ml-2"} disabled={blocked}
        onClick={() => { if (!dirty || window.confirm("Discard unsaved image changes and reload?")) setReload(value => value + 1); }}>Reload website images</button>
    </div>}
    {message && <p role="status" className="mt-4 rounded-xl bg-[#f0f5e7] p-3 text-sm text-[#4f7028]">{message}</p>}
    {saved && <div className="mt-5 grid gap-5 md:grid-cols-2">
      {(["logo", "hero"] as const).map(slot => {
        const asset = slot === "logo" ? logo : hero;
        const choose = (asset: ReadyAssetSummary | null) => { setMessage(null); if (slot === "logo") setLogo(asset); else setHero(asset); };
        return <article key={slot} aria-label={slot === "logo" ? "Business logo" : "Hero image"} className="min-w-0 rounded-xl border border-[#dfe5e2] p-4">
          <h3 className="text-sm font-bold text-[#344047]">{slot === "logo" ? "Business logo" : "Hero image"}</h3>
          <p className="mt-1 text-xs leading-5 text-[#74807b]">{slot === "logo" ? "A clear square or transparent logo works well." : "Use a wide photograph that represents your business."}</p>
          {asset ? <><div className="mt-4"><AssetPreview organizationId={organizationId} asset={asset} className="h-44 w-full" /></div>
            <p className="my-3 break-all text-xs font-bold text-[#59665f]">{asset.originalFilename}</p></>
            : <div className="my-4 flex h-44 items-center justify-center rounded-xl border border-dashed border-[#d8e1dd] bg-[#f8faf9] text-xs text-[#87928d]">No {slot === "logo" ? "logo" : "hero image"} selected</div>}
          {canManage && <>
            <AssetPicker key={organizationId + slot} organizationId={organizationId} kind="image" label={slot === "logo" ? "Upload logo" : "Upload hero image"}
              disabled={blocked} onChoose={choose} onBusy={slot === "logo" ? setLogoUploading : setHeroUploading} />
            {asset && <button type="button" className={mediaButton + " mt-3"} disabled={blocked} onClick={() => choose(null)}>Remove {slot === "logo" ? "logo" : "hero image"}</button>}
          </>}
        </article>;
      })}
    </div>}
    {canManage && saved && <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-[#e7ece9] pt-4">
      <button type="button" className={mediaButton} disabled={blocked || !dirty} onClick={() => { setLogo(saved.logo); setHero(saved.hero); setError(null); setMessage(null); }}>Discard changes</button>
      <button type="button" disabled={blocked || !dirty} onClick={() => void save()}
        className="rounded-xl bg-[#0b1519] px-4 py-3 text-xs font-bold text-white hover:bg-[#152126] disabled:opacity-40">{saving ? "Saving..." : "Save website images"}</button>
    </div>}
    {!canManage && <p className="mt-4 text-xs text-[#74807b]">Owner or admin access is required to change website images.</p>}
  </section>;
}
