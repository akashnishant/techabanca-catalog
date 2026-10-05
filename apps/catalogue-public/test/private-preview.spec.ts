import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { signPreview } from "@techabanca/domain";
import app from "../src";
import { createFixture, publicId } from "./fixtures";
const secret = "b".repeat(64);
async function previewFixture(extraItems = 0) {
 const f = await createFixture({}, extraItems), publicationId=publicId("pub",f.n+2000000), numericId=f.n+2000000;
 const timestamp=new Date().toISOString(), expiresAt=Math.floor(Date.now()/1000)+600;
 await env.DB.prepare("INSERT INTO catalogue_publications (id,public_id,catalogue_id,catalogue_public_id,revision_number,state,source_catalogue_version,created_at,preview_expires_at) VALUES (?,?,?,?,2,'building',1,?,?)")
  .bind(numericId,publicationId,f.n,f.catalogueId,timestamp,new Date(expiresAt*1000).toISOString()).run();
 for(const table of ["published_catalogues","published_categories","published_items","published_item_attributes","published_item_images","published_item_documents"]) {
  const schema=(await env.DB.prepare("PRAGMA table_info("+table+")").all<{name:string}>()).results;
  const columns=schema.map(row=>row.name).filter(name=>name!=="publication_id");
  await env.DB.prepare("INSERT INTO "+table+" (publication_id,"+columns.join(",")+") SELECT ?,"+columns.join(",")+" FROM "+table+" WHERE publication_id=?").bind(numericId,f.n).run();
 }
 await env.DB.prepare("UPDATE catalogue_publications SET sealed_at=? WHERE id=?").bind(timestamp,numericId).run();
 const token=await signPreview({v:1,publicationId,slug:f.slug,expiresAt},secret);
 return {...f,previewPublicationId:publicationId,numericId,token,prefix:"/preview/"+token,expiresAt};
}
type Fixture=Awaited<ReturnType<typeof previewFixture>>;
async function get(f:Fixture,path="/", options:RequestInit={},bindings:Record<string,string>={}) {
 return app.fetch(new Request(f.origin+f.prefix+path,options),{...env,PUBLICATION_PREVIEW_SECRET:secret,...bindings});
}
describe("signed private publication previews",()=>{
 it("excludes reporting and rejects report submission from private previews",async()=>{const f=await previewFixture();expect(await(await get(f)).text()).not.toContain("Report this catalogue");expect((await get(f,"/report")).status).toBe(404);expect((await get(f,"/report",{method:"POST",body:"summary=private"})).status).toBe(405);});
 it("blocks private previews of suspended source catalogues even without a route",async()=>{const f=await previewFixture();await env.DB.prepare("DELETE FROM public_catalogue_routes WHERE slug=?").bind(f.slug).run();await env.DB.prepare("UPDATE catalogues SET status='suspended' WHERE id=?").bind(f.n).run();expect((await get(f)).status).toBe(404);});
 it("blocks private previews after organization suspension",async()=>{const f=await previewFixture();await env.DB.prepare("UPDATE organizations SET status='suspended' WHERE id=?").bind(f.n).run();expect((await get(f)).status).toBe(404);});
 it("shows a sealed candidate without making it publicly discoverable",async()=>{
  const f=await previewFixture();await env.DB.prepare("DELETE FROM public_catalogue_routes WHERE slug=?").bind(f.slug).run();
  expect((await app.fetch(new Request(f.origin+"/"),env)).status).toBe(404);
  const response=await get(f);expect(response.status).toBe(200);
  const body=await response.text();expect(body).toContain("Private preview");expect(body).toContain("Revision 2");expect(body).not.toContain("SECRET");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  expect(response.headers.get("Content-Security-Policy")).toContain("script-src 'none'");
  expect(body).toContain('content="noindex, nofollow"');expect(body).not.toContain("<script");
 });
 it("keeps navigation, forms, styles, images and PDF links inside the signed path",async()=>{
  const f=await previewFixture(25);
  const home=await(await get(f)).text(),listing=await(await get(f,"/catalogue?q=pump")).text(),detail=await(await get(f,"/items/precision-pump")).text();
  expect(home).toContain('href="'+f.prefix+'/theme.css');
  expect(home).toContain('src="'+f.prefix+'/media/'+f.previewPublicationId+'/'+f.heroId);
  expect(listing).toContain('action="'+f.prefix+'/catalogue"');
  expect(listing).toContain(f.prefix+'/catalogue?');
  expect(detail).toContain(f.prefix+'/media/'+f.previewPublicationId+'/'+f.documentId);
  expect(home).toContain('href="'+f.origin+'/"');expect(home).not.toContain('rel="canonical" href="'+f.origin+f.prefix);
  expect((await get(f,"/theme.css?theme=professional")).headers.get("Content-Type")).toContain("text/css");
  expect((await get(f,"/favicon.svg")).status).toBe(200);
  expect(await(await get(f,"/robots.txt")).text()).toContain("Disallow: /");
 });
 it("serves preview media with HEAD and byte ranges and rejects public/raw-key access",async()=>{
  const f=await previewFixture(),media="/media/"+f.previewPublicationId+"/"+f.documentId;
  const response=await get(f,media);expect(response.status).toBe(200);expect(new TextDecoder().decode(await response.arrayBuffer())).toContain("%PDF-1.4");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  const head=await get(f,media,{method:"HEAD"});expect(head.status).toBe(200);expect(await head.text()).toBe("");
  const range=await get(f,media,{headers:{Range:"bytes=0-3"}});expect(range.status).toBe(206);expect(new TextDecoder().decode(await range.arrayBuffer())).toBe("%PDF");
  expect((await app.fetch(new Request(f.origin+media),env)).status).toBe(404);
  expect((await get(f,"/media/"+f.publicationId+"/"+f.documentId)).status).toBe(404);
  expect((await get(f,"/"+f.documentKey)).status).toBe(404);
 });
 it("rejects altered tokens, incorrect signing keys, unknown hosts and missing configuration",async()=>{
  const f=await previewFixture();
  expect((await get(f,"/",{}, {PUBLICATION_PREVIEW_SECRET:""})).status).toBe(404);
  expect((await get(f,"/",{}, {PUBLICATION_PREVIEW_SECRET:"c".repeat(64)})).status).toBe(404);
  const altered=f.token.slice(0,-1)+(f.token.endsWith("A")?"B":"A");
  expect((await app.fetch(new Request(f.origin+"/preview/"+altered+"/"),env)).status).toBe(404);
  expect((await app.fetch(new Request("https://other-catalogue.techabanca.com"+f.prefix+"/"),env)).status).toBe(404);
  expect((await get(f,"/catalogue",{method:"POST"})).status).toBe(405);
 });
 it("checks signed expiration and the exact persisted expiration",async()=>{
  const f=await previewFixture();
  const expired=await signPreview({v:1,publicationId:f.previewPublicationId,slug:f.slug,expiresAt:Math.floor(Date.now()/1000)-60},secret,Math.floor(Date.now()/1000)-100);
  expect((await app.fetch(new Request(f.origin+"/preview/"+expired+"/"),env)).status).toBe(404);
  const mismatch=await signPreview({v:1,publicationId:f.previewPublicationId,slug:f.slug,expiresAt:f.expiresAt+1},secret);
  expect((await app.fetch(new Request(f.origin+"/preview/"+mismatch+"/"),env)).status).toBe(404);
 });
 it.each(["failed","retired","active"])("closes previews when a candidate becomes %s",async state=>{
  const f=await previewFixture(),now=new Date().toISOString();
  if(state==="active" || state==="retired")await env.DB.prepare("UPDATE catalogue_publications SET state='retired',retired_at=? WHERE id=?").bind(now,f.n).run();
  if(state==="retired")await env.DB.prepare("UPDATE catalogue_publications SET state='active',activated_at=? WHERE id=?").bind(now,f.numericId).run();
  await env.DB.prepare("UPDATE catalogue_publications SET state=?,failed_at=?,retired_at=?,activated_at=? WHERE id=?").bind(state,now,now,now,f.numericId).run();
  expect((await get(f)).status).toBe(404);expect((await get(f,"/media/"+f.previewPublicationId+"/"+f.imageId)).status).toBe(404);
 });
 it("rejects unsealed, revoked and suspended previews including files",async()=>{
  const f=await previewFixture();
  await env.DB.prepare("UPDATE catalogue_publications SET preview_revoked_at=? WHERE id=?").bind(new Date().toISOString(),f.numericId).run();
  expect((await get(f)).status).toBe(404);
  const other=await previewFixture();
  await env.DB.prepare("UPDATE public_catalogue_routes SET status='suspended' WHERE slug=?").bind(other.slug).run();
  expect((await get(other)).status).toBe(404);
  const third=await createFixture(),pub=publicId("pub",third.n+3000000),expiration=Math.floor(Date.now()/1000)+600;
  await env.DB.prepare("INSERT INTO catalogue_publications (public_id,catalogue_id,catalogue_public_id,revision_number,state,source_catalogue_version,created_at,preview_expires_at) VALUES (?,?,?,2,'building',1,?,?)").bind(pub,third.n,third.catalogueId,new Date().toISOString(),new Date(expiration*1000).toISOString()).run();
  const token=await signPreview({v:1,publicationId:pub,slug:third.slug,expiresAt:expiration},secret);
  expect((await app.fetch(new Request(third.origin+"/preview/"+token+"/"),env)).status).toBe(404);
 });
 it("never reads fresh draft fields or alters an existing public route while previewing",async()=>{
  const f=await previewFixture();
  await env.DB.prepare("UPDATE catalogue_items SET name='Fresh draft SECRET' WHERE catalogue_id=?").bind(f.n).run();
  const body=await(await get(f,"/items/precision-pump")).text();expect(body).toContain("Precision Pump");expect(body).not.toContain("SECRET");
  const live=await(await app.fetch(new Request(f.origin+"/"),env)).text();expect(live).not.toContain("Private preview");
  expect((await env.DB.prepare("SELECT publication_id FROM public_catalogue_routes WHERE slug=?").bind(f.slug).first<{publication_id:number}>())!.publication_id).toBe(f.n);
 });
 it("handles canonical redirects, errors and HEAD without escaping private navigation",async()=>{
  const f=await previewFixture();
  const redirect=await app.fetch(new Request(f.origin+f.prefix),env);expect(redirect.status).toBe(308);expect(redirect.headers.get("Location")).toBe(f.prefix+"/");
  const trailing=await get(f,"/catalogue/?q=pump");expect(trailing.status).toBe(308);expect(trailing.headers.get("Location")).toBe(f.prefix+"/catalogue?q=pump");
  const missing=await get(f,"/items/missing");expect(missing.status).toBe(404);expect(await missing.text()).toContain('href="'+f.prefix+'/catalogue"');
  const head=await get(f,"/",{method:"HEAD"});expect(head.status).toBe(200);expect(await head.text()).toBe("");expect(head.headers.get("X-Robots-Tag")).toContain("noindex");
 });
 it("supports long literal and multibyte search queries within the public input bound",async()=>{
  const f=await previewFixture();
  for(const query of ["q".repeat(100),"界".repeat(100),"%","_","\\","precision pump"]) {
   const response=await get(f,"/catalogue?q="+encodeURIComponent(query));expect(response.status,query).toBe(200);
  }
  expect((await get(f,"/catalogue?q="+"q".repeat(101))).status).toBe(400);
 });

 it("keeps a signed preview and its files within the staging deployment",async()=>{
  const f=await previewFixture(),origin="https://"+f.slug+".catalogue-preview.techabanca.com";
  const bindings={...env,DEPLOYMENT_ENVIRONMENT:"staging",LOCAL_PREVIEW:"true",PUBLICATION_PREVIEW_SECRET:secret};
  const response=await app.fetch(new Request(origin+f.prefix+"/"),bindings);
  expect(response.status).toBe(200);expect(await response.text()).toContain("Private preview");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect((await app.fetch(new Request(f.origin+f.prefix+"/"),bindings)).status).toBe(404);
  const media=await app.fetch(new Request(origin+f.prefix+"/media/"+f.previewPublicationId+"/"+f.documentId,{headers:{Range:"bytes=0-3"}}),bindings);
  expect(media.status).toBe(206);expect(await media.text()).toBe("%PDF");expect(media.headers.get("X-Robots-Tag")).toContain("noindex");
 });
 it("disables enquiry capture inside valid private previews",async()=>{
  const f=await previewFixture(),response=await get(f,"/contact?item=precision-pump"),body=await response.text();
  expect(response.status).toBe(200); expect(body).toContain("Enquiry forms are available on the published catalogue."); expect(body).not.toContain('name="formToken"');
  expect((await get(f,"/contact",{method:"POST",headers:{Origin:f.origin,"Content-Type":"application/x-www-form-urlencoded"},body:"contactName=Private"})).status).toBe(405);
  expect((await env.DB.prepare("SELECT count(*) AS n FROM enquiries WHERE catalogue_id=?").bind(f.n).first<{n:number}>())!.n).toBe(0);
 });

});
