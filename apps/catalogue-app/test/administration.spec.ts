import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/worker";
import publicApp from "../../catalogue-public/src";
import { AdminService, purgeModerationWindows } from "../src/worker/services/admin-service";
import { PublicationService } from "../src/worker/services/publication-service";
import { SubscriptionService } from "../src/worker/services/subscription-service";
import { SharingService } from "../src/worker/services/sharing-service";
import { publicationFixture, id, previewConfig } from "./publication-fixtures";
const root="https://catalogue.test/api/v1/admin",config={...env,...previewConfig,LOCAL_PREVIEW:"true",DEPLOYMENT_ENVIRONMENT:"local"};
async function setup(publish=false,trial=false){
 const f=await publicationFixture(),cookie=await f.session();
 await env.DB.prepare("INSERT INTO platform_admins(user_id,status,created_at,updated_at) VALUES (?,'active',?,?)").bind(f.owner,new Date().toISOString(),new Date().toISOString()).run();
 const session=(await env.DB.prepare("SELECT id FROM sessions WHERE user_id=? ORDER BY id DESC LIMIT 1").bind(f.owner).first<{id:number}>())!.id;
 const actor={userId:f.owner,sessionId:session},service=new AdminService(env.DB,actor),publisher=new PublicationService(env.DB,env.ASSETS,config);
 const sourceRevision=async()=>(await env.DB.prepare("SELECT authoring_revision AS n FROM catalogues WHERE id=?").bind(f.n).first<{n:number}>())!.n;
 if(trial)await new SubscriptionService(config).startTrial(f.tenant,{userId:f.owner,role:"owner"});
 let publication:string|null=null;
 if(publish){const p=await publisher.prepare(f.tenant,{userId:f.owner,role:"owner"},await sourceRevision(),root);await publisher.activate(f.tenant,{userId:f.owner,role:"owner"},p.publication.id,p.sourceRevision,root);publication=p.publication.id;}
 const caseInput={id:id("mod",f.n),catalogueId:id("cat",f.n),reason:"spam",summary:"Review this catalogue"};
 const record=await service.createCase(caseInput);
 const request=(path:string,body?:unknown,headers:Record<string,string>={})=>app.request(root+path,{headers:{Cookie:cookie,...(body===undefined?{}:{Origin:"https://catalogue.test","Content-Type":"application/json"}),...headers},
  ...(body===undefined?{}:{method:"POST",body:JSON.stringify(body)})},config);
 const access=(value=record,blocked=true)=>service.publicAccess(value.record.id,{moderationVersion:value.catalogue.moderationVersion,catalogueVersion:value.catalogue.version,note:"Reviewed access decision"},blocked);
 return {...f,cookie,actor,service,publisher,sourceRevision,publication,record,caseInput,request,access};
}
describe("platform administration boundary",()=>{
 it.each(["owner","admin","editor"] as const)("does not inherit business %s permissions",async role=>{
  const f=await publicationFixture(),cookie=await f.session(f[role]),headers={Cookie:cookie,"X-Techabanca-Organization":id("org",f.n)};
  expect((await app.request(root+"/access",{headers},config)).status).toBe(200);
  expect(await (await app.request(root+"/access",{headers},config)).json()).toEqual({data:{enabled:false}});
  for(const p of ["/overview","/catalogues","/users","/cases","/reserved-slugs"])expect((await app.request(root+p,{headers},config)).status).toBe(403);
 });
 it("requires authentication and never offers a grant mutation",async()=>{
  expect((await app.request(root+"/overview",{},config)).status).toBe(401);
  const f=await setup();expect((await f.request("/grants",{userId:f.owner})).status).toBe(404);
 });
 it("reads across tenants only with a separate active platform grant",async()=>{
  const f=await setup(),other=await publicationFixture(),response=await f.request("/catalogues?q="+other.slug);
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({data:{rows:[{id:id("cat",other.n)}]}});
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const detail=await f.service.catalogue(id("cat",other.n));expect(detail.items.some(i=>i.name==="Draft SECRET")).toBe(true);
  const text=JSON.stringify(detail);for(const secret of ["object_key","password_hash","session","publisher/"])expect(text).not.toContain(secret);
 });
 it.each(["grant","session","user"] as const)("rejects a revoked %s before returning admin data",async kind=>{
  const f=await setup();
  if(kind==="grant")await env.DB.prepare("UPDATE platform_admins SET status='suspended' WHERE user_id=?").bind(f.owner).run();
  if(kind==="session")await env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE id=?").bind(new Date().toISOString(),f.actor.sessionId).run();
  if(kind==="user")await env.DB.prepare("UPDATE users SET status='suspended' WHERE id=?").bind(f.owner).run();
  await expect(f.service.overview()).rejects.toMatchObject({status:403});
  expect((await f.request("/overview")).status).toBe(kind==="grant"?403:401);
 });
 it("requires exact-origin mutations and strict bounded JSON",async()=>{
  const f=await setup();
  for(const Origin of ["","https://evil.test","https://else.catalogue.test"])expect((await f.request("/cases",f.caseInput,{Origin})).status).toBe(403);
  for(const body of [{...f.caseInput,grant:true},[],{...f.caseInput,summary:"x".repeat(17000)}])expect((await f.request("/cases",body)).status).toBe(400);
  const response=await app.request(root+"/cases",{method:"POST",headers:{Cookie:f.cookie,Origin:"https://catalogue.test","Content-Type":"text/plain"},body:"PRIVATE"},config);
  expect(response.status).toBe(400);
 });
 it("paginates and searches literally without exposing credentials",async()=>{
  const f=await setup();
  expect((await f.service.catalogues(new URLSearchParams("q="+f.slug))).rows).toHaveLength(1);
  expect((await f.service.catalogues(new URLSearchParams("q=%25"))).rows).toHaveLength(0);
  expect((await f.service.users(new URLSearchParams("q=owner"+f.n))).rows[0]).toMatchObject({platformAdmin:true});
  for(const q of ["q=x&q=y","page=0","page=01","page=10000","role=admin","state=bad"])await expect(f.service.catalogues(new URLSearchParams(q))).rejects.toMatchObject({status:400});
 });
 it("fails closed with a safe response on a database error",async()=>{
  const f=await setup(),db=new Proxy(env.DB,{get(target,key){if(key==="prepare")return(sql:string)=>{if(sql.includes("platform_admins"))throw new Error("PRIVATE DATABASE DETAILS");return target.prepare(sql);};const v=Reflect.get(target,key);return typeof v==="function"?v.bind(target):v;}});
  const response=await app.request(root+"/overview",{headers:{Cookie:f.cookie}},{...config,DB:db});
  expect(response.status).toBe(503);expect(await response.text()).not.toContain("PRIVATE");
 });
});
describe("moderation decisions and atomic history",()=>{
 it("deduplicates a repeated case ID and refuses a different request",async()=>{
  const f=await setup();await f.service.createCase(f.caseInput);
  expect((await f.service.cases(new URLSearchParams("q="+f.slug))).total).toBe(1);
  await expect(f.service.createCase({...f.caseInput,summary:"different"})).rejects.toMatchObject({status:409});
  expect(f.record.events).toHaveLength(1);
 });
 it("records notes and terminal decisions with versions; later notes preserve the resolution",async()=>{
  const f=await setup(),a=await f.service.updateCase(f.record.record.id,{version:1,note:"First review"},"note"),
   b=await f.service.updateCase(a.record.id,{version:a.record.version,status:"resolved",note:"Final decision"},"status"),
   c=await f.service.updateCase(b.record.id,{version:b.record.version,note:"Follow-up context"},"note");
  expect(c.record).toMatchObject({status:"resolved",resolutionNote:"Final decision",version:4});
  expect(c.events.map(e=>e.type)).toEqual(["note","status_changed","note","created"]);
  await expect(f.service.updateCase(c.record.id,{version:4,status:"open",note:"reopen"},"status")).rejects.toMatchObject({status:400});
  await expect(f.service.updateCase(c.record.id,{version:1,note:"stale"},"note")).rejects.toMatchObject({status:409});
 });
 it("allows only one concurrent update for the same version",async()=>{
  const f=await setup(),rs=await Promise.allSettled([1,2].map(i=>f.service.updateCase(f.record.record.id,{version:1,note:"Concurrent "+i},"note")));
  expect(rs.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect((await f.service.case(f.record.record.id)).events).toHaveLength(2);
 });
 it("suspends public pages, media, sharing and previews without changing the active snapshot",async()=>{
  const f=await setup(true,true),candidate=await f.publisher.prepare(f.tenant,{userId:f.owner,role:"owner"},await f.sourceRevision(),root);
  const before=(await env.DB.prepare("SELECT publication_id FROM public_catalogue_routes WHERE catalogue_public_id=?").bind(id("cat",f.n)).first())!;
  const original=await f.service.case(f.record.record.id),blocked=await f.access(original);
  expect(blocked.catalogue).toMatchObject({blocked:true,status:"suspended",routeStatus:"suspended",publicationId:f.publication});
  expect((await env.DB.prepare("SELECT publication_id FROM public_catalogue_routes WHERE catalogue_public_id=?").bind(id("cat",f.n)).first())).toEqual(before);
  expect((await env.DB.prepare("SELECT state,preview_revoked_at FROM catalogue_publications WHERE public_id=?").bind(candidate.publication.id).first())).toMatchObject({state:"failed",preview_revoked_at:expect.any(String)});
  for(const suffix of ["/","/catalogue","/report","/media/"+f.publication+"/"+f.imageId]){
   const response=await publicApp.request("https://"+f.slug+".techabanca.com"+suffix,{},config);expect(response.status).toBe(404);expect(await response.text()).not.toContain("Review this catalogue");
  }
  expect((await publicApp.request(candidate.previewUrl,{},config)).status).toBe(404);
  expect((await new SharingService(env.DB,"local","true").view(f.tenant,new URLSearchParams())).publication).toBeNull();
  await expect(f.publisher.prepare(f.tenant,{userId:f.owner,role:"owner"},await f.sourceRevision(),root)).rejects.toMatchObject({status:409});
  const restored=await f.access(blocked,false);
  expect(restored.catalogue).toMatchObject({blocked:false,routeStatus:"active",publicationId:f.publication});
  expect((await publicApp.request("https://"+f.slug+".techabanca.com/",{},config)).status).toBe(200);
  expect((await publicApp.request(candidate.previewUrl,{},config)).status).toBe(404);
 });
 it("does not activate a publication when an unpublished catalogue is restored",async()=>{
  const f=await setup(),blocked=await f.access(),restored=await f.access(blocked,false);
  expect(restored.catalogue).toMatchObject({status:"draft",blocked:false,publicationId:null,routeStatus:null});
 });
 it("does not override an expired subscription during restoration",async()=>{
  const f=await setup(true,true),blocked=await f.access(await f.service.case(f.record.record.id));
  await env.DB.prepare("UPDATE subscriptions SET status='expired' WHERE organization_id=?").bind(f.n).run();
  await f.access(blocked,false);
  expect((await publicApp.request("https://"+f.slug+".techabanca.com/",{},config)).status).toBe(404);
 });
 it("closing a blocking case does not automatically restore public access",async()=>{
  const f=await setup(),blocked=await f.access(),closed=await f.service.updateCase(f.record.record.id,{version:1,status:"resolved",note:"Decision remains blocked"},"status");
  expect(closed.catalogue.blocked).toBe(true);
  const restored=await f.access(closed,false);expect(restored.catalogue.blocked).toBe(false);
  await expect(f.access(restored,true)).rejects.toMatchObject({status:409});
 });
 it("rejects stale source/moderation versions and restoration from another case",async()=>{
  const f=await setup(),blocked=await f.access();
  await expect(f.access()).rejects.toMatchObject({status:409});
  const other=await f.service.createCase({...f.caseInput,id:id("mod",f.n+100000)});
  await expect(f.access(other,false)).rejects.toMatchObject({status:409});
  await env.DB.prepare("UPDATE catalogues SET version=version+1 WHERE id=?").bind(f.n).run();
  await expect(f.access(blocked,false)).rejects.toMatchObject({status:409});
 });
 it.each(["grant","case"] as const)("rechecks %s at the atomic suspension boundary",async kind=>{
  const f=await setup();let batches=0;
  const db=new Proxy(env.DB,{get(target,key){if(key==="batch")return async(statements:D1PreparedStatement[])=>{
   if(++batches===2){if(kind==="grant")await target.prepare("UPDATE platform_admins SET status='suspended' WHERE user_id=?").bind(f.owner).run();
    else await target.prepare("UPDATE moderation_cases SET status='resolved',resolution_note='Concurrent close',resolved_at=?,version=version+1 WHERE public_id=?").bind(new Date().toISOString(),f.record.record.id).run();}
   return target.batch(statements);
  };const v=Reflect.get(target,key);return typeof v==="function"?v.bind(target):v;}});
  const service=new AdminService(db,f.actor);
  await expect(service.publicAccess(f.record.record.id,{moderationVersion:0,catalogueVersion:f.record.catalogue.version,note:"race"},true)).rejects.toMatchObject({status:kind==="grant"?403:409});
  expect((await env.DB.prepare("SELECT blocked FROM catalogue_moderation_state WHERE catalogue_id=?").bind(f.n).first())).toEqual({blocked:0});
 });
 it("rolls back the decision and event when audit insertion fails",async()=>{
  const f=await setup();
  await env.DB.exec("CREATE TRIGGER qa_reject_admin_audit BEFORE INSERT ON audit_events WHEN NEW.action='moderation.public_suspended' BEGIN SELECT RAISE(ABORT,'qa audit failure'); END");
  try{await expect(f.access()).rejects.toThrow();}finally{await env.DB.exec("DROP TRIGGER qa_reject_admin_audit");}
  expect((await f.service.case(f.record.record.id)).catalogue.blocked).toBe(false);
  expect((await f.service.case(f.record.record.id)).events).toHaveLength(1);
 });
 it("retains immutable decision history",async()=>{
  const f=await setup();await f.access();
  await expect(env.DB.prepare("UPDATE moderation_case_events SET note='changed' WHERE moderation_case_id=(SELECT id FROM moderation_cases WHERE public_id=?)").bind(f.record.record.id).run()).rejects.toThrow();
  await expect(env.DB.prepare("DELETE FROM audit_events WHERE entity_public_id=?").bind(id("cat",f.n)).run()).rejects.toThrow();
 });
 it("limits platform mutation bursts before another event is written",async()=>{
  const f=await setup(),bucket=Math.floor(Date.now()/60000);
  await env.DB.prepare("INSERT INTO platform_actor_windows(user_id,bucket,attempts,expires_at) VALUES (?,?,60,?) ON CONFLICT(user_id,bucket) DO UPDATE SET attempts=60").bind(f.owner,bucket,new Date(Date.now()+120000).toISOString()).run();
  await expect(f.service.updateCase(f.record.record.id,{version:1,note:"limited"},"note")).rejects.toMatchObject({status:429});
  expect((await f.service.case(f.record.record.id)).events).toHaveLength(1);
 });
});
describe("reserved addresses, files and cleanup",()=>{
 it("audits reserve/release and protects claimed and core addresses",async()=>{
  const f=await setup(),slug="review-reserved-"+f.n;
  await f.service.reserve({slug,reason:"Administration test"});expect((await f.service.reserved(new URLSearchParams("q="+slug))).rows).toEqual([{slug,reason:"Administration test",managed:true}]);
  await expect(f.service.reserve({slug:f.slug,reason:"claimed"})).rejects.toMatchObject({status:409});
  await expect(f.service.release("support")).rejects.toThrow();
  await f.service.release(slug);expect((await f.service.reserved(new URLSearchParams("q="+slug))).total).toBe(0);
  expect((await env.DB.prepare("SELECT count(*) AS n FROM audit_events WHERE entity_public_id=?").bind(slug).first())).toEqual({n:2});
 });
 it("serves verified files privately and rejects unverified or missing objects",async()=>{
  const f=await setup(),image=await f.request("/assets/"+f.imageId);
  expect(image.status).toBe(200);expect(image.headers.get("Content-Type")).toBe("image/png");expect(image.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await f.request("/assets/"+id("ast",f.n*10+2))).headers.get("Content-Disposition")).toContain("attachment");
  await env.DB.prepare("UPDATE assets SET verified_at=NULL WHERE public_id=?").bind(f.imageId).run();
  expect((await f.request("/assets/"+f.imageId)).status).toBe(404);
 });
 it("rejects a changed object after verification",async()=>{const f=await setup();await env.ASSETS.put(f.imageKey,new Uint8Array([1,2,3]),{httpMetadata:{contentType:"image/png"}});expect((await f.request("/assets/"+f.imageId)).status).toBe(409);});
 it("cleans only expired temporary rate windows",async()=>{
  const f=await setup(),now=new Date(),old=new Date(now.getTime()-86400000).toISOString(),future=new Date(now.getTime()+86400000).toISOString();
  await env.DB.batch([
   env.DB.prepare("INSERT INTO moderation_report_windows VALUES (?, 'a' || substr(?,2),1,1,?)").bind(f.n,"a".repeat(64),old),
   env.DB.prepare("INSERT INTO moderation_report_windows VALUES (?,'*',2,1,?)").bind(f.n,future),
  ]);
  await purgeModerationWindows(env.DB,now);
  expect((await env.DB.prepare("SELECT count(*) AS n FROM moderation_report_windows WHERE catalogue_id=?").bind(f.n).first())).toEqual({n:1});
  expect((await f.service.case(f.record.record.id)).events).toHaveLength(1);
 });
});
