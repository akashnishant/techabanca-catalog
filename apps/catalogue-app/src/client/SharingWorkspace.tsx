import { useCallback, useEffect, useRef, useState } from "react";
import type { ShareTarget, SharingView } from "@techabanca/domain";
import { sharingApi } from "./sharing-api";

const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8e1dd] bg-white px-4 py-2 text-sm font-bold text-[#344047] hover:bg-[#f8faf9] disabled:cursor-not-allowed disabled:opacity-50";
const primary = button.replace("border-[#d8e1dd]", "border-transparent").replace("bg-white", "bg-[#baf16d]").replace("text-[#344047]", "text-[#14221e]").replace("hover:bg-[#f8faf9]", "hover:bg-[#afe460]");
export function SharingWorkspace({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<SharingView | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [search, setSearch] = useState(""), [query, setQuery] = useState(""), [type, setType] = useState<"all" | "product" | "service">("all"), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null), [notice, setNotice] = useState("");
  const [qr, setQr] = useState<{ url: string; png: string; svg: string } | null>(null), [qrError, setQrError] = useState(""), [qrAttempt, setQrAttempt] = useState(0);
  const alive = useRef(false), generation = useRef(0), urlInput = useRef<HTMLInputElement>(null), currentUrl = useRef("");
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current; setLoading(true); setError(""); setNotice("");
    try { const value = await sharingApi.view(organizationId, { search: query, type, page }, signal);
      if (alive.current && current === generation.current) { setData(value); setSelected(null); } }
    catch (e) { if (alive.current && !signal?.aborted && current === generation.current) { setData(null); setError(e instanceof Error ? e.message : "Sharing tools could not be loaded."); } }
    finally { if (alive.current && current === generation.current) setLoading(false); }
  }, [organizationId, query, type, page]);
  useEffect(() => { alive.current = true; const controller = new AbortController(); void load(controller.signal);
    return () => { alive.current = false; generation.current++; controller.abort(); }; }, [load]);
  const item = data?.items.find(value => value.id === selected);
  const target: ShareTarget | undefined = !loading && !error ? item?.target ?? data?.publication?.target : undefined;
  const url = target?.url ?? ""; currentUrl.current = url;
  useEffect(() => {
    let canceled = false; setQr(null); setQrError(""); setNotice("");
    if (url) void import("qrcode").then(async module => {
      const options = { errorCorrectionLevel: "M" as const, margin: 4, width: 1024, color: { dark: "#000000", light: "#ffffff" } };
      const [png, svg] = await Promise.all([module.toDataURL(url, { ...options, type: "image/png" }), module.toString(url, { ...options, type: "svg" })]);
      if (!canceled) setQr({ url, png, svg });
    }).catch(() => { if (!canceled) setQrError("The QR code could not be generated. Your link is still available."); });
    return () => { canceled = true; };
  }, [url, qrAttempt]);
  async function copy() {
    if (!url) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(url);
      if (alive.current && currentUrl.current === url) setNotice("Link copied.");
    } catch {
      if (alive.current && currentUrl.current === url) { urlInput.current?.focus(); urlInput.current?.select(); setNotice("Copy was unavailable. The link is selected; use your device’s Copy command."); }
    }
  }
  const readyQr = qr?.url === url ? qr : null;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 24));
  return <section className="space-y-5" aria-labelledby="sharing-heading" aria-busy={loading}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#789c45]">Share</p>
        <h1 id="sharing-heading" className="mt-2 text-2xl font-semibold tracking-tight">Bring your catalogue to your customers</h1>
        <p className="mt-2 text-sm leading-6 text-[#6f7c77]">One public link for your business. A direct link for every published item.</p></div>
      <button className={button} disabled={loading} onClick={() => void load()}>Refresh sharing tools</button>
    </div>
    {loading && <p role="status" className="text-sm text-[#6f7c77]">Loading published links…</p>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} Use Refresh sharing tools to try again.</div>}
    {data && !data.publication && <div className="rounded-2xl border border-[#dce7c9] bg-[#f4f8ec] p-6 text-sm leading-6 text-[#3d5225]">
      <h2 className="text-lg font-semibold">Your public catalogue needs to be available</h2>
      <p className="mt-2">Publish your catalogue with active public access to create share links and QR codes. An unpublished, paused or expired catalogue cannot be shared here.</p>
      <div className="mt-4 flex flex-wrap gap-3"><a href="#workspace/website" className={button}>Open website and publishing</a><a href="#workspace/subscription" className={button}>View subscription</a></div>
    </div>}
    {data?.publication && <>
      {data.deployment !== "production" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <strong>{data.deployment === "local" ? "Local development" : "Staging"} catalogue.</strong> These tools generate the permanent production address. It will reach customers after production routing and this catalogue are activated there.</div>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 rounded-2xl bg-[#14221e] p-6 text-white sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#baf16d]">{item ? "Published item" : "Complete catalogue"} · Revision {data.publication.revision}</p>
          <h2 className="mt-3 break-words text-2xl font-semibold">{item?.name ?? data.publication.businessName}</h2>
          <p className="mt-2 text-sm leading-6 text-[#b3c5bb]">{item ? "Take customers straight to this product or service." : "Use this address on messages, business cards and printed material."}</p>
          <label htmlFor="share-url" className="mt-6 block text-xs font-semibold text-[#b3c5bb]">Public link</label>
          <input id="share-url" ref={urlInput} readOnly value={url} onFocus={event => event.currentTarget.select()}
            className="mt-2 min-h-12 w-full min-w-0 rounded-xl border border-[#4b6056] bg-[#20372b] px-3 text-sm text-white" />
          <div className="mt-4 flex flex-wrap gap-3"><button className={primary} disabled={!target} onClick={() => void copy()}>Copy link</button>
            {target && <a className={button} href={target.whatsappUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Share on WhatsApp</a>}
            {target && data.deployment === "production" && <a className={button} href={url} target="_blank" rel="noopener noreferrer">Open public link</a>}
          </div>
          <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm text-[#baf16d]">{notice}</p>
          <p className="mt-4 text-xs leading-6 text-[#b3c5bb]">The link follows the current public catalogue. Publishing new content keeps this address; changing an item’s slug changes its link.</p>
        </div>
        <div className="rounded-2xl border border-[#dfe5e2] bg-white p-6">
          <h2 className="text-lg font-semibold">A scan away</h2><p className="mt-1 text-sm leading-6 text-[#6f7c77]">QR code for {item ? "this item" : "your catalogue"}.</p>
          <div className="mt-4 flex aspect-square items-center justify-center rounded-xl border border-[#e5eae7] bg-white p-3">
            {readyQr ? <img src={readyQr.png} alt={"QR code for " + (item?.name ?? data.publication.businessName)} width="1024" height="1024" className="h-auto w-full" /> :
              <p role={qrError ? "alert" : "status"} className="p-4 text-center text-sm text-[#6f7c77]">{qrError || (loading ? "Loading public link…" : "Generating QR code…")}</p>}
          </div>
          {readyQr && target && <div className="mt-4 grid grid-cols-2 gap-2">
            <a className={button} href={readyQr.png} download={target.filename + ".png"}>PNG</a>
            <a className={button} href={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(readyQr.svg)} download={target.filename + ".svg"}>SVG</a>
          </div>}
          {qrError && <button className={button + " mt-4 w-full"} onClick={() => setQrAttempt(value => value + 1)}>Retry QR code</button>}
          <p className="mt-4 text-xs leading-5 text-[#6f7c77]">PNG for everyday use. SVG for sharp print layouts. Keep the white border and test a printed scan before distributing.</p>
        </div>
      </div>
      <div className="rounded-2xl border border-[#dfe5e2] bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Share a published item</h2>
          <p className="mt-1 text-sm leading-6 text-[#6f7c77]">Choose an item to update the link, WhatsApp message and QR code above.</p></div>
          <button className={button} aria-pressed={!selected} onClick={() => setSelected(null)}>Use catalogue link</button></div>
        <form className="mt-5 flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setPage(1); }}>
          <div className="min-w-0 flex-1 basis-48"><label htmlFor="share-search" className="sr-only">Search published items</label>
            <input id="share-search" type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search published items"
              className="min-h-11 w-full rounded-xl border border-[#d8e1dd] px-3 text-sm" /></div>
          <div><label htmlFor="share-type" className="sr-only">Item type</label><select id="share-type" value={type} onChange={event => { setType(event.target.value as typeof type); setPage(1); }}
            className="min-h-11 max-w-full rounded-xl border border-[#d8e1dd] bg-white px-3 text-sm"><option value="all">All items</option><option value="product">Products</option><option value="service">Services</option></select></div>
          <button className={button} type="submit">Search</button>
        </form>
        <p className="mt-4 text-xs text-[#6f7c77]">{loading ? "Updating published items…" : data.total + " matching published " + (data.total === 1 ? "item" : "items")}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">{(!loading ? data.items : []).map(value => <button key={value.id} aria-pressed={selected === value.id} onClick={() => setSelected(value.id)}
          className={"min-w-0 rounded-xl border p-4 text-left transition-colors " + (selected === value.id ? "border-[#89b550] bg-[#f4f8ec]" : "border-[#dfe5e2] hover:bg-[#f8faf9]")}>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#789c45]">{value.type}</span>
          <span className="mt-1 block break-words text-sm font-semibold">{value.name}</span><span className="mt-2 block break-all text-xs leading-5 text-[#6f7c77]">{value.target.url}</span>
        </button>)}</div>
        {!loading && !data.items.length && <p role="status" className="mt-5 text-sm text-[#6f7c77]">No published items match these filters. Try a different search or item type.</p>}
        {(totalPages > 1 || page > 1) && <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><button className={button} disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Previous items</button>
          <span className="text-xs text-[#6f7c77]">Page {page} of {totalPages}</span><button className={button} disabled={loading || page >= totalPages} onClick={() => setPage(value => value + 1)}>Next items</button></div>}
      </div>
      <p className="text-xs leading-6 text-[#6f7c77]">Only the active published revision is available here. Draft changes and private previews are excluded. QR generation stays in your browser; no external QR service receives the link. WhatsApp opens a prepared message for you to review and send.</p>
    </>}
  </section>;
}
