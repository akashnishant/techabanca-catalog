import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src";
import { resolveHost } from "../src/routing";
import { createFixture } from "./fixtures";
const staging={...env,DEPLOYMENT_ENVIRONMENT:"staging",LOCAL_PREVIEW:"false"};
describe("staging public isolation",()=>{
 it("serves the activated snapshot only on its staging hostname",async()=>{
  const f=await createFixture(),origin="https://"+f.slug+".catalogue-preview.techabanca.com";
  const response=await app.fetch(new Request(origin+"/"),staging);
  expect(response.status).toBe(200);expect(response.headers.get("X-Techabanca-Environment")).toBe("staging");expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  const body=await response.text();expect(body).toContain("Northstar Supply");expect(body).not.toContain("SECRET");expect(body).toContain('rel="canonical" href="'+f.origin+'/');
  expect((await app.fetch(new Request(f.origin+"/"),staging)).status).toBe(404);
 });
 it.each(["billing.techabanca.com","catalogue-preview.techabanca.com","acme.techabanca.com","acme.localhost:5174","two.labels.catalogue-preview.techabanca.com","acme.catalogue-preview.techabanca.com.evil.test"])("refuses utility endpoints on %s",async host=>{
  for(const path of ["/health","/theme.css","/favicon.svg","/"])expect((await app.fetch(new Request("https://"+host+path),{...staging,LOCAL_PREVIEW:"true"})).status).toBe(404);
 });
 it("does not permit the local switch to override staging isolation",()=>{
  expect(resolveHost(new URL("http://acme.localhost:5174"),true,"staging")).toBeNull();
  expect(resolveHost(new URL("https://acme.techabanca.com"),true,"staging")).toBeNull();
  expect(resolveHost(new URL("https://acme.catalogue-preview.techabanca.com"),false,"staging")).toMatchObject({slug:"acme",preview:true});
 });
 it("rejects an unknown environment before reading storage",async()=>{
  let read=0;
  const response=await app.fetch(new Request("https://acme.catalogue-preview.techabanca.com/"),{...staging,DEPLOYMENT_ENVIRONMENT:"stagin",DB:{prepare(){read++;throw new Error("unexpected");}} as unknown as D1Database});
  expect(response.status).toBe(404);expect(read).toBe(0);
 });
 it("redirects all staging HTTP paths to HTTPS",async()=>{
  const response=await app.fetch(new Request("http://acme.catalogue-preview.techabanca.com/health?q=pump"),staging);
  expect(response.status).toBe(308);expect(response.headers.get("Location")).toBe("https://acme.catalogue-preview.techabanca.com/health?q=pump");
 });
 it("rejects a nonstandard staging port",async()=>expect((await app.fetch(new Request("https://acme.catalogue-preview.techabanca.com:8443/health"),staging)).status).toBe(404));
 it("keeps production and staging host policies separate",()=>{
  expect(resolveHost(new URL("https://acme.catalogue-preview.techabanca.com"),false,"production")).toBeNull();
  expect(resolveHost(new URL("https://acme.techabanca.com"),false,"production")).toMatchObject({preview:false});
 });
 it("sets crawler exclusion on staging CSS, images and ranged PDF downloads",async()=>{
  const f=await createFixture(),origin="https://"+f.slug+".catalogue-preview.techabanca.com";
  for(const path of ["/theme.css","/favicon.svg","/media/"+f.publicationId+"/"+f.imageId]){
   const response=await app.fetch(new Request(origin+path),staging);expect(response.status).toBe(200);expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  }
  const pdf=await app.fetch(new Request(origin+"/media/"+f.publicationId+"/"+f.documentId,{headers:{Range:"bytes=0-3"}}),staging);
  expect(pdf.status).toBe(206);expect(await pdf.text()).toBe("%PDF");expect(pdf.headers.get("X-Robots-Tag")).toContain("noindex");
  expect((await app.fetch(new Request(f.origin+"/media/"+f.publicationId+"/"+f.documentId),staging)).status).toBe(404);
 });
 it("blocks staging robots and still ignores forwarded tenant headers",async()=>{
  const f=await createFixture(),origin="https://"+f.slug+".catalogue-preview.techabanca.com";
  const response=await app.fetch(new Request(origin+"/robots.txt",{headers:{"X-Forwarded-Host":"billing.techabanca.com"}}),staging);
  expect(response.status).toBe(200);expect(await response.text()).toContain("Disallow: /");
 });
});
