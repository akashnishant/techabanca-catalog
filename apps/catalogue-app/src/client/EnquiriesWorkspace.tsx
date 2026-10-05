import { useEffect, useRef, useState } from "react";
import type { EnquiryDetail, EnquiryList, EnquiryStatus } from "@techabanca/domain";
import { enquiryApi } from "./enquiry-api";
import { AuthoringApiError } from "./authoring-api";

const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8e1dd] bg-white px-4 py-2 text-sm font-bold text-[#344047] hover:bg-[#f8faf9] disabled:cursor-not-allowed disabled:opacity-50";
const primary = button + " !border-[#0b1519] !bg-[#0b1519] !text-white";
const input = "mt-2 w-full rounded-xl border border-[#cdd8d2] bg-white px-3 py-3 text-sm text-[#182a25] focus:outline-none focus:ring-2 focus:ring-[#568977]";
const labels = { new: "New", contacted: "Contacted", closed: "Closed" };
const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const failure = (e: unknown) => e instanceof AuthoringApiError
 ? e.status === 401 ? "Your session ended. Sign out and sign in again to continue." : e.message
 : "Enquiries could not be loaded. Refresh and try again.";
function Tag({ status }: { status: EnquiryStatus }) {
 return <span className={"inline-flex rounded-full px-3 py-1 text-xs font-bold " + (status === "new" ? "bg-[#e4f2eb] text-[#216b46]" : status === "contacted" ? "bg-[#edf1fb] text-[#354c82]" : "bg-[#eef0ef] text-[#53615a]")}>{labels[status]}</span>;
}
export function EnquiriesWorkspace({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
 const [data, setData] = useState<EnquiryList | null>(null), [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
 const [query, setQuery] = useState(""), [q, setQ] = useState(""), [status, setStatus] = useState<EnquiryStatus | "">("");
 const [after, setAfter] = useState<string | undefined>(), [previous, setPrevious] = useState<(string | undefined)[]>([]);
 const [selected, setSelected] = useState<string | null>(null), [reload, setReload] = useState(0);
 useEffect(() => {
  const controller = new AbortController(); setLoading(true); setError(null);
  enquiryApi.list(organizationId, { q, status: status || undefined, after }, controller.signal)
   .then(result => { if (!controller.signal.aborted) setData(result); })
   .catch(e => { if (!controller.signal.aborted) { setError(failure(e)); if (e instanceof AuthoringApiError && (e.status === 401 || e.status === 403)) { setData(null); setSelected(null); } } })
   .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  return () => controller.abort();
 }, [organizationId, q, status, after, reload]);
 function reset() { setAfter(undefined); setPrevious([]); setSelected(null); setMessage(null); }
 return <section aria-label="Customer enquiries" className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div><p className="text-xs font-bold uppercase tracking-widest text-[#62796d]">Enquiries</p><h2 className="mt-2 text-2xl font-bold text-[#152922]">Every conversation starts here</h2>
   <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66766d]">Customer details and team notes are available for {data?.retentionDays ?? 365} days from submission. Expired enquiries leave the inbox automatically.</p></div>
   <button className={button} onClick={() => setReload(v => v + 1)} disabled={loading}>Refresh inbox</button>
  </div>
  {!canManage && <p className="rounded-xl bg-[#f2f5f3] p-4 text-sm text-[#5b6d63]">You can view enquiries. Owners and admins can update status, add notes and delete enquiries.</p>}
  <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#dce5df] bg-white p-4" onSubmit={e => { e.preventDefault(); reset(); setQ(query.trim()); setReload(v => v + 1); }}>
   <label className="min-w-0 flex-1 text-sm font-semibold text-[#40594b]" htmlFor="enquiry-search">Search enquiries<input className={input} id="enquiry-search" type="search" maxLength={200} value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, contact, item or message" /></label>
   <label className="text-sm font-semibold text-[#40594b]" htmlFor="enquiry-status">Status<select className={input} id="enquiry-status" value={status} onChange={e => { reset(); setStatus(e.target.value as EnquiryStatus | ""); }}><option value="">All statuses</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
   <button className={primary}>Search</button>
   {(q || status) && <button type="button" className={button} onClick={() => { reset(); setQ(""); setQuery(""); setStatus(""); }}>Clear filters</button>}
  </form>
  {error && <div role="alert" className="rounded-xl border border-[#ecd4c9] bg-[#fff5f1] p-4 text-sm text-[#853c26]">{error}</div>}
  {message && <p role="status" className="rounded-xl bg-[#e9f4ed] p-4 text-sm text-[#26573a]">{message}</p>}
  {data && <div aria-label="Enquiry totals" className="flex flex-wrap gap-3 text-sm text-[#5a6e61]">{Object.entries(labels).map(([key, label]) => <span key={key} className="rounded-xl border border-[#dce5df] bg-white px-4 py-2">{label} <strong className="ml-2 text-[#193b27]">{data.counts[key as EnquiryStatus]}</strong></span>)}</div>}
  {loading && !data ? <p role="status" className="p-6 text-sm text-[#617167]">Loading enquiries…</p> : data && <div className={"grid items-start gap-5 " + (selected ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" : "")}>
   <div className="min-w-0 overflow-hidden rounded-2xl border border-[#dce5df] bg-white">
    {!data.enquiries.length ? <div className="p-8"><h3 className="text-lg font-bold text-[#274033]">{q || status ? "No matching enquiries" : "Your inbox is ready"}</h3><p className="mt-2 text-sm leading-6 text-[#63796a]">{q || status ? "Try a different search or clear your filters." : "Publish your catalogue with the contact page enabled. Customer submissions will appear here."}</p></div>
     : <ul>{data.enquiries.map(enquiry => <li key={enquiry.id} className="border-b border-[#e7eee9] last:border-b-0">
      <button onClick={() => { setSelected(enquiry.id); setMessage(null); }} className={"w-full px-5 py-4 text-left transition hover:bg-[#f3f8f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#568977] " + (selected === enquiry.id ? "bg-[#edf6ef]" : "")} aria-pressed={selected === enquiry.id}>
       <div className="flex flex-wrap items-start justify-between gap-2"><strong className="break-words text-sm text-[#1f3a2b]">{enquiry.contactName}</strong><Tag status={enquiry.status} /></div>
       <p className="mt-1 break-words text-sm text-[#627669]">{enquiry.companyName || enquiry.email || enquiry.phone}</p>
       {enquiry.itemName && <p className="mt-2 break-words text-sm font-medium text-[#486250]">About {enquiry.itemName}</p>}
       <p className="mt-2 text-xs text-[#7a8b7e]">{date(enquiry.createdAt)}</p>
      </button></li>)}</ul>}
    {previous.length > 0 || data.nextCursor ? <nav aria-label="Enquiry pages" className="flex flex-wrap justify-between gap-3 border-t border-[#e4ece6] p-4">
     <button className={button} disabled={!previous.length} onClick={() => { setAfter(previous.at(-1)); setPrevious(v => v.slice(0,-1)); setSelected(null); }}>Previous</button>
     <span className="self-center text-xs text-[#687b6e]">Page {previous.length + 1}</span>
     <button className={button} disabled={!data.nextCursor} onClick={() => { setPrevious(v => [...v, after]); setAfter(data.nextCursor!); setSelected(null); }}>Next</button></nav> : null}
   </div>
   {selected && <EnquiryPanel key={selected} organizationId={organizationId} id={selected} canManage={canManage} onClose={() => setSelected(null)} onChange={() => setReload(v => v + 1)} onDeleted={() => { setSelected(null); setMessage("The enquiry and its team activity were permanently deleted."); setAfter(undefined); setPrevious([]); setReload(v => v + 1); }} />}
  </div>}
 </section>;
}
function EnquiryPanel({ organizationId, id, canManage, onClose, onChange, onDeleted }: { organizationId: string; id: string; canManage: boolean; onClose: () => void; onChange: () => void; onDeleted: () => void }) {
 const [data, setData] = useState<EnquiryDetail | null>(null), [error, setError] = useState<string | null>(null);
 const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [note, setNote] = useState("");
 const [confirmDelete, setConfirmDelete] = useState(false), [message, setMessage] = useState<string | null>(null);
 const mounted = useRef(false), working = useRef(false);
 useEffect(() => { mounted.current = true; const controller = new AbortController();
  enquiryApi.detail(organizationId, id, controller.signal).then(result => { if (!controller.signal.aborted) setData(result); })
   .catch(e => { if (!controller.signal.aborted) setError(failure(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
  return () => { mounted.current = false; controller.abort(); };
 }, [organizationId, id]);
 async function perform(operation: () => Promise<EnquiryDetail | void>, success: string, clearNote = false) {
  if (working.current) return; working.current = true; setBusy(true); setError(null); setMessage(null);
  try { const result = await operation(); if (!mounted.current) return;
   if (!result) { onDeleted(); return; }
   setData(result); if (clearNote) setNote(""); setMessage(success); onChange();
  } catch (e) { if (!mounted.current) return; setError(failure(e)); setConfirmDelete(false);
   if (e instanceof AuthoringApiError && e.status === 401) setData(null);
   if (e instanceof AuthoringApiError && (e.status === 409 || e.status === 404)) {
    try { const latest = await enquiryApi.detail(organizationId, id); if (mounted.current) setData(latest); }
    catch { if (mounted.current) setData(null); } onChange();
   }
  } finally { working.current = false; if (mounted.current) setBusy(false); }
 }
 return <aside aria-label="Enquiry details" className="min-w-0 rounded-2xl border border-[#dce5df] bg-white p-5 sm:p-6">
  <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="text-lg font-bold text-[#254331]">Enquiry details</h3><button className={button} onClick={onClose} disabled={busy}>Close details</button></div>
  {loading && <p role="status" className="mt-5 text-sm text-[#63786a]">Loading details…</p>}
  {error && <p role="alert" className="mt-4 rounded-xl bg-[#fff2ec] p-4 text-sm text-[#8a4028]">{error}</p>}
  {message && <p role="status" className="mt-4 rounded-xl bg-[#e9f4ed] p-4 text-sm text-[#26573a]">{message}</p>}
  {data && <>
   <div className="mt-5 flex flex-wrap items-center gap-3"><h4 className="break-words text-xl font-bold text-[#223e2c]">{data.contactName}</h4><Tag status={data.status} /></div>
   {data.companyName && <p className="mt-1 break-words text-sm text-[#617768]">{data.companyName}</p>}
   <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold text-[#356849]">
    {data.email && <a className="break-all underline" href={"mailto:" + encodeURIComponent(data.email)}>{data.email}</a>}
    {data.phone && <a className="break-all underline" href={"tel:" + encodeURIComponent(data.phone.replace(/[ ().-]/g,""))}>{data.phone}</a>}
   </div>
   {data.itemName && <p className="mt-4 text-sm text-[#597460]">About <strong>{data.itemName}</strong>{data.publicationRevision !== null ? " · Published revision " + data.publicationRevision : ""}</p>}
   <p className="mt-5 whitespace-pre-wrap break-words rounded-xl bg-[#f4f7f4] p-4 text-sm leading-7 text-[#36523e]">{data.message}</p>
   <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs leading-5 text-[#6a7e70]"><dt>Submitted</dt><dd>{date(data.createdAt)}</dd><dt>Retained until</dt><dd>{date(data.expiresAt)}</dd><dt>Consent</dt><dd>{data.consentAt ? "Recorded " + date(data.consentAt) : "Legacy enquiry; no consent timestamp recorded."}</dd></dl>
   {canManage && <div className="mt-5 flex flex-wrap gap-3">
    {data.status === "new" && <button className={primary} disabled={busy} onClick={() => perform(() => enquiryApi.status(organizationId, id, data.version, "contacted"), "Marked as contacted.")}>Mark contacted</button>}
    {data.status !== "closed" && <button className={button} disabled={busy} onClick={() => perform(() => enquiryApi.status(organizationId, id, data.version, "closed"), "Enquiry closed.")}>Close enquiry</button>}
   </div>}
   <div className="mt-6 border-t border-[#e3ece5] pt-5"><h4 className="text-sm font-bold text-[#36573e]">Team activity</h4><p className="mt-1 text-xs text-[#76897b]">Latest 100 events. Notes stay private to this business.</p>
    <ol className="mt-4 space-y-4">{data.activity.map((entry, index) => <li key={index} className="border-l-2 border-[#dce9df] pl-3">
     <p className="text-xs text-[#708276]">{date(entry.createdAt)}{entry.actor ? " · " + entry.actor : ""}</p>
     <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#3b5744]">{entry.type === "created" ? "Enquiry received" : entry.type === "note" ? entry.note : "Status changed to " + labels[entry.toStatus!]}</p>
    </li>)}</ol>
   </div>
   {canManage && <form className="mt-6" onSubmit={e => { e.preventDefault(); if (note.trim()) void perform(() => enquiryApi.note(organizationId, id, data.version, note), "Team note added.", true); }}>
    <label htmlFor="enquiry-note" className="text-sm font-bold text-[#36573e]">Add a team note</label><textarea className={input} id="enquiry-note" rows={3} maxLength={2000} required disabled={busy} value={note} onChange={e => setNote(e.target.value)} />
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[#7a897e]">{note.length}/2,000 characters · Up to 200 notes</span><button className={button} disabled={busy || !note.trim()}>Add note</button></div>
   </form>}
   {canManage && <div className="mt-6 border-t border-[#e3ece5] pt-4">
    {confirmDelete ? <div><p className="text-sm leading-6 text-[#843e2b]">Permanently delete this enquiry and all team activity? This cannot be undone.</p><div className="mt-3 flex flex-wrap gap-3"><button className={button + " !border-[#c26752] !text-[#8d3923]"} disabled={busy} onClick={() => perform(() => enquiryApi.remove(organizationId, id, data.version), "")}>Delete permanently</button><button className={button} disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button></div></div>
    : <button className="min-h-11 text-sm font-bold text-[#92432d] underline disabled:opacity-50" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete enquiry</button>}
   </div>}
   {busy && <p role="status" className="mt-4 text-sm text-[#617667]">Saving…</p>}
  </>}
 </aside>;
}
