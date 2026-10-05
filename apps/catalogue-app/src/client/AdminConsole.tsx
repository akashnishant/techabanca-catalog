import { useEffect, useRef, useState, type ReactNode } from "react";
import { MODERATION_REASONS, type AdminOverview, type AdminCatalogueDetail, type AdminCaseDetail, type AdminPage, type AdminCatalogue, type AdminCase, type AdminUser, type AdminReservedSlug } from "@techabanca/domain";
import { AdminApiError, adminApi } from "./admin-api";
type Tab="overview"|"catalogues"|"cases"|"users"|"reserved";
type Listing=AdminPage<AdminCatalogue>|AdminPage<AdminCase>|AdminPage<AdminUser>|AdminPage<AdminReservedSlug>;
const input="mt-2 w-full rounded-xl border border-[#d8e1dd] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#789c45] focus:ring-2 focus:ring-[#BAF16D]/30 disabled:opacity-50";
const button="rounded-xl border border-[#d8e1dd] bg-white px-4 py-2.5 text-sm font-semibold hover:bg-[#f2f6ed] disabled:opacity-40 disabled:cursor-not-allowed";
const primary="rounded-xl border border-[#0b1519] bg-[#0b1519] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#243238] disabled:opacity-40 disabled:cursor-not-allowed";
const panel="rounded-2xl border border-[#e0e6e3] bg-white p-5 sm:p-6";
const reasonLabel=(s:string)=>s.replace(/_/g," ");
const bytes=(n:number)=>n<1048576?(n/1024).toFixed(1)+" KB":(n/1048576).toFixed(1)+" MB";
const date=(s:string)=>new Date(s).toLocaleString();
const newCaseId=()=>"mod_"+crypto.randomUUID().replace(/-/g,"");
function Pager({page,total,size=24,busy,onPage}:{page:number;total:number;size?:number;busy:boolean;onPage:(page:number)=>void}){
 const pages=Math.max(1,Math.ceil(total/size));
 return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#62716a]"><span>{total} results · Page {page} of {pages}</span><div className="flex gap-2"><button className={button} disabled={busy||page<=1} onClick={()=>onPage(page-1)}>Previous</button><button className={button} disabled={busy||page>=pages} onClick={()=>onPage(page+1)}>Next</button></div></div>;
}
function Badge({value}:{value:string}){return <span className="rounded-md bg-[#f0f4ed] px-2 py-1 text-xs font-semibold capitalize text-[#4e6044]">{reasonLabel(value)}</span>;}
export function AdminConsole({brand,user,onLogout}:{brand:ReactNode;user:string;onLogout:()=>Promise<void>}){
 const [tab,setTab]=useState<Tab>("overview"),[overview,setOverview]=useState<AdminOverview|null>(null),[loadedList,setLoadedList]=useState<{tab:Tab;query:string;state:string;page:number;refresh:number;data:Listing}|null>(null);
 const [query,setQuery]=useState(""),[search,setSearch]=useState(""),[state,setState]=useState("all"),[page,setPage]=useState(1);
 const [catalogue,setCatalogue]=useState<AdminCatalogueDetail|null>(null),[record,setRecord]=useState<AdminCaseDetail|null>(null);
 const [loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[busy,setBusy]=useState(false),[locked,setLocked]=useState(false);
 const [error,setError]=useState(""),[success,setSuccess]=useState(""),[refresh,setRefresh]=useState(0);
 const [summary,setSummary]=useState(""),[reason,setReason]=useState("other"),[caseId,setCaseId]=useState(newCaseId);
 const [note,setNote]=useState(""),[targetStatus,setTargetStatus]=useState("reviewing"),[reviewed,setReviewed]=useState(false);
 const [slug,setSlug]=useState(""),[reservationReason,setReservationReason]=useState("");
 const list=loadedList&&loadedList.tab===tab&&loadedList.query===query&&loadedList.state===state&&loadedList.page===page&&loadedList.refresh===refresh?loadedList.data:null;
 function setList(data:Listing|null){setLoadedList(data?{tab,query,state,page,refresh,data}:null);}
 const detailRequest=useRef<AbortController|null>(null),generation=useRef(0),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;detailRequest.current?.abort();};},[]);
 function fail(e:unknown){
  if(e instanceof Error&&e.name==="AbortError")return;
  if(e instanceof AdminApiError&&(e.status===401||e.status===403)){setLocked(true);setOverview(null);setList(null);setCatalogue(null);setRecord(null);}
  setError(e instanceof AdminApiError?e.message:"The request could not be completed. Please try again.");
 }
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setList(null);setOverview(null);setError("");
  const run=async()=>{try{
   const access=await adminApi.access(controller.signal);if(!access.enabled)throw new AdminApiError(403,"Platform administration access is required.");
   setLocked(false);
   if(tab==="overview")setOverview(await adminApi.overview(controller.signal));
   else if(tab==="catalogues")setList(await adminApi.catalogues(query,state,page,controller.signal));
   else if(tab==="cases")setList(await adminApi.cases(query,state,page,controller.signal));
   else if(tab==="users")setList(await adminApi.users(query,state,page,controller.signal));
   else setList(await adminApi.reserved(query,page,controller.signal));
  }catch(e){if(!controller.signal.aborted)fail(e);}finally{if(!controller.signal.aborted)setLoading(false);}};
  void run();return()=>controller.abort();
 },[tab,query,state,page,refresh]);
 function navigate(next:Tab){
  generation.current++;detailRequest.current?.abort();setDetailLoading(false);setList(null);setOverview(null);setLoading(true);setTab(next);setCatalogue(null);setRecord(null);setSearch("");setQuery("");setState("all");setPage(1);setError("");setSuccess("");
 }
 async function open(kind:"catalogue"|"case",id:string,itemPage=1,assetPage=1){
  const current=++generation.current;detailRequest.current?.abort();const controller=new AbortController();detailRequest.current=controller;
  setDetailLoading(true);setCatalogue(null);setRecord(null);setError("");setSuccess("");setReviewed(false);setNote("");
  try{
   if(kind==="catalogue"){const result=await adminApi.catalogue(id,itemPage,assetPage,controller.signal);if(current===generation.current){setCatalogue(result);setSummary("");setReason("other");setCaseId(newCaseId());}}
   else {const result=await adminApi.case(id,controller.signal);if(current===generation.current){setRecord(result);setTargetStatus(result.record.status==="open"?"reviewing":"resolved");}}
  }catch(e){if(!controller.signal.aborted)fail(e);}finally{if(current===generation.current)setDetailLoading(false);}
 }
 async function refreshCurrent(){
  setRefresh(n=>n+1);
  if(!record&&!catalogue)return;
  const current=++generation.current;detailRequest.current?.abort();const controller=new AbortController();detailRequest.current=controller;
  setBusy(true);setDetailLoading(true);setReviewed(false);
  try{if(record){const fresh=await adminApi.case(record.record.id,controller.signal);if(current===generation.current){setRecord(fresh);setTargetStatus(fresh.record.status==="open"?"reviewing":"resolved");}}
   else if(catalogue){const fresh=await adminApi.catalogue(catalogue.catalogue.id,catalogue.itemPage,catalogue.assetPage,controller.signal);if(current===generation.current)setCatalogue(fresh);}
  }catch(e){if(!controller.signal.aborted)fail(e);}finally{if(current===generation.current){setBusy(false);setDetailLoading(false);}}
 }
 async function mutate(action:()=>Promise<AdminCaseDetail|{saved:boolean}>,message:string){
  setBusy(true);setError("");setSuccess("");
  try{const result=await action();if(!mounted.current)return;
   if("record" in result){setRecord(result);setCatalogue(null);setTargetStatus(result.record.status==="open"?"reviewing":"resolved");}
   setNote("");setReviewed(false);setSuccess(message);setRefresh(n=>n+1);
  }catch(e){if(mounted.current)fail(e);}finally{if(mounted.current)setBusy(false);}
 }
 const states=tab==="catalogues"?["all","draft","published","suspended","archived"]:tab==="cases"?["all","open","reviewing","resolved","dismissed"]:tab==="users"?["all","active","suspended"]:["all"];
 const selectedCatalogue=catalogue?.catalogue??record?.catalogue;
 return <div className="min-h-screen bg-[#f5f7f4] text-[#17232a]">
  <header className="border-b border-[#dfe5dc] bg-white"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-8">{brand}<div className="flex flex-wrap items-center gap-3 text-sm"><span className="text-[#718078]">{user}</span><a className={button} href="#workspace/home">Business workspace</a><button className={button} onClick={()=>void onLogout().catch(fail)} disabled={busy}>Sign out</button></div></div></header>
  <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8">
   <p className="text-xs font-black uppercase tracking-[0.15em] text-[#789c45]">Platform administration</p>
   <h1 className="mt-2 text-3xl font-semibold tracking-tight">Catalogue administration</h1>
   <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f7c77]">Review catalogue content, follow reports and manage public access. Every moderation change is recorded in the audit history.</p>
   <nav aria-label="Administration" className="my-6 flex flex-wrap gap-2">{(["overview","catalogues","cases","users","reserved"] as Tab[]).map(t=><button key={t} disabled={busy} aria-current={tab===t?"page":undefined} onClick={()=>navigate(t)} className={tab===t?primary:button}>{({overview:"Overview",catalogues:"Catalogues",cases:"Review queue",users:"Users",reserved:"Reserved slugs"})[t]}</button>)}</nav>
   {error&&<div role="alert" className="mb-5 rounded-xl border border-[#efc7c1] bg-[#fff6f4] p-4 text-sm text-[#8a2f25]">{error}{!locked&&<button onClick={()=>void refreshCurrent()} disabled={busy} className="ml-3 underline">Retry</button>}</div>}
   {success&&<p role="status" className="mb-5 rounded-xl border border-[#d1e4b8] bg-[#f3fae9] p-4 text-sm text-[#456426]">{success}</p>}
   {locked?<section className={panel}><h2 className="text-xl font-semibold">Access restricted</h2><p className="mt-2 text-sm text-[#6f7c77]">This account does not currently have platform administration access.</p><a href="#workspace/home" className={"mt-4 inline-block "+button}>Return to business workspace</a></section>:<>
    {tab!=="overview"&&<form className={"mb-5 "+panel} onSubmit={e=>{e.preventDefault();setQuery(search.trim());setPage(1);setCatalogue(null);setRecord(null);generation.current++;detailRequest.current?.abort();setDetailLoading(false);}}>
     <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm font-semibold">Search<input aria-label="Search administration" maxLength={100} className={input} value={search} onChange={e=>setSearch(e.target.value)} disabled={busy}/></label>
      {states.length>1&&<label className="text-sm font-semibold">Status<select aria-label="Administration status" className={input} value={state} disabled={busy} onChange={e=>{setState(e.target.value);setPage(1);setCatalogue(null);setRecord(null);generation.current++;detailRequest.current?.abort();setDetailLoading(false);}}>{states.map(s=><option key={s} value={s}>{reasonLabel(s)}</option>)}</select></label>}
      <button className={primary} disabled={busy} type="submit">Search</button></div>
    </form>}
    {loading&&<p role="status" className="py-8 text-sm text-[#6f7c77]">Loading administration…</p>}
    {tab==="overview"&&overview&&<><section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(overview.counts).map(([key,value])=><div key={key} className={panel}><p className="text-xs font-bold uppercase tracking-wider text-[#718078]">{({users:"Users",organizations:"Businesses",catalogues:"Catalogues",suspended:"Suspended",subscriptions:"Subscriptions",storageBytes:"Ready storage",openCases:"Open reviews"} as Record<string,string>)[key]}</p><p className="mt-3 text-3xl font-semibold">{key==="storageBytes"?bytes(value):value.toLocaleString()}</p></div>)}</section>
     <section className={"mt-6 "+panel}><h2 className="text-lg font-semibold">Recent audit activity</h2><p className="mt-2 text-sm text-[#718078]">The latest 30 recorded actions. Case histories include review notes and decisions.</p><div className="mt-4 space-y-3">{overview.activity.map((event,i)=><div key={i} className="flex flex-wrap justify-between gap-2 border-t border-[#edf0ec] pt-3 text-sm"><div><span className="font-semibold">{reasonLabel(event.action.replace(/\./g," "))}</span><p className="mt-1 break-all text-xs text-[#718078]">{event.entityId??event.entityType} · {event.actor??"System"}</p></div><time className="text-xs text-[#718078]">{date(event.createdAt)}</time></div>)}{!overview.activity.length&&<p className="text-sm text-[#718078]">No activity yet.</p>}</div></section></>}
    {list&&<section className={panel}>
     <h2 className="mb-4 text-lg font-semibold">{tab==="catalogues"?"Catalogue directory":tab==="cases"?"Moderation cases":tab==="users"?"Registered users":"Reserved addresses"}</h2>
     <div className="space-y-3">{!list.rows.length&&<p className="py-5 text-sm text-[#718078]">No results match these filters.</p>}
      {tab==="catalogues"&&(list.rows as AdminCatalogue[]).map(c=><button disabled={busy} key={c.id} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3e9e1] p-4 text-left hover:bg-[#f8fbf5] disabled:opacity-50" onClick={()=>void open("catalogue",c.id)}><div><p className="font-semibold">{c.name}</p><p className="mt-1 break-all text-sm text-[#718078]">{c.businessName} · {c.slug}.techabanca.com</p><p className="mt-2 text-xs text-[#718078]">{c.items} source items · {bytes(c.storageBytes)} · Subscription: {c.subscriptionStatus??"none"}</p></div><div className="flex items-center gap-2"><Badge value={c.status}/><span className="text-xs">{c.revision?"Revision "+c.revision:"Unpublished"}</span></div></button>)}
      {tab==="cases"&&(list.rows as AdminCase[]).map(c=><button disabled={busy} key={c.id} className="w-full rounded-xl border border-[#e3e9e1] p-4 text-left hover:bg-[#f8fbf5] disabled:opacity-50" onClick={()=>void open("case",c.id)}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{c.catalogueName}</span><Badge value={c.status}/></div><p className="mt-2 break-words text-sm">{c.summary}</p><p className="mt-2 text-xs text-[#718078]">{reasonLabel(c.reason)} · {reasonLabel(c.source)} · {date(c.openedAt)}</p></button>)}
      {tab==="users"&&(list.rows as AdminUser[]).map(u=><article key={u.id} className="flex flex-wrap justify-between gap-3 rounded-xl border border-[#e3e9e1] p-4"><div><h3 className="font-semibold">{u.name}</h3><p className="mt-1 break-all text-sm text-[#718078]">{u.email}</p><p className="mt-2 text-xs text-[#718078]">{u.businesses} active memberships · Joined {date(u.createdAt)}</p></div><div className="flex items-start gap-2"><Badge value={u.status}/>{u.platformAdmin&&<Badge value="platform admin"/>}</div></article>)}
      {tab==="reserved"&&(list.rows as AdminReservedSlug[]).map(r=><article key={r.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3e9e1] p-4"><div><h3 className="font-semibold">{r.slug}</h3><p className="mt-1 break-words text-sm text-[#718078]">{r.reason}</p><p className="mt-2 text-xs text-[#718078]">{r.managed?"Admin reservation":"Core platform address"}</p></div>{r.managed&&<button disabled={busy} className={button} onClick={()=>void mutate(()=>adminApi.release(r.slug),"Reservation released.")}>Release {r.slug}</button>}</article>)}
     </div><Pager page={list.page} total={list.total} busy={busy||loading} onPage={n=>{setPage(n);setCatalogue(null);setRecord(null);generation.current++;detailRequest.current?.abort();setDetailLoading(false);}}/>
    </section>}
    {tab==="reserved"&&<form className={"mt-6 "+panel} onSubmit={e=>{e.preventDefault();void mutate(()=>adminApi.reserve(slug,reservationReason),"Slug reserved.");}}><h2 className="text-lg font-semibold">Reserve an address</h2><p className="mt-2 text-sm text-[#718078]">Only unclaimed slugs can be reserved. Core platform addresses cannot be released here.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Slug<input required minLength={3} maxLength={63} className={input} value={slug} onChange={e=>setSlug(e.target.value)} disabled={busy}/></label><label className="text-sm font-semibold">Reason<input required maxLength={200} className={input} value={reservationReason} onChange={e=>setReservationReason(e.target.value)} disabled={busy}/></label></div><button className={"mt-4 "+primary} disabled={busy}>Reserve slug</button></form>}
    {detailLoading&&<p role="status" className="py-8 text-sm text-[#718078]">Loading review details…</p>}
    {selectedCatalogue&&<section className={"mt-6 "+panel}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#789c45]">Catalogue review</p><h2 className="mt-2 text-2xl font-semibold">{selectedCatalogue.name}</h2><p className="mt-2 break-all text-sm text-[#718078]">{selectedCatalogue.businessName} · {selectedCatalogue.slug}.techabanca.com</p></div><Badge value={selectedCatalogue.blocked?"public access suspended":selectedCatalogue.status}/></div>
     <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><p>Publication: <strong>{selectedCatalogue.revision?"Revision "+selectedCatalogue.revision:"none"}</strong></p><p>Subscription: <strong>{selectedCatalogue.subscriptionStatus??"none"}</strong></p><p>Ready storage: <strong>{bytes(selectedCatalogue.storageBytes)}</strong></p></div>
     {record&&<button className={"mt-4 "+button} disabled={busy} onClick={()=>void open("catalogue",record.catalogue.id)}>Review source content</button>}
     {catalogue&&<><h3 className="mt-7 text-lg font-semibold">Subscription history</h3><p className="mt-1 text-sm text-[#718078]">Latest 10 recorded subscriptions. Access still follows the current term and entitlement checks.</p><div className="mt-3 space-y-2">{catalogue.subscriptions.map(s=><article key={s.id} className="rounded-xl border border-[#e3e9e1] p-4 text-sm"><strong>{s.plan}</strong><span className="ml-3"><Badge value={s.status}/></span><p className="mt-2 text-xs text-[#718078]">{s.trialEndsAt?"Trial ends "+date(s.trialEndsAt):s.periodEndsAt?"Term ends "+date(s.periodEndsAt):"No active term recorded"}</p></article>)}{!catalogue.subscriptions.length&&<p className="text-sm text-[#718078]">No subscription history.</p>}</div><h3 className="mt-7 text-lg font-semibold">Source items</h3><p className="mt-1 text-sm text-[#718078]">Includes draft and hidden items. Source edits may differ from the active publication.</p><div className="mt-4 space-y-3">{catalogue.items.map(item=><article key={item.id} className="rounded-xl border border-[#e3e9e1] p-4"><div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">{item.name}</h4><Badge value={item.status}/></div><p className="mt-1 text-xs capitalize text-[#718078]">{item.type}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#58675f]">{item.description??"No description."}</p></article>)}</div><Pager page={catalogue.itemPage} total={catalogue.itemTotal} busy={busy||detailLoading} onPage={n=>void open("catalogue",catalogue.catalogue.id,n,catalogue.assetPage)}/>
      <h3 className="mt-7 text-lg font-semibold">Business files</h3><p className="mt-1 text-sm text-[#718078]">Only verified PNG, JPEG, WebP and PDF files can be opened for review.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{catalogue.assets.map(asset=><article key={asset.id} className="rounded-xl border border-[#e3e9e1] p-4"><p className="break-words font-semibold">{asset.name}</p><p className="mt-1 text-xs text-[#718078]">{asset.mime??asset.kind} · {bytes(asset.bytes)} · {asset.status}</p>{asset.reviewable&&<a target="_blank" rel="noopener noreferrer" className={"mt-3 inline-block "+button} href={"/api/v1/admin/assets/"+encodeURIComponent(asset.id)}>Open verified file</a>}</article>)}</div><Pager page={catalogue.assetPage} total={catalogue.assetTotal} busy={busy||detailLoading} onPage={n=>void open("catalogue",catalogue.catalogue.id,catalogue.itemPage,n)}/>
      <h3 className="mt-7 text-lg font-semibold">Recent cases</h3><div className="mt-3 flex flex-wrap gap-2">{catalogue.cases.map(c=><button key={c.id} className={button} disabled={busy} onClick={()=>void open("case",c.id)}>{reasonLabel(c.reason)} · {c.status}</button>)}{!catalogue.cases.length&&<p className="text-sm text-[#718078]">No cases yet.</p>}</div>
      <form className="mt-7 border-t border-[#e3e9e1] pt-5" onSubmit={e=>{e.preventDefault();void mutate(()=>adminApi.createCase(caseId,catalogue.catalogue.id,reason,summary),"Review case created.");}}><h3 className="text-lg font-semibold">Open a review case</h3><label className="mt-4 block text-sm font-semibold">Reason<select className={input} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}>{MODERATION_REASONS.map(r=><option key={r} value={r}>{reasonLabel(r)}</option>)}</select></label><label className="mt-4 block text-sm font-semibold">Review summary<textarea required maxLength={1000} rows={3} className={input} value={summary} onChange={e=>setSummary(e.target.value)} disabled={busy}/></label><button className={"mt-4 "+primary} disabled={busy}>Create review case</button></form>
     </>}
    </section>}
    {record&&<section className={"mt-6 "+panel}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#789c45]">Moderation case</p><h2 className="mt-2 text-xl font-semibold capitalize">{reasonLabel(record.record.reason)}</h2><p className="mt-2 text-xs text-[#718078]">{reasonLabel(record.record.source)} · {date(record.record.openedAt)}</p></div><Badge value={record.record.status}/></div><p className="mt-4 whitespace-pre-wrap break-words text-sm">{record.record.summary}</p>
     {record.record.resolutionNote&&<div className="mt-4 rounded-xl bg-[#f4f7ef] p-4 text-sm"><strong>Resolution</strong><p className="mt-2 whitespace-pre-wrap break-words">{record.record.resolutionNote}</p></div>}
     <label className="mt-6 block text-sm font-semibold">Decision or review note<textarea aria-label="Decision or review note" required maxLength={2000} rows={4} className={input} value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/></label>
     <div className="mt-3 flex flex-wrap items-end gap-3"><button className={button} disabled={busy||!note.trim()} onClick={()=>void mutate(()=>adminApi.note(record.record.id,record.record.version,note),"Review note recorded.")}>Add note</button>
      {["open","reviewing"].includes(record.record.status)&&<><label className="text-sm font-semibold">Case status<select className={input} value={targetStatus} disabled={busy} onChange={e=>setTargetStatus(e.target.value)}>{(record.record.status==="open"?["reviewing","resolved","dismissed"]:["resolved","dismissed"]).map(s=><option key={s} value={s}>{s}</option>)}</select></label><button className={button} disabled={busy||!note.trim()} onClick={()=>void mutate(()=>adminApi.status(record.record.id,record.record.version,targetStatus,note),"Case status updated.")}>Update case status</button></>}
     </div>
     <div className="mt-6 rounded-xl border border-[#dfe5dc] bg-[#fbfcf8] p-4"><h3 className="font-semibold">Public access</h3><p className="mt-2 text-sm leading-6 text-[#718078]">{record.catalogue.blocked?"This catalogue is suspended. Restore access from the case that suspended it. Subscription and publishing checks still apply. Closing a case does not restore access.":"Suspension hides the public catalogue and revokes building private previews. It preserves source content, the active publication and subscription."}</p><label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e=>setReviewed(e.target.checked)} className="mt-1 accent-[#789c45]"/>I reviewed this catalogue and the effect of this decision.</label>
      <button className={"mt-4 "+primary} disabled={busy||!reviewed||!note.trim()||(record.catalogue.blocked?record.catalogue.blockingCaseId!==record.record.id:!["open","reviewing"].includes(record.record.status))}
       onClick={()=>void mutate(()=>adminApi.publicAccess(record,!record.catalogue.blocked,note),record.catalogue.blocked?"Public access restored subject to publication and subscription checks.":"Public access suspended.")}>{record.catalogue.blocked?"Restore public access":"Suspend public access"}</button>
     </div>
     <h3 className="mt-7 text-lg font-semibold">Case history</h3><p className="mt-1 text-xs text-[#718078]">Latest 100 immutable events, newest first.</p><div className="mt-4 space-y-3">{record.events.map((event,i)=><article key={i} className="rounded-xl border border-[#e3e9e1] p-4"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{reasonLabel(event.type)}</strong><time className="text-xs text-[#718078]">{date(event.createdAt)}</time></div><p className="mt-1 text-xs text-[#718078]">{event.actor??"Public report"}{event.from?" · "+event.from+" → "+event.to:""}</p>{event.note&&<p className="mt-2 whitespace-pre-wrap break-words text-sm">{event.note}</p>}</article>)}</div>
    </section>}
   </>}
  </main>
 </div>;
}
