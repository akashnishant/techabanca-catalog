import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/worker";
import { id, previewConfig, publicationFixture } from "./publication-fixtures";
const ROOT="https://catalogue-preview.techabanca.com";
const staging={...env,DEPLOYMENT_ENVIRONMENT:"staging",LOCAL_PREVIEW:"false"};
describe("staging management boundary",()=>{
 it("serves health on the exact management host with crawler exclusion",async()=>{
  const response=await app.fetch(new Request(ROOT+"/api/health"),staging);
  expect(response.status).toBe(200);expect(response.headers.get("X-Techabanca-Environment")).toBe("staging");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
 });
 it.each(["catalogue.techabanca.com","billing.techabanca.com","billing-api.techabanca.com","techabanca.com","acme.catalogue-preview.techabanca.com","catalogue-preview.techabanca.com.evil.test","localhost:5173"])("refuses API access on %s before storage or assets",async host=>{
  let accessed=0;
  const bindings={...staging,DB:{prepare(){accessed++;throw new Error("unexpected read");}} as unknown as D1Database,STATIC_ASSETS:{fetch:async()=>{accessed++;return new Response("unexpected");}} as unknown as Fetcher};
  const response=await app.fetch(new Request("https://"+host+"/api/v1/auth/session",{headers:{cookie:"__Host-techabanca_catalogue_session="+"a".repeat(64),"X-Forwarded-Host":"catalogue-preview.techabanca.com"}}),bindings);
  expect(response.status).toBe(404);expect(accessed).toBe(0);expect(response.headers.get("set-cookie")).toBeNull();
 });
 it("does not trust a forwarded host on a valid management request",async()=>{
  const response=await app.fetch(new Request(ROOT+"/api/health",{headers:{Host:"billing.techabanca.com","X-Forwarded-Host":"billing.techabanca.com"}}),staging);
  expect(response.status).toBe(200);
 });
 it("redirects management HTTP to HTTPS while preserving path and query",async()=>{
  const response=await app.fetch(new Request("http://catalogue-preview.techabanca.com/api/health?next=%2Ftest"),staging);
  expect(response.status).toBe(308);expect(response.headers.get("Location")).toBe(ROOT+"/api/health?next=%2Ftest");
 });
 it("refuses a nonstandard management port",async()=>expect((await app.fetch(new Request(ROOT+":8443/api/health"),staging)).status).toBe(404));
 it("fails closed for an invalid environment setting",async()=>expect((await app.fetch(new Request(ROOT+"/api/health"),{...staging,DEPLOYMENT_ENVIRONMENT:"stagin"})).status).toBe(503));
 it("serves the SPA through its distinct static binding and excludes it from indexing",async()=>{
  const response=await app.fetch(new Request(ROOT+"/"),{...staging,STATIC_ASSETS:{fetch:async()=>new Response("<!doctype html><title>Techabanca Catalogue</title>",{headers:{"Content-Type":"text/html"}})} as unknown as Fetcher});
  expect(response.status).toBe(200);expect(response.headers.get("X-Robots-Tag")).toContain("noindex");expect(response.headers.get("Cache-Control")).toBe("no-store");
 });
 it("unknown API endpoints never fall through to the SPA",async()=>{
  let assets=0;
  const response=await app.fetch(new Request(ROOT+"/api/missing"),{...staging,STATIC_ASSETS:{fetch:async()=>{assets++;return new Response("SPA");}} as unknown as Fetcher});
  expect(response.status).toBe(404);expect(assets).toBe(0);expect(await response.text()).toContain("not_found");
 });
 it("blocks management robots without reading storage",async()=>{
  const response=await app.fetch(new Request(ROOT+"/robots.txt"),staging);expect(response.status).toBe(200);expect(await response.text()).toContain("Disallow: /");
 });
 it("returns staging publication URLs while keeping entitlement enforcement",async()=>{
  const f=await publicationFixture();
  const response=await app.fetch(new Request(ROOT+"/api/v1/catalogue/publications",{headers:{cookie:await f.session(),"X-Techabanca-Organization":id("org",f.n)}}),{...env,...previewConfig,DEPLOYMENT_ENVIRONMENT:"staging",ALLOW_UNSUBSCRIBED_PUBLISHING:"false"});
  expect(response.status).toBe(200);
  const body=await response.json<{data:{publicUrl:string;entitled:boolean;canPublish:boolean}}>();
  expect(body.data.publicUrl).toBe("https://"+f.slug+".catalogue-preview.techabanca.com");
  expect(body.data.entitled).toBe(false);expect(body.data.canPublish).toBe(false);
 });
});
