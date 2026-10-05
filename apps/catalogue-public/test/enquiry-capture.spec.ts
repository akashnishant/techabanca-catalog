import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { signEnquiryToken, verifyEnquiryToken, type EnquiryClaims } from "@techabanca/domain";
import app from "../src";
import { readEnquiryForm, captureEnquiry } from "../src/enquiry-capture";
import { PublicRepository } from "../src/repository";
import { createFixture, publicId } from "./fixtures";
type Fixture = Awaited<ReturnType<typeof createFixture>>;
const secret = "b".repeat(64), input = { contactName: "Synthetic Customer", companyName: "Demo Business", email: "customer@example.test", phone: "", message: "Please quote for ten units.", consent: true };
function claims(f: Fixture, overrides: Partial<EnquiryClaims> = {}): EnquiryClaims {
 const now = Math.floor(Date.now()/1000);
 return { v: 1, purpose: "form", slug: f.slug, catalogueId: f.catalogueId, publicationId: f.publicationId, itemId: null,
  nonce: crypto.randomUUID().replace(/-/g,""), issuedAt: now - 10, expiresAt: now + 1700, ...overrides };
}
async function send(f: Fixture, c = claims(f), values: Record<string,string> = {}, headers: Record<string,string> = {}) {
 const formToken = await signEnquiryToken(c, secret);
 const body = new URLSearchParams({ ...input, consent: "yes", formToken, ...values });
 return exports.default.fetch(new Request(f.origin + "/contact", { method: "POST", redirect: "manual", headers: { Origin: f.origin, "Content-Type": "application/x-www-form-urlencoded", "CF-Connecting-IP": "203.0.113.10", ...headers }, body }));
}
async function count(f: Fixture) { return (await env.DB.prepare("SELECT count(*) AS n FROM enquiries WHERE catalogue_id = ?").bind(f.n).first<{n:number}>())!.n; }
describe("public enquiry capture", () => {
 it("renders an accessible server-only form with signed published item context", async () => {
  const f=await createFixture(), res=await exports.default.fetch(new Request(f.origin+"/contact?item=precision-pump")), html=await res.text();
  expect(res.status).toBe(200); expect(html).toContain('method="post"'); expect(html).toContain('name="consent"'); expect(html).toContain("365 days");
  expect(html).not.toContain("<script"); expect(html).not.toContain("SECRET"); expect(res.headers.get("Cache-Control")).toBe("no-store");
  const token=html.match(/name="formToken" value="([^"]+)"/)![1], c=await verifyEnquiryToken(token,secret);
  expect(c?.itemId).toBe(f.productId); expect(c?.publicationId).toBe(f.publicationId);
 });
 it("captures a trimmed enquiry, consent, snapshot and one activity then confirms through a private cookie", async () => {
  const f=await createFixture(), res=await send(f,claims(f,{itemId:f.productId}),{contactName:"  Synthetic Customer  "});
  expect(res.status).toBe(303); expect(res.headers.get("Location")).toBe("/contact?sent=1#enquiry");
  expect(res.headers.get("Location")).not.toContain(input.email);
  const cookie=res.headers.get("Set-Cookie")!; for(const word of ["HttpOnly","SameSite=Lax","Secure","Max-Age=300"]) expect(cookie).toContain(word);
  const row=await env.DB.prepare("SELECT * FROM enquiries WHERE catalogue_id=?").bind(f.n).first<Record<string,unknown>>();
  expect(row).toMatchObject({contact_name:input.contactName,email:input.email,source:"contact",item_id:null,published_item_public_id:f.productId,published_item_name:"Precision Pump",publication_public_id:f.publicationId,consent_version:"enquiry-v1",version:1});
  expect(Date.parse(row!.expires_at as string)-Date.parse(row!.created_at as string)).toBe(365*86400000);
  const events=await env.DB.prepare("SELECT activity_type FROM enquiry_activity WHERE enquiry_id=?").bind(row!.id).all();
  expect(events.results).toEqual([{activity_type:"created"}]);
  const confirmation=await exports.default.fetch(new Request(f.origin+"/contact?sent=1",{headers:{Cookie:cookie.split(";")[0]}}));
  expect(await confirmation.text()).toContain("Enquiry sent");
  expect(await (await exports.default.fetch(new Request(f.origin+"/contact?sent=1"))).text()).not.toContain("Enquiry sent");
 });
 it("deduplicates concurrent retries without consuming more quota or activity", async () => {
  const f=await createFixture(), c=claims(f);
  const results=await Promise.all([send(f,c),send(f,c)]); expect(results.map(r=>r.status)).toEqual([303,303]); expect(await count(f)).toBe(1);
  const rates=await env.DB.prepare("SELECT attempts FROM enquiry_rate_windows WHERE catalogue_id=?").bind(f.n).all<{attempts:number}>();
  expect(rates.results.map(r=>r.attempts)).toEqual([1,1]);
  expect((await env.DB.prepare("SELECT count(*) AS n FROM enquiry_activity WHERE enquiry_id IN (SELECT id FROM enquiries WHERE catalogue_id=?)").bind(f.n).first<{n:number}>())!.n).toBe(1);
 });
 it("stores the published service context even when no live authoring item exists", async () => {
  const f=await createFixture(); expect((await send(f,claims(f,{itemId:publicId("itm",f.n*10+2)}))).status).toBe(303);
  expect((await env.DB.prepare("SELECT published_item_name FROM enquiries WHERE catalogue_id=?").bind(f.n).first<{published_item_name:string}>())!.published_item_name).toBe("Maintenance Visit");
 });
 it("continues to use the immutable published item after its source is deleted", async () => {
  const f=await createFixture(); await env.DB.prepare("UPDATE catalogue_items SET deleted_at=? WHERE id=?").bind(new Date().toISOString(),f.n*10+1).run();
  expect((await send(f,claims(f,{itemId:f.productId}))).status).toBe(303);
 });
 it.each(["https://evil.test","https://sibling.techabanca.com","null",""])("rejects foreign or missing origin %s",async origin=>{
  const f=await createFixture(); expect((await send(f,claims(f),{}, {Origin:origin})).status).toBe(403); expect(await count(f)).toBe(0);
 });
 it("rejects cross-site fetch metadata, a receipt as a form, another tenant and a stale revision",async()=>{
  const f=await createFixture(),other=await createFixture();
  expect((await send(f,claims(f),{},{"Sec-Fetch-Site":"cross-site"})).status).toBe(403);
  expect((await send(f,claims(f,{purpose:"receipt",expiresAt:Math.floor(Date.now()/1000)+200}))).status).toBe(409);
  expect((await send(f,claims(other))).status).toBe(409);
  expect((await send(f,claims(f,{publicationId:publicId("pub",f.n+99999)}))).status).toBe(409); expect(await count(f)).toBe(0);
 });
 it("requires a minimum form age and rejects tampered input without writing",async()=>{
  const f=await createFixture(), c=claims(f,{issuedAt:Math.floor(Date.now()/1000),itemId:f.productId});
  const res=await send(f,c); expect(res.status).toBe(429); expect(res.headers.get("Retry-After")).toBe("2");
  const html=await res.text(); expect(html).toContain(input.contactName); expect(html).toContain(input.message); expect(html).toContain("Precision Pump");
  const replacement=html.match(/name="formToken" value="([^"]+)"/)![1]; expect((await verifyEnquiryToken(replacement,secret))?.itemId).toBe(f.productId);
  expect((await send(f,claims(f),{formToken:"tampered"})).status).toBe(409); expect(await count(f)).toBe(0);
 });
 it("returns field errors and escaped values without retaining invalid submissions",async()=>{
  const f=await createFixture(),res=await send(f,claims(f),{contactName:'<script>alert("x")</script>',email:"",phone:"",message:"",consent:""});
  const html=await res.text(); expect(res.status).toBe(422); expect(html).toContain('aria-invalid="true"'); expect(html).toContain("Check your enquiry");
  expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain('<script>alert'); expect(await count(f)).toBe(0);
 });
 it("accepts honeypots silently without storing personal data or rate rows",async()=>{
  const f=await createFixture(); expect((await send(f,claims(f),{companyWebsite:"https://bot.test"})).status).toBe(303); expect(await count(f)).toBe(0);
  expect((await env.DB.prepare("SELECT count(*) AS n FROM enquiry_rate_windows WHERE catalogue_id=?").bind(f.n).first<{n:number}>())!.n).toBe(0);
 });
 it("caps each address at five submissions per ten-minute window and hides raw addresses",async()=>{
  const f=await createFixture();
  for(let i=0;i<5;i++) expect((await send(f)).status).toBe(303);
  const blocked=await send(f); expect(blocked.status).toBe(429); expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0); expect(await count(f)).toBe(5);
  const hashes=await env.DB.prepare("SELECT client_hash FROM enquiry_rate_windows WHERE catalogue_id=?").bind(f.n).all<{client_hash:string}>();
  expect(hashes.results.every(r=>r.client_hash==="*"||/^[a-f0-9]{64}$/.test(r.client_hash))).toBe(true);
 });
 it("enforces the aggregate catalogue quota",async()=>{
  const f=await createFixture(),window=Math.floor(Date.now()/600000);
  await env.DB.prepare("INSERT INTO enquiry_rate_windows VALUES(?, '*', ?, 100, ?)").bind(f.n,window,new Date((window+1)*600000).toISOString()).run();
  expect((await send(f)).status).toBe(429); expect(await count(f)).toBe(0);
 });
 it("refuses hidden contacts, offline routes and private preview writes",async()=>{
  const hidden=await createFixture({show_contact:0}); expect((await send(hidden)).status).toBe(404); expect(await count(hidden)).toBe(0);
  const f=await createFixture(); await env.DB.prepare("UPDATE public_catalogue_routes SET status='suspended' WHERE slug=?").bind(f.slug).run();
  expect((await send(f)).status).toBe(404);
  const privatePost=await exports.default.fetch(new Request(f.origin+"/preview/fake/contact",{method:"POST",body:"x"})); expect(privatePost.status).toBe(405);
 });
 it("rechecks the live route within the atomic write when it changes after target lookup",async()=>{
  const f=await createFixture(),site=(await new PublicRepository(env.DB).site(f.slug))!,db=new Proxy(env.DB,{get(target,key){
   if(key==="batch") return async (queries:D1PreparedStatement[])=>{ await env.DB.prepare("UPDATE public_catalogue_routes SET status='suspended' WHERE slug=?").bind(f.slug).run(); return env.DB.batch(queries); };
   const value=Reflect.get(target,key); return typeof value==="function"?value.bind(target):value;
  }});
  await expect(captureEnquiry({...env,DB:db},site,claims(f),input,null,"203.0.113.20")).rejects.toMatchObject({status:409}); expect(await count(f)).toBe(0);
 });
 it.each(["message=a&message=b","__proto__=x","message=%ZZ","contactName=%C3%28","unknown=x"])("rejects malformed form %s",async body=>{
  await expect(readEnquiryForm(new Request("https://example.test",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body}))).rejects.toMatchObject({status:400});
 });
 it("bounds body size and rejects other content types",async()=>{
  await expect(readEnquiryForm(new Request("https://example.test",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"message="+"x".repeat(65536)}))).rejects.toMatchObject({status:413});
  await expect(readEnquiryForm(new Request("https://example.test",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}))).rejects.toMatchObject({status:415});
 });
 it("returns safe failures without exposing customer details",async()=>{
  const f=await createFixture(), bindings={...env,DB:{prepare(){throw new Error("customer@example.test private failure");}} as unknown as D1Database};
  const res=await app.request(f.origin+"/contact",undefined,bindings); expect(res.status).toBe(503); expect(await res.text()).not.toContain("customer@example.test");
 });
 it("preserves entered fields and trusted item context when a form expires",async()=>{
  const f=await createFixture(),now=Math.floor(Date.now()/1000),c=claims(f,{itemId:f.productId,issuedAt:now-1801,expiresAt:now-1});
  const oldToken=await signEnquiryToken(c,secret,now-1801);
  const res=await exports.default.fetch(new Request(f.origin+"/contact?item=precision-pump",{method:"POST",headers:{Origin:f.origin,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({contactName:input.contactName,email:input.email,message:input.message,consent:"yes",formToken:oldToken})}));
  expect(res.status).toBe(409); const html=await res.text(); expect(html).toContain(input.contactName); expect(html).toContain(input.message); expect(html).toContain("Precision Pump");
  const token=html.match(/name="formToken" value="([^"]+)"/)![1]; expect((await verifyEnquiryToken(token,secret))?.itemId).toBe(f.productId); expect(await count(f)).toBe(0);
 });

});
