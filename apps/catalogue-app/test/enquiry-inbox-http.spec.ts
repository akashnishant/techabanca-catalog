import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/worker";
import { TENANT_HEADER } from "../src/worker/middleware/require-tenant-access";
import { EnquiryService, purgeExpiredEnquiries } from "../src/worker/services/enquiry-service";
import { id, previewConfig, publicationFixture } from "./publication-fixtures";
type Fixture=Awaited<ReturnType<typeof publicationFixture>>;
const ROOT="https://catalogue.test";
async function insert(f:Fixture,index=1,options:{createdAt?:string;expiresAt?:string;name?:string;message?:string}={}){
 const n=f.n*100+index,now=options.createdAt??new Date().toISOString(),enquiry=id("enq",n);
 await env.DB.prepare("INSERT INTO enquiries (id,public_id,organization_id,catalogue_id,source,contact_name,email,message,created_at,updated_at,expires_at) VALUES(?,?,?,?, 'contact',?,'customer@example.test',?,?,?,?)")
 .bind(n,enquiry,f.n,f.n,options.name??"Synthetic Customer",options.message??"Please quote 100% stainless _ fittings",now,now,options.expiresAt??new Date(Date.parse(now)+365*86400000).toISOString()).run();
 await env.DB.prepare("INSERT INTO enquiry_activity(enquiry_id,activity_type,created_at) VALUES(?,'created',?)").bind(n,now).run();
 return enquiry;
}
async function request(f:Fixture,path="",method="GET",body?:unknown,user=f.owner,org=id("org",f.n)){
 return app.request(ROOT+"/api/v1/catalogue/enquiries"+path,{method,headers:{Cookie:await f.session(user),[TENANT_HEADER]:org,Origin:ROOT,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})},{...env,...previewConfig});
}
async function detail(f:Fixture,e:string){return new EnquiryService(env.DB).detail(f.tenant,e);}
const actor=(f:Fixture)=>({role:"owner",userId:f.owner});
describe("authenticated enquiry inbox and retention",()=>{
 it("requires authentication and a tenant, marks personal data no-store",async()=>{
  const f=await publicationFixture(); await insert(f);
  expect((await app.request(ROOT+"/api/v1/catalogue/enquiries",undefined,{...env,...previewConfig})).status).toBe(401);
  const noTenant=await app.request(ROOT+"/api/v1/catalogue/enquiries",{headers:{Cookie:await f.session()}},{...env,...previewConfig}); expect(noTenant.status).toBe(400);
  const res=await request(f); expect(res.status).toBe(200); expect(res.headers.get("Cache-Control")).toBe("no-store"); expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  const body=await res.json() as {data:{enquiries:unknown[]}}; expect(body.data.enquiries).toHaveLength(1); expect(JSON.stringify(body)).not.toContain("internalId");
 });
 it("scopes reads and writes to current active membership",async()=>{
  const f=await publicationFixture(),other=await publicationFixture(),e=await insert(other);
  expect((await request(f,"/"+e)).status).toBe(404);
  expect((await request(f,"/"+e+"/status","POST",{version:1,status:"contacted"})).status).toBe(404);
  expect((await request(f,"/"+e+"/notes","POST",{version:1,note:"foreign"})).status).toBe(404);
  expect((await request(f,"/"+e,"DELETE",{version:1})).status).toBe(404);
  expect((await request(f,"","GET",undefined,f.owner,id("org",other.n))).status).toBe(403);
  await env.DB.prepare("UPDATE organization_members SET status='suspended' WHERE organization_id=? AND user_id=?").bind(f.n,f.owner).run();
  expect((await request(f)).status).toBe(403);
 });
 it("lets editors read while rejecting every mutation before parsing",async()=>{
  const f=await publicationFixture(),e=await insert(f); expect((await request(f,"/"+e,"GET",undefined,f.editor)).status).toBe(200);
  for(const [path,method] of [["/"+e+"/status","POST"],["/"+e+"/notes","POST"],["/"+e,"DELETE"]]) expect((await request(f,path,method,{},f.editor)).status).toBe(403);
  expect((await detail(f,e)).version).toBe(1);
 });
 it("paginates tied timestamps deterministically and rejects cursors with changed filters",async()=>{
  const f=await publicationFixture(),date=new Date().toISOString(); for(let i=1;i<=4;i++)await insert(f,i,{createdAt:date});
  const service=new EnquiryService(env.DB),first=await service.list(f.tenant,new URLSearchParams("limit=2")),second=await service.list(f.tenant,new URLSearchParams({limit:"2",after:first.nextCursor!}));
  expect([...first.enquiries,...second.enquiries].map(e=>e.id)).toEqual([4,3,2,1].map(n=>id("enq",f.n*100+n))); expect(second.nextCursor).toBeNull(); expect(first.counts.new).toBe(4);
  await expect(service.list(f.tenant,new URLSearchParams({q:"other",after:first.nextCursor!}))).rejects.toMatchObject({status:400});
 });
 it("searches literal wildcard characters and returns tenant totals with filtered results",async()=>{
  const f=await publicationFixture(); await insert(f,1); await insert(f,2,{message:"Different quote"});
  const data=await new EnquiryService(env.DB).list(f.tenant,new URLSearchParams("q=100%25")); expect(data.enquiries).toHaveLength(1); expect(data.counts.new).toBe(2);
 });
 it.each(["limit=0","limit=51","limit=2.5","status=wrong","q=a&q=b","unknown=x","after=bad%21"])("rejects bad filter %s",async filter=>{
  const f=await publicationFixture(); expect((await request(f,"?"+filter)).status).toBe(400);
 });
 it("records owner and admin forward transitions with accurate timestamps and optimistic versions",async()=>{
  const f=await publicationFixture(),e=await insert(f);
  const contacted=await request(f,"/"+e+"/status","POST",{version:1,status:"contacted"}); expect(contacted.status).toBe(200);
  let d=await detail(f,e); expect(d.version).toBe(2); expect(d.contactedAt).toBeTruthy(); expect(d.closedAt).toBeNull();
  expect((await request(f,"/"+e+"/status","POST",{version:2,status:"new"})).status).toBe(409);
  expect((await request(f,"/"+e+"/status","POST",{version:2,status:"closed"},f.admin)).status).toBe(200);
  d=await detail(f,e); expect(d.version).toBe(3); expect(d.closedAt).toBeTruthy(); expect(d.activity.filter(a=>a.type==="status_changed").map(a=>a.actor)).toEqual(["admin","owner"]);
  expect((await request(f,"/"+e+"/status","POST",{version:3,status:"contacted"})).status).toBe(409);
  expect((await request(f,"/"+e+"/status","POST",{version:3,status:"closed"})).status).toBe(200); expect((await detail(f,e)).version).toBe(3);
 });
 it("allows direct closure from New and preserves retention across edits",async()=>{
  const f=await publicationFixture(),e=await insert(f),before=await detail(f,e);
  expect((await request(f,"/"+e+"/status","POST",{version:1,status:"closed"})).status).toBe(200);
  const after=await detail(f,e); expect(after.contactedAt).toBeNull(); expect(after.expiresAt).toBe(before.expiresAt);
 });
 it("records trimmed private notes, rejects stale and malformed writes",async()=>{
  const f=await publicationFixture(),e=await insert(f);
  expect((await request(f,"/"+e+"/notes","POST",{version:1,note:"  Follow up tomorrow.  "})).status).toBe(200);
  const d=await detail(f,e); expect(d.activity[0]).toMatchObject({type:"note",note:"Follow up tomorrow.",actor:"owner"}); expect(d.version).toBe(2);
  expect((await request(f,"/"+e+"/notes","POST",{version:1,note:"stale"})).status).toBe(409);
  for(const note of ["","x".repeat(2001),"a\u0000b"])expect((await request(f,"/"+e+"/notes","POST",{version:2,note})).status).toBe(400);
  expect((await request(f,"/"+e+"/notes","POST",{version:2,note:"valid",extra:"bad"})).status).toBe(400);
  expect((await request(f,"/"+e+"/status","POST",{version:2,status:"unknown"})).status).toBe(400);
  expect((await request(f,"/"+e,"DELETE",{version:0})).status).toBe(400);
 });
 it("commits exactly one activity for competing writes to the same version",async()=>{
  const f=await publicationFixture(),e=await insert(f),service=new EnquiryService(env.DB);
  const results=await Promise.allSettled([service.note(f.tenant,actor(f),e,1,"First"),service.note(f.tenant,actor(f),e,1,"Second")]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1); expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
  const d=await detail(f,e); expect(d.version).toBe(2); expect(d.activity.filter(a=>a.type==="note")).toHaveLength(1);
 });
 it("rolls back enquiry updates when activity persistence fails",async()=>{
  const f=await publicationFixture(),e=await insert(f),db=new Proxy(env.DB,{get(target,key){
   if(key==="batch") return (queries:D1PreparedStatement[])=>env.DB.batch([queries[0],env.DB.prepare("INSERT INTO no_such_enquiry_table VALUES(1)")]);
   const value=Reflect.get(target,key); return typeof value==="function"?value.bind(target):value;
  }});
  await expect(new EnquiryService(db).note(f.tenant,actor(f),e,1,"Atomic")).rejects.toThrow(); expect((await detail(f,e)).version).toBe(1);
 });
 it("caps team notes without a partial write and returns the latest 100 events",async()=>{
  const f=await publicationFixture(),e=await insert(f),now=new Date().toISOString();
  await env.DB.batch(Array.from({length:200},(_,i)=>env.DB.prepare("INSERT INTO enquiry_activity(enquiry_id,actor_user_id,activity_type,note,created_at) SELECT id,?,'note',?,? FROM enquiries WHERE public_id=?").bind(f.owner,"Note "+i,now,e)));
  expect((await detail(f,e)).activity).toHaveLength(100);
  expect((await request(f,"/"+e+"/notes","POST",{version:1,note:"Over limit"})).status).toBe(409); expect((await detail(f,e)).version).toBe(1);
 });
 it("deletes personal data and all activity permanently with a current version",async()=>{
  const f=await publicationFixture(),e=await insert(f); expect((await request(f,"/"+e,"DELETE",{version:2})).status).toBe(409);
  expect((await request(f,"/"+e,"DELETE",{version:1})).status).toBe(204); expect((await request(f,"/"+e)).status).toBe(404);
  expect((await env.DB.prepare("SELECT count(*) AS n FROM enquiry_activity WHERE enquiry_id=?").bind(f.n*100+1).first<{n:number}>())!.n).toBe(0);
 });
 it("hides expired and deleted rows immediately, then purges them and rate windows while preserving live rows",async()=>{
  const f=await publicationFixture(),current=new Date(),now=current.toISOString(),past=new Date(current.getTime()-1000).toISOString(),future=new Date(current.getTime()+600000).toISOString();
  const expired=await insert(f,1,{expiresAt:past}),live=await insert(f,2,{expiresAt:future}),deleted=await insert(f,3,{expiresAt:future});
  await env.DB.prepare("UPDATE enquiries SET deleted_at=? WHERE public_id=?").bind(now,deleted).run();
  await env.DB.batch([env.DB.prepare("INSERT INTO enquiry_rate_windows VALUES(?, 'expired', 1, 1, ?)").bind(f.n,past),env.DB.prepare("INSERT INTO enquiry_rate_windows VALUES(?, 'live', 2, 1, ?)").bind(f.n,future)]);
  const list=await new EnquiryService(env.DB).list(f.tenant,new URLSearchParams(),current); expect(list.enquiries.map(e=>e.id)).toEqual([live]);
  expect((await request(f,"/"+expired)).status).toBe(404); expect((await request(f,"/"+deleted)).status).toBe(404);
  await purgeExpiredEnquiries(env.DB,current);
  expect((await env.DB.prepare("SELECT public_id FROM enquiries WHERE catalogue_id=?").bind(f.n).all()).results).toEqual([{public_id:live}]);
  expect((await env.DB.prepare("SELECT client_hash FROM enquiry_rate_windows WHERE catalogue_id=?").bind(f.n).all()).results).toEqual([{client_hash:"live"}]);
  expect((await env.DB.prepare("SELECT count(*) AS n FROM enquiry_activity WHERE enquiry_id=?").bind(f.n*100+1).first<{n:number}>())!.n).toBe(0);
 });
 it("gives legacy inserts a 365-day expiry without inventing consent",async()=>{
  const f=await publicationFixture(),now=new Date().toISOString();
  await env.DB.prepare("INSERT INTO enquiries(public_id,organization_id,catalogue_id,source,contact_name,email,message,created_at,updated_at) VALUES(?,?,?,'contact','Legacy','legacy@example.test','Message',?,?)").bind(id("enq",f.n*100+7),f.n,f.n,now,now).run();
  const d=await detail(f,id("enq",f.n*100+7)); expect(Date.parse(d.expiresAt)-Date.parse(now)).toBe(365*86400000); expect(d.consentAt).toBeNull();
 });
 it("refuses a cross-origin mutation",async()=>{
  const f=await publicationFixture(),e=await insert(f);
  const res=await app.request(ROOT+"/api/v1/catalogue/enquiries/"+e+"/status",{method:"POST",headers:{Cookie:await f.session(),[TENANT_HEADER]:id("org",f.n),Origin:"https://evil.test","Content-Type":"application/json"},body:JSON.stringify({version:1,status:"closed"})},{...env,...previewConfig}); expect(res.status).toBe(403); expect((await detail(f,e)).status).toBe("new");
 });
 it("only runs retention for its configured schedule and environment",async()=>{
  const db={prepare(){throw new Error("should not run");}} as unknown as D1Database;
  await expect(app.scheduled({cron:"* * * * *"} as ScheduledController,{...env,DB:db,DEPLOYMENT_ENVIRONMENT:"local"})).resolves.toBeUndefined();
  await expect(app.scheduled({cron:"0 3 * * *"} as ScheduledController,{...env,DB:db,DEPLOYMENT_ENVIRONMENT:"invalid" as "local"})).resolves.toBeUndefined();
 });
 it("runs the configured scheduled handler and physically deletes expired details",async()=>{
  const f=await publicationFixture(),e=await insert(f,1,{expiresAt:new Date(Date.now()-1000).toISOString()});
  await app.scheduled({cron:"0 3 * * *"} as ScheduledController,{...env,DEPLOYMENT_ENVIRONMENT:"local"});
  expect(await env.DB.prepare("SELECT id FROM enquiries WHERE public_id=?").bind(e).first()).toBeNull();
  expect((await env.DB.prepare("SELECT count(*) AS n FROM enquiry_activity WHERE enquiry_id=?").bind(f.n*100+1).first<{n:number}>())!.n).toBe(0);
 });

});
