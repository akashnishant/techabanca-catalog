import { useCallback, useEffect, useRef, useState } from "react";
import { publicationApi, PublicationApiError, type PreparedPublication, type PublicationStatus } from "./publication-api";
import { WebsiteMediaManager } from "./WebsiteMediaManager";

const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8e1dd] bg-white px-4 py-2 text-xs font-bold text-[#344047] transition hover:bg-[#f8faf9] disabled:cursor-not-allowed disabled:opacity-50";
const primary = button + " !border-[#0b1519] !bg-[#0b1519] !text-white hover:!bg-[#203235]";
const stateLabel = { building: "Prepared preview", active: "Published", retired: "Previous revision", failed: "Closed preview" };
const sessionEnded = "Your session ended. Sign out and sign in again to continue.";
function failure(error: unknown): string { return error instanceof PublicationApiError ? (error.status === 401 ? sessionEnded : error.message) : "Publishing could not be completed. Refresh and try again."; }

export function WebsiteWorkspace({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
 const [imagesPending, setImagesPending] = useState(false);
 return <>
  <PublishingPanel organizationId={organizationId} canManage={canManage} imagesPending={imagesPending} />
  <WebsiteMediaManager organizationId={organizationId} canManage={canManage} onBlockedChange={setImagesPending} />
 </>;
}
function PublishingPanel({ organizationId, canManage, imagesPending }: { organizationId: string; canManage: boolean; imagesPending: boolean }) {
 const [data, setData] = useState<PublicationStatus | null>(null);
 const [preview, setPreview] = useState<PreparedPublication | null>(null);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState<string | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [message, setMessage] = useState<string | null>(null);
 const [reviewed, setReviewed] = useState(false);
 const [offlineConfirm, setOfflineConfirm] = useState(false);
 const [clock, setClock] = useState(Date.now());
 const [reload, setReload] = useState(0);
 const mounted = useRef(false), working = useRef(false), generation = useRef(0);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
 const refresh = useCallback(() => setReload(value => value + 1), []);
 useEffect(() => {
  const controller = new AbortController(), current = ++generation.current;
  setLoading(true);
  publicationApi.status(organizationId, controller.signal).then(result => {
   if (!controller.signal.aborted && current === generation.current) { setData(result); setError(null); }
  }).catch(error => { if (!controller.signal.aborted && current === generation.current) {
   setError(failure(error));
   if (error instanceof PublicationApiError && error.status === 401) { setData(null); setPreview(null); setReviewed(false); }
  } })
   .finally(() => { if (!controller.signal.aborted && current === generation.current) setLoading(false); });
  return () => controller.abort();
 }, [organizationId, reload]);
 useEffect(() => {
  const focus = () => { if (!working.current) refresh(); };
  window.addEventListener("focus", focus);
  const timer = window.setInterval(() => setClock(Date.now()), 15000);
  return () => { window.removeEventListener("focus", focus); window.clearInterval(timer); };
 }, [refresh]);
 const validPreview = !!preview && !!data && preview.sourceRevision === data.sourceRevision
  && Date.parse(preview.expiresAt) > clock
  && data.history.some(p => p.id === preview.publication.id && p.state === "building");
 useEffect(() => { if (!validPreview) setReviewed(false); }, [validPreview]);
 async function perform(kind: string, operation: () => Promise<void>) {
  if (working.current) return;
  working.current = true; generation.current++; setBusy(kind); setError(null); setMessage(null);
  try {
   await operation();
   if (!mounted.current) return;
   const latest = await publicationApi.status(organizationId);
   if (mounted.current) { setData(latest); setLoading(false); }
  } catch (error) {
   if (mounted.current) {
    setError(failure(error));
    if (error instanceof PublicationApiError && error.status === 401) { setData(null); setPreview(null); setReviewed(false); }
    if (error instanceof PublicationApiError && error.status === 409) { setPreview(null); setReviewed(false); }
   }
  } finally { working.current = false; if (mounted.current) { setBusy(null); setLoading(false); } }
 }
 async function prepare() {
  if (!data || !data.canPublish || imagesPending || loading) return;
  await perform("Preparing", async () => {
   const result = await publicationApi.prepare(organizationId, data.sourceRevision);
   if (mounted.current) { setPreview(result); setReviewed(false); setClock(Date.now()); setMessage("Your private preview is ready. Review it before publishing."); }
  });
 }
 async function activate() {
  if (!preview || !data || !validPreview || !reviewed || imagesPending || !data.canPublish) return;
  await perform("Publishing", async () => {
   const result = await publicationApi.activate(organizationId, preview.publication.id, preview.sourceRevision);
   if (mounted.current) { setPreview(null); setReviewed(false); setMessage("Revision " + result.publication.revision + " has been published."); }
  });
 }
 const blocked = !!busy || loading;
 return <section aria-label="Catalogue publishing" className="rounded-2xl border border-[#dfe5e2] bg-white p-5 shadow-[0_12px_36px_rgba(8,16,20,0.04)] sm:p-8">
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#5e7c31]">Website</p>
    <h1 className="mt-3 text-2xl font-semibold tracking-[-0.025em]">Public catalogue website</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f7c77]">Save your changes, prepare a private preview, then publish the revision you reviewed.</p>
   </div>
   <button type="button" className={button} disabled={blocked} onClick={refresh}>Refresh publishing status</button>
  </div>
  {loading && <p role="status" className="mt-4 text-sm text-[#59665f]">Loading publishing details...</p>}
  {error && <div role="alert" className="mt-4 rounded-xl border border-[#efc7c1] bg-[#fff8f6] p-4 text-sm text-[#8a2f25]">{error}{error !== sessionEnded && <p className="mt-2 text-xs">Refresh the publishing status before retrying.</p>}</div>}
  {message && <p role="status" className="mt-4 rounded-xl bg-[#f0f5e7] p-4 text-sm text-[#4f7028]">{message}</p>}
  {data && <>
   <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
    <div className="min-w-0 rounded-xl border border-[#dfe5e2] bg-[#f8faf9] p-5">
     <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-[#e8efeb] px-2 py-1 text-xs font-bold text-[#344047]">
      {data.routeStatus === "suspended" ? "Publishing paused" : data.active ? "Published revision " + data.active.revision : "Private catalogue"}
     </span>{data.active && data.hasChanges && <span className="rounded-lg bg-[#fff3dc] px-2 py-1 text-xs font-bold text-[#796023]">Unpublished saved changes</span>}</div>
     <p className="mt-3 break-all text-sm font-semibold text-[#1d292e]">{data.publicUrl}</p>
     {data.publicUrl.includes(".localhost:") && <p className="mt-2 text-xs leading-5 text-[#68756f]">This is a local test catalogue. Publishing here does not publish on the internet.</p>}
     {data.active && data.routeStatus === "active" && <a href={data.publicUrl} target="_blank" rel="noopener noreferrer" className={button + " mt-4"}>Open published catalogue</a>}
     {!canManage && <p className="mt-3 text-xs text-[#59665f]">Editor access is read-only. An owner or admin can prepare and publish revisions.</p>}
     {!data.entitled && canManage && <p className="mt-3 text-xs font-semibold text-[#8a2f25]">Publishing is not enabled for this organization.</p>}
    </div>
    <div className="rounded-xl border border-[#dfe5e2] p-5">
     <h2 className="text-sm font-bold text-[#344047]">Included in the next revision</h2>
     <dl className="mt-3 space-y-2 text-xs text-[#68756f]">
      <div className="flex justify-between gap-3"><dt>Visible Published source items</dt><dd className="font-bold text-[#1d292e]">{data.counts.eligible}</dd></div>
      <div className="flex justify-between gap-3"><dt>Draft items excluded</dt><dd>{data.counts.draft}</dd></div>
      <div className="flex justify-between gap-3"><dt>Hidden items excluded</dt><dd>{data.counts.hidden}</dd></div>
      <div className="flex justify-between gap-3"><dt>Items in hidden categories excluded</dt><dd>{data.counts.excluded}</dd></div>
     </dl>
     <p className="mt-4 text-xs leading-5 text-[#68756f]">Only saved content and visible specifications and documents are included.</p>
    </div>
   </div>
   {data.issues.length > 0 && <div className="mt-5 rounded-xl border border-[#efc7c1] bg-[#fff8f6] p-4"><h2 className="text-sm font-bold text-[#8a2f25]">Before you can publish</h2>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#8a2f25]">{data.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
   {data.warnings.map(warning => <p key={warning} className="mt-4 rounded-xl bg-[#fff3dc] p-3 text-xs leading-5 text-[#796023]">{warning}</p>)}
   {imagesPending && canManage && <p role="status" className="mt-4 text-xs font-semibold text-[#796023]">Finish uploads and save or discard website image changes before preparing or publishing.</p>}
   {canManage && <div className="mt-5 flex flex-wrap items-center gap-3">
    <button type="button" className={primary} disabled={blocked || imagesPending || !data.canPublish} onClick={() => void prepare()}>{busy === "Preparing" ? "Preparing preview..." : "Prepare private preview"}</button>
    <p className="max-w-md text-xs leading-5 text-[#68756f]">Each new preview replaces the previous private preview. Preview links expire after 15 minutes.</p>
   </div>}
   {preview && <div className="mt-6 rounded-xl border border-[#cbdab7] bg-[#f7faf2] p-5">
    <h2 className="text-base font-semibold text-[#1d292e]">Review revision {preview.publication.revision}</h2>
    <p className="mt-2 text-xs leading-5 text-[#68756f]">{validPreview ? "This saved snapshot is frozen for review." : "This preview expired, was replaced, or your saved content changed. Prepare a new preview."}</p>
    {validPreview && <>
     <p className="mt-2 text-xs text-[#68756f]">Expires {new Date(preview.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
     <div className="mt-4 flex flex-wrap gap-2"><a href={preview.previewUrl} target="_blank" rel="noopener noreferrer" className={button}>Open private preview</a>
      <button type="button" className={button} disabled={blocked} onClick={() => void perform("Discarding", async () => { await publicationApi.discard(organizationId, preview.publication.id); if (mounted.current) { setPreview(null); setMessage("Private preview discarded."); } })}>Discard private preview</button></div>
     <label className="mt-5 flex items-start gap-3 text-xs leading-5 text-[#344047]"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-[#4f7028]" checked={reviewed} disabled={blocked} onChange={event => setReviewed(event.target.checked)} />I reviewed this preview and want to publish this revision.</label>
     <button type="button" className={primary + " mt-4"} disabled={blocked || !reviewed || imagesPending || !data.canPublish} onClick={() => void activate()}>{busy === "Publishing" ? "Publishing..." : "Publish reviewed revision"}</button>
    </>}
   </div>}
   {data.active && canManage && data.routeStatus === "active" && <div className="mt-6 border-t border-[#e7ece9] pt-5">
    {!offlineConfirm ? <button type="button" className={button} disabled={blocked} onClick={() => setOfflineConfirm(true)}>Take catalogue offline</button> :
     <div className="rounded-xl border border-[#efc7c1] bg-[#fff8f6] p-4"><p className="text-sm font-semibold text-[#8a2f25]">Take the published catalogue offline?</p>
      <p className="mt-2 text-xs leading-5 text-[#8a2f25]">Visitors will no longer see its pages or files. Saved content and previous revisions will be retained.</p>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked} onClick={() => setOfflineConfirm(false)}>Cancel</button>
       <button type="button" className={primary} disabled={blocked} onClick={() => void perform("Unpublishing", async () => { await publicationApi.unpublish(organizationId, data.active!.id, data.sourceRevision); if (mounted.current) { setPreview(null); setOfflineConfirm(false); setMessage("Catalogue taken offline. Your saved content is retained."); } })}>{busy === "Unpublishing" ? "Taking offline..." : "Confirm take offline"}</button></div></div>}
   </div>}
   {data.history.length > 0 && <div className="mt-7 border-t border-[#e7ece9] pt-5"><h2 className="text-sm font-bold text-[#344047]">Recent revisions</h2>
    <p className="mt-1 text-xs text-[#68756f]">The latest 20 publication records. Previous revisions are retained for history.</p>
    <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[#e7ece9] text-[#68756f]"><th className="p-3">Revision</th><th className="p-3">Status</th><th className="p-3">Prepared</th></tr></thead>
     <tbody>{data.history.map(p => <tr key={p.id} className="border-b border-[#e7ece9]"><th className="p-3 font-semibold">{p.revision}</th><td className="p-3">{stateLabel[p.state]}</td><td className="whitespace-nowrap p-3 text-[#68756f]">{new Date(p.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div></div>}
  </>}
 </section>;
}
