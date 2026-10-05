import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { signReportToken, verifyReportToken, signEnquiryToken, signPreview, type ReportClaims } from "@techabanca/domain";
import { readReportForm } from "../src/report-capture";
import { createFixture, publicId } from "./fixtures";
type Fixture=Awaited<ReturnType<typeof createFixture>>;
const secret="b".repeat(64);
function claims(f:Fixture,overrides:Partial<ReportClaims>={}):ReportClaims{
 const now=Math.floor(Date.now()/1000);
 return {v:1,purpose:"report",slug:f.slug,catalogueId:f.catalogueId,publicationId:f.publicationId,nonce:crypto.randomUUID().replace(/-/g,""),
  issuedAt:now-10,expiresAt:now+800,...overrides};
}
async function send(f:Fixture,c=claims(f),values:Record<string,string>={},headers:Record<string,string>={}){
 const formToken=await signReportToken(c,secret);
 return exports.default.fetch(new Request(f.origin+"/report",{method:"POST",headers:{Origin:f.origin,"Content-Type":"application/x-www-form-urlencoded","CF-Connecting-IP":"203.0.113.20",...headers},
  body:new URLSearchParams({reason:"spam",summary:"Synthetic concern",companyWebsite:"",formToken,...values})}));
}
async function count(f:Fixture){return(await env.DB.prepare("SELECT count(*) AS n FROM moderation_cases WHERE catalogue_id=?").bind(f.n).first<{n:number}>())!.n;}
describe("public catalogue reports",()=>{
 it("renders a signed accessible form without analytics or private metadata",async()=>{
  const f=await createFixture(),r=await exports.default.fetch(new Request(f.origin+"/report")),html=await r.text();
  expect(r.status).toBe(200);expect(html).toContain("Report this catalogue");expect(html).toContain('name="reason"');expect(html).toContain('maxlength="1000"');
  expect(html).not.toContain("<script");expect(html).not.toContain("SECRET");expect(html).toContain("Avoid including personal");
  const token=html.match(/name="formToken" value="([^"]+)"/)![1];expect(await verifyReportToken(token,secret)).toMatchObject({purpose:"report",catalogueId:f.catalogueId,publicationId:f.publicationId});
  expect(r.headers.get("Cache-Control")).toBe("no-store");expect(r.headers.get("Content-Security-Policy")).toContain("form-action 'self'");
  expect((await env.DB.prepare("SELECT count(*) AS n FROM catalogue_analytics_daily WHERE catalogue_id=?").bind(f.n).first<{n:number}>())!.n).toBe(0);
 });
 it("accepts the full 1,000-character limit for percent-encoded non-Latin text",async()=>{const f=await createFixture(),summary="漢".repeat(1000);expect((await send(f,claims(f),{summary})).status).toBe(200);expect(await count(f)).toBe(1);});
 it("creates one auditable case and receipt while preserving public access",async()=>{
  const f=await createFixture(),r=await send(f),html=await r.text();
  expect(r.status).toBe(200);expect(html).toContain("Report received");expect(html).not.toContain("mod_");expect(html).not.toContain("Synthetic concern");
  expect(await count(f)).toBe(1);
  const row=await env.DB.prepare("SELECT public_id,source,status,summary FROM moderation_cases WHERE catalogue_id=?").bind(f.n).first<{public_id:string}>();
  expect(row).toMatchObject({source:"public_report",status:"open",summary:"Synthetic concern"});
  expect((await env.DB.prepare("SELECT count(*) AS n FROM moderation_case_events WHERE moderation_case_id=(SELECT id FROM moderation_cases WHERE public_id=?)").bind(row!.public_id).first())).toEqual({n:1});
  expect((await env.DB.prepare("SELECT count(*) AS n FROM audit_events WHERE entity_public_id=?").bind(row!.public_id).first())).toEqual({n:1});
  expect((await exports.default.fetch(new Request(f.origin+"/"))).status).toBe(200);
  const rate=await env.DB.prepare("SELECT client_hash FROM moderation_report_windows WHERE catalogue_id=? AND client_hash<>'*'").bind(f.n).first<{client_hash:string}>();
  expect(rate!.client_hash).toMatch(/^[a-f0-9]{64}$/);expect(rate!.client_hash).not.toContain("203.0");
 });
 it("deduplicates sequential and concurrent retries without spending another rate slot",async()=>{
  const f=await createFixture(),c=claims(f);await Promise.all([send(f,c),send(f,c)]);await send(f,c);
  expect(await count(f)).toBe(1);expect((await env.DB.prepare("SELECT attempts FROM moderation_report_windows WHERE catalogue_id=?").bind(f.n).all<{attempts:number}>()).results.every(w=>w.attempts===1)).toBe(true);
 });
 it.each(["","https://evil.test","https://other.techabanca.com"])("rejects origin %s",async Origin=>{
  const f=await createFixture();expect((await send(f,claims(f),{},{Origin})).status).toBe(403);expect(await count(f)).toBe(0);
 });
 const malformedFields:Record<string,string>[]=[{summary:""},{summary:"x".repeat(1001)},{summary:"bad\u0000"},{reason:"invalid"},{extra:"unrecognized"}];
 it.each(malformedFields)("rejects malformed fields %j",async values=>{
  const f=await createFixture();expect((await send(f,claims(f),values)).status).toBe("extra" in values?400:422);expect(await count(f)).toBe(0);
 });
 it("does not create cases from honeypot submissions or tokens used too quickly",async()=>{
  const f=await createFixture();expect((await send(f,claims(f),{companyWebsite:"https://bot.test"})).status).toBe(200);expect(await count(f)).toBe(0);
  const now=Math.floor(Date.now()/1000),quick=await send(f,claims(f,{issuedAt:now,expiresAt:now+800}));expect(quick.status).toBe(429);expect(quick.headers.get("Retry-After")).toBe("2");expect(await count(f)).toBe(0);
 });
 it("rejects tampering and tokens belonging to another publication or catalogue",async()=>{
  const f=await createFixture(),other=await createFixture(),token=await signReportToken(claims(f),secret);
  for(const formToken of [token.slice(0,-2)+"aa",await signReportToken(claims(other),secret)]){
   expect((await send(f,claims(f),{formToken})).status).toBe(409);
  }
  expect(await count(f)).toBe(0);
 });
 it("rejects enquiry and private-preview tokens",async()=>{
  const f=await createFixture(),c=claims(f),tokens=[await signEnquiryToken({...c,purpose:"form",itemId:null},secret),await signPreview({v:1,slug:f.slug,publicationId:f.publicationId,expiresAt:c.expiresAt},secret)];
  for(const formToken of tokens)expect((await send(f,c,{formToken})).status).toBe(409);
 });
 it("limits one client to five cases per catalogue per hour",async()=>{
  const f=await createFixture();for(let i=0;i<5;i++)expect((await send(f)).status).toBe(200);
  const blocked=await send(f);expect(blocked.status).toBe(429);expect(blocked.headers.get("Retry-After")).toBe("3600");expect(await count(f)).toBe(5);
 });
 it("applies the catalogue-wide limit across different clients",async()=>{
  const f=await createFixture(),bucket=Math.floor(Date.now()/3600000);
  await env.DB.prepare("INSERT INTO moderation_report_windows VALUES (?,'*',?,30,?)").bind(f.n,bucket,new Date(Date.now()+86400000).toISOString()).run();
  expect((await send(f,claims(f),{},{"CF-Connecting-IP":"203.0.113.99"})).status).toBe(429);expect(await count(f)).toBe(0);
 });
 it("fails closed after suspension or subscription expiry, including stale form tokens",async()=>{
  for(const change of ["suspended","expired"]){
   const f=await createFixture(),c=claims(f);
   if(change==="suspended")await env.DB.prepare("UPDATE catalogues SET status='suspended' WHERE id=?").bind(f.n).run();
   else await env.DB.prepare("UPDATE subscriptions SET status='expired' WHERE organization_id=?").bind(f.n).run();
   expect((await send(f,c)).status).toBe(404);expect(await count(f)).toBe(0);
  }
 });
 it("supports HEAD and refuses unsupported methods",async()=>{
  const f=await createFixture(),r=await exports.default.fetch(new Request(f.origin+"/report",{method:"HEAD"}));expect(r.status).toBe(200);expect(await r.text()).toBe("");
  expect((await exports.default.fetch(new Request(f.origin+"/report",{method:"PUT"}))).status).toBe(405);
 });
 it.each(["reason=spam&reason=other","summary=%ZZ","summary=%FF","other=x"])("strictly parses %s",async body=>{
  await expect(readReportForm(new Request("https://report.test",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body}))).rejects.toMatchObject({status:400});
 });
 it("bounds declared and streamed form bodies and media type",async()=>{
  for(const headers of [{"Content-Type":"text/plain"},{"Content-Type":"application/x-www-form-urlencoded","Content-Length":"12289"}]){
   await expect(readReportForm(new Request("https://report.test",{method:"POST",headers:headers as Record<string,string>,body:"summary=x"}))).rejects.toMatchObject({status:"Content-Length" in headers?413:415});
  }
  await expect(readReportForm(new Request("https://report.test",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"summary="+"x".repeat(12288)}))).rejects.toMatchObject({status:413});
 });
});
