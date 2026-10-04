import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/worker";
import { TENANT_HEADER } from "../src/worker/middleware/require-tenant-access";
import { PublicationService } from "../src/worker/services/publication-service";
import { PublicationRepository } from "../src/worker/repositories/publication-repository";
import { id, previewConfig, publicationFixture } from "./publication-fixtures";

type Fixture = Awaited<ReturnType<typeof publicationFixture>>;
const ROOT = "https://catalogue.test";
const service = (config = previewConfig, bucket: R2Bucket = env.ASSETS) => new PublicationService(env.DB, bucket, config);
const actor = (f: Fixture) => ({ userId: f.owner, role: "owner" });
async function revision(f: Fixture) {
 return (await env.DB.prepare("SELECT authoring_revision FROM catalogues WHERE id = ?").bind(f.n).first<{authoring_revision: number}>())!.authoring_revision;
}
async function prepare(f: Fixture) { return service().prepare(f.tenant, actor(f), await revision(f), ROOT); }
async function activate(f: Fixture, p: Awaited<ReturnType<typeof prepare>>) {
 return service().activate(f.tenant, actor(f), p.publication.id, p.sourceRevision, ROOT);
}
async function route(f: Fixture) {
 return env.DB.prepare("SELECT p.public_id FROM public_catalogue_routes r JOIN catalogue_publications p ON p.id = r.publication_id WHERE r.slug = ?").bind(f.slug).first<{public_id: string}>();
}
async function count(f: Fixture, action?: string) {
 return (await env.DB.prepare(action ? "SELECT count(*) AS n FROM audit_events WHERE organization_id = ? AND action = ?" : "SELECT count(*) AS n FROM catalogue_publications WHERE catalogue_id = ?")
  .bind(...(action ? [f.n, action] : [f.n])).first<{n: number}>())!.n;
}
async function request(f: Fixture, suffix = "", method = "GET", body?: unknown, options: {user?: number; config?: typeof previewConfig; headers?: Record<string,string>} = {}) {
 const headers = { cookie: await f.session(options.user), [TENANT_HEADER]: id("org", f.n), Origin: ROOT, "Content-Type": "application/json", ...options.headers };
 return app.fetch(new Request(ROOT + "/api/v1/catalogue/publications" + suffix, { method, headers, ...(body === undefined ? {} : {body: JSON.stringify(body)}) }), {...env, ...(options.config ?? previewConfig)});
}
async function subscription(f: Fixture, status = "active", grant = true, expiration: "future" | "past" = "future") {
 const now = new Date().toISOString(), start = "2020-01-01T00:00:00.000Z";
 const end = expiration === "past" ? "2020-02-01T00:00:00.000Z" : "2099-01-01T00:00:00.000Z";
 await env.DB.batch([
  env.DB.prepare("INSERT INTO subscription_plans (id, code, name, created_at, updated_at) VALUES (?, ?, 'Publishing test', ?, ?)").bind(f.n, "publish-" + f.n, now, now),
  env.DB.prepare("INSERT INTO plan_entitlements (plan_id, entitlement_key, value_type, boolean_value, created_at, updated_at) VALUES (?, 'catalogue.publish', 'boolean', ?, ?, ?)").bind(f.n, grant ? 1 : 0, now, now),
  env.DB.prepare("INSERT INTO subscriptions (public_id, organization_id, plan_id, status, trial_starts_at, trial_ends_at, current_period_starts_at, current_period_ends_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id("sub", f.n), f.n, f.n, status, start, end, start, end, now, now),
 ]);
}
describe("M7 publication workflow", () => {
 it("requires a session and selected authorized organization", async () => {
  const f = await publicationFixture();
  expect((await app.fetch(new Request(ROOT + "/api/v1/catalogue/publications"), {...env,...previewConfig})).status).toBe(401);
  expect((await request(f, "", "GET", undefined, {headers:{[TENANT_HEADER]:""}})).status).toBe(400);
  const foreign = await publicationFixture();
  expect((await request(f, "", "GET", undefined, {headers:{[TENANT_HEADER]:id("org",foreign.n)}})).status).toBe(403);
 });
 it("allows editor status reads and blocks every editor mutation", async () => {
  const f = await publicationFixture(), p = await prepare(f);
  const status = await request(f, "", "GET", undefined, {user:f.editor});
  expect(status.status).toBe(200);
  expect((await status.json<{data:{canPublish:boolean}}>()).data.canPublish).toBe(false);
  for (const [suffix, method, body] of [
   ["/prepare","POST",{sourceRevision:p.sourceRevision}],
   ["/activate","POST",{sourceRevision:p.sourceRevision,publicationId:p.publication.id}],
   ["/unpublish","POST",{sourceRevision:p.sourceRevision,publicationId:p.publication.id}],
   ["/"+p.publication.id,"DELETE",undefined],
  ] as const) expect((await request(f,suffix,method,body,{user:f.editor})).status).toBe(403);
 });
 it("lets admins prepare and activate with tenant-scoped audit records", async () => {
  const f=await publicationFixture(), sourceRevision=await revision(f);
  const response=await request(f,"/prepare","POST",{sourceRevision},{user:f.admin});
  expect(response.status).toBe(201);
  const data=(await response.json<{data:{publication:{id:string};previewUrl:string}}>()).data;
  expect(data.previewUrl).toMatch(new RegExp("^https://"+f.slug+"\\.techabanca\\.com/preview/"));
  expect((await request(f,"/activate","POST",{sourceRevision,publicationId:data.publication.id},{user:f.admin})).status).toBe(200);
  expect(await count(f,"publication.activated")).toBe(1);
  expect((await env.DB.prepare("SELECT actor_user_id FROM audit_events WHERE organization_id = ? AND action = 'publication.activated'").bind(f.n).first<{actor_user_id:number}>())!.actor_user_id).toBe(f.admin);
 });
 it("defaults to denying organizations without a publishing entitlement", async () => {
  const f=await publicationFixture(), config={...previewConfig,ALLOW_UNSUBSCRIBED_PUBLISHING:"false"};
  expect((await request(f,"/prepare","POST",{sourceRevision:await revision(f)},{config})).status).toBe(403);
  expect(await count(f)).toBe(0);
 });
 it("honors a current explicit boolean entitlement with development fallback disabled", async () => {
  const f=await publicationFixture(); await subscription(f);
  const config={...previewConfig,ALLOW_UNSUBSCRIBED_PUBLISHING:"false"};
  expect((await request(f,"/prepare","POST",{sourceRevision:await revision(f)},{config})).status).toBe(201);
 });
 it.each(["past_due","canceled","expired"])("never lets %s subscriptions use the development fallback", async status => {
  const f=await publicationFixture();await subscription(f,status);
  expect((await request(f,"/prepare","POST",{sourceRevision:await revision(f)})).status).toBe(403);
  expect(await count(f)).toBe(0);
 });
 it.each([["active",true,"past"],["trialing",true,"past"],["active",false,"future"]] as const)("rejects expired periods and false entitlements: %s/%s/%s",async(status,grant,expiration)=>{
  const f=await publicationFixture();await subscription(f,status,grant,expiration);
  expect((await request(f,"/prepare","POST",{sourceRevision:await revision(f)})).status).toBe(403);
 });
 it("reports readiness and counts without signing links or leaking storage keys",async()=>{
  const f=await publicationFixture(), response=await request(f);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  const text=await response.text();
  expect(text).not.toContain("publisher/");expect(text).not.toContain("preview/");
  const data=JSON.parse(text).data;
  expect(data).toMatchObject({ready:true,active:null,hasChanges:true,counts:{eligible:2,draft:1,hidden:1,excluded:1}});
 });
 it("blocks missing signing configuration before creating a snapshot",async()=>{
  const f=await publicationFixture();
  const config={...previewConfig,PUBLICATION_PREVIEW_SECRET:""};
  const response=await request(f,"/prepare","POST",{sourceRevision:await revision(f)},{config});
  expect(response.status).toBe(409);expect(await count(f)).toBe(0);
 });
 it("blocks all-draft catalogues and invalid primary images",async()=>{
  const f=await publicationFixture();
  await env.DB.prepare("UPDATE catalogue_items SET status='draft' WHERE catalogue_id=?").bind(f.n).run();
  expect((await request(f,"/prepare","POST",{sourceRevision:await revision(f)})).status).toBe(409);
  await env.DB.prepare("UPDATE catalogue_items SET status='published' WHERE id=?").bind(f.product).run();
  await env.DB.prepare("UPDATE item_images SET is_primary=0 WHERE item_id=?").bind(f.product).run();
  const status=await service().status(f.tenant,actor(f),ROOT);
  expect(status.issues.some(x=>x.includes("primary image"))).toBe(true);
 });
 it("blocks placeholder addresses and inactive business types or themes",async()=>{
  const f=await publicationFixture();
  await env.DB.prepare("UPDATE catalogues SET slug=? WHERE id=?").bind("draft-"+f.n,f.n).run();
  expect((await service().status(f.tenant,actor(f),ROOT)).ready).toBe(false);
  await env.DB.prepare("UPDATE catalogues SET slug=? WHERE id=?").bind(f.slug,f.n).run();
  try {
  await env.DB.prepare("UPDATE theme_presets SET is_active=0 WHERE code='professional'").run();
  expect((await service().status(f.tenant,actor(f),ROOT)).issues.some(x=>x.includes("theme"))).toBe(true);
  await env.DB.prepare("UPDATE theme_presets SET is_active=1 WHERE code='professional'").run();
  await env.DB.prepare("UPDATE business_types SET is_active=0 WHERE id=1").run();
  expect((await service().status(f.tenant,actor(f),ROOT)).issues.some(x=>x.includes("business type"))).toBe(true);
  } finally { await env.DB.prepare("UPDATE business_types SET is_active=1 WHERE id=1").run(); await env.DB.prepare("UPDATE theme_presets SET is_active=1 WHERE code='professional'").run(); }
 });
 it("creates a sealed private snapshot with only visible selected fields",async()=>{
  const f=await publicationFixture(), p=await prepare(f);
  expect(p.publication.state).toBe("building");expect(p.publication.sealed).toBe(true);expect(await route(f)).toBeNull();
  const pub=(await env.DB.prepare("SELECT id FROM catalogue_publications WHERE public_id=?").bind(p.publication.id).first<{id:number}>())!.id;
  const rows=await env.DB.prepare("SELECT * FROM published_items WHERE publication_id=? ORDER BY item_type").bind(pub).all();
  expect(rows.results).toHaveLength(2);expect(rows.results[1]).toMatchObject({name:"Maintenance Visit",price_minor_units:null,currency_code:null});
  for(const table of ["published_catalogues","published_categories","published_items","published_item_attributes","published_item_images","published_item_documents"]) {
   expect(JSON.stringify((await env.DB.prepare("SELECT * FROM "+table+" WHERE publication_id=?").bind(pub).all()).results)).not.toContain("SECRET");
  }
  expect((await env.DB.prepare("SELECT count(*) AS n FROM published_categories WHERE publication_id=?").bind(pub).first<{n:number}>())!.n).toBe(1);
  expect((await env.DB.prepare("SELECT count(*) AS n FROM published_item_documents WHERE publication_id=?").bind(pub).first<{n:number}>())!.n).toBe(1);
 });
 it("omits disabled contact/about/category data rather than retaining it in snapshots",async()=>{
  const f=await publicationFixture();
  await env.DB.prepare("UPDATE catalogue_website_settings SET show_contact=0,show_about=0,show_categories=0 WHERE catalogue_id=?").bind(f.n).run();
  const p=await prepare(f);
  const h=await env.DB.prepare("SELECT pc.* FROM published_catalogues pc JOIN catalogue_publications p ON p.id=pc.publication_id WHERE p.public_id=?").bind(p.publication.id).first();
  expect(h).toMatchObject({about_text:null,contact_email:null,contact_phone:null,whatsapp_number:null,address_text:null});
  expect((await env.DB.prepare("SELECT count(*) AS n FROM published_categories WHERE publication_id=?").bind(h!.publication_id).first<{n:number}>())!.n).toBe(0);
  expect((await env.DB.prepare("SELECT count(*) AS n FROM published_items WHERE publication_id=? AND category_public_id IS NOT NULL").bind(h!.publication_id).first<{n:number}>())!.n).toBe(0);
 });
 it("seals all snapshot tables while still private and prevents changing seal metadata",async()=>{
  const f=await publicationFixture(),p=await prepare(f);
  const pub=(await env.DB.prepare("SELECT id FROM catalogue_publications WHERE public_id=?").bind(p.publication.id).first<{id:number}>())!.id;
  for(const [table,column] of [["published_catalogues","name"],["published_categories","name"],["published_items","name"],["published_item_attributes","label"],["published_item_images","alt_text"],["published_item_documents","label"]]) {
   await expect(env.DB.prepare("UPDATE "+table+" SET "+column+"='Tampered' WHERE publication_id=?").bind(pub).run()).rejects.toThrow();
   await expect(env.DB.prepare("DELETE FROM "+table+" WHERE publication_id=?").bind(pub).run()).rejects.toThrow();
  }
  await expect(env.DB.prepare("INSERT INTO published_items (publication_id,item_public_id,item_type,name,slug) VALUES (?,?,'product','Intruder','intruder')").bind(pub,id("itm",f.n)).run()).rejects.toThrow();
  await expect(env.DB.prepare("UPDATE catalogue_publications SET source_authoring_revision=source_authoring_revision+1 WHERE id=?").bind(pub).run()).rejects.toThrow("publication_seal_is_final");
 });
 it("rejects moving a mutable legacy snapshot row into a sealed candidate",async()=>{
  const f=await publicationFixture(),p=await prepare(f),now=new Date().toISOString();
  await env.DB.batch([
   env.DB.prepare("INSERT INTO catalogue_publications (id,public_id,catalogue_id,catalogue_public_id,revision_number,state,source_catalogue_version,created_at) VALUES (?, ?, ?, ?, 100,'building',1,?)").bind(f.n,id("pub",f.n),f.n,id("cat",f.n),now),
   env.DB.prepare("INSERT INTO published_items (publication_id,item_public_id,item_type,name,slug) VALUES (?,?,'product','Move attack','move-attack')").bind(f.n,id("itm",f.n)),
  ]);
  await expect(env.DB.prepare("UPDATE published_items SET publication_id=(SELECT id FROM catalogue_publications WHERE public_id=?) WHERE publication_id=?").bind(p.publication.id,f.n).run()).rejects.toThrow("published_snapshot_is_sealed");
 });
 it("rejects stale preparation and edits made after preview",async()=>{
  const f=await publicationFixture(),old=await revision(f);
  await env.DB.prepare("UPDATE catalogue_items SET name='Fresh Pump' WHERE id=?").bind(f.product).run();
  expect((await request(f,"/prepare","POST",{sourceRevision:old})).status).toBe(409);
  const p=await prepare(f);
  await env.DB.prepare("UPDATE item_attribute_values SET value_text='Updated brand' WHERE item_id=? AND attribute_definition_id=1").bind(f.product).run();
  expect((await request(f,"/activate","POST",{publicationId:p.publication.id,sourceRevision:p.sourceRevision})).status).toBe(409);
  expect(await route(f)).toBeNull();
 });
 it("increments reviewed source revisions for all content and preset changes",async()=>{
  const f=await publicationFixture();
  const queries=[
   ["UPDATE catalogue_items SET short_description='Updated' WHERE id=?",f.product],
   ["UPDATE categories SET name='Hardware updated' WHERE id=?",f.product],
   ["UPDATE catalogue_website_settings SET hero_title='Updated hero' WHERE catalogue_id=?",f.n],
   ["UPDATE business_profiles SET about_text='Updated about' WHERE organization_id=?",f.n],
   ["UPDATE item_images SET alt_text='Updated image' WHERE item_id=?",f.product],
   ["UPDATE item_documents SET label='Updated sheet' WHERE item_id=?",f.product],
   ["UPDATE item_attribute_values SET value_text='Updated brand' WHERE item_id=? AND attribute_definition_id=1",f.product],
   ["UPDATE assets SET original_filename='updated.png' WHERE id=?",f.product],
   ["UPDATE catalogues SET name='Updated catalogue' WHERE id=?",f.n],
   ["UPDATE attribute_definitions SET label=label WHERE id=?",1],
   ["UPDATE business_type_attributes SET is_required=is_required WHERE business_type_id=?",1],
   ["UPDATE business_types SET name=name WHERE id=?",1],
   ["UPDATE theme_presets SET name=name WHERE code=?","professional"],
  ] as const;
  for(const [sql,value] of queries){const before=await revision(f);await env.DB.prepare(sql).bind(value).run();expect(await revision(f),sql).toBeGreaterThan(before);}
 });
 it("requires applicable required specifications and invalidates previews when rules change",async()=>{
  const f=await publicationFixture(),p=await prepare(f),before=await revision(f);
  const original=await env.DB.prepare("SELECT is_required FROM business_type_attributes WHERE business_type_id=1 AND attribute_definition_id=3").first<{is_required:number}>();
  try {
  await env.DB.prepare("UPDATE business_type_attributes SET is_required=1 WHERE business_type_id=1 AND attribute_definition_id=3").run();
  expect(await revision(f)).toBeGreaterThan(before);
  await env.DB.prepare("DELETE FROM item_attribute_values WHERE item_id=? AND attribute_definition_id=3").bind(f.product).run();
  expect((await service().status(f.tenant,actor(f),ROOT)).issues.some(x=>x.includes("required"))).toBe(true);
  expect((await request(f,"/activate","POST",{publicationId:p.publication.id,sourceRevision:p.sourceRevision})).status).toBe(409);
  } finally {await env.DB.prepare("UPDATE business_type_attributes SET is_required=? WHERE business_type_id=1 AND attribute_definition_id=3").bind(original!.is_required).run();}
 });
 it("rejects missing or replaced R2 bytes before preparation and activation",async()=>{
  const f=await publicationFixture(),p=await prepare(f);
  await env.ASSETS.delete(f.imageKey);
  expect((await request(f,"/prepare","POST",{sourceRevision:await revision(f)})).status).toBe(409);
  expect((await request(f,"/activate","POST",{publicationId:p.publication.id,sourceRevision:p.sourceRevision})).status).toBe(409);
  await env.ASSETS.put(f.imageKey,new TextEncoder().encode("wrong bytes"),{httpMetadata:{contentType:"image/png"}});
  expect((await request(f,"/prepare","POST",{sourceRevision:await revision(f)})).status).toBe(409);
  expect(await count(f)).toBe(1);expect(await route(f)).toBeNull();
 });
 it("rolls back preparation when content changes during media verification",async()=>{
  const f=await publicationFixture(),before=await revision(f);let changed=false;
  const bucket={get:async(key:string)=>{if(!changed){changed=true;await env.DB.prepare("UPDATE catalogue_items SET name='Concurrent Pump' WHERE id=?").bind(f.product).run();}return env.ASSETS.get(key);}} as R2Bucket;
  await expect(service(previewConfig,bucket).prepare(f.tenant,actor(f),before,ROOT)).rejects.toThrow("publication_source_changed");
  expect(await count(f)).toBe(0);expect(await count(f,"publication.prepared")).toBe(0);
 });
 it("rechecks role and entitlement inside activation transaction",async()=>{
  const f=await publicationFixture(),p=await prepare(f);let changed=false;
  const bucket={get:async(key:string)=>{if(!changed){changed=true;await env.DB.prepare("UPDATE organization_members SET role='editor' WHERE organization_id=? AND user_id=?").bind(f.n,f.owner).run();}return env.ASSETS.get(key);}} as R2Bucket;
  await expect(service(previewConfig,bucket).activate(f.tenant,actor(f),p.publication.id,p.sourceRevision,ROOT)).rejects.toMatchObject({status:409});
  expect(await route(f)).toBeNull();expect(await count(f,"publication.activated")).toBe(0);
 });
 it("rechecks subscription changes during activation",async()=>{
  const f=await publicationFixture();await subscription(f);const p=await prepare(f);let changed=false;
  const bucket={get:async(key:string)=>{if(!changed){changed=true;await env.DB.prepare("UPDATE subscriptions SET status='canceled' WHERE organization_id=?").bind(f.n).run();}return env.ASSETS.get(key);}} as R2Bucket;
  await expect(service(previewConfig,bucket).activate(f.tenant,actor(f),p.publication.id,p.sourceRevision,ROOT)).rejects.toMatchObject({status:409});expect(await route(f)).toBeNull();
 });
 it("activates and republishes atomically while preserving the old live snapshot through edits",async()=>{
  const f=await publicationFixture(),p=await prepare(f);await activate(f,p);
  const sourceBefore=await revision(f);expect((await route(f))!.public_id).toBe(p.publication.id);
  expect((await service().status(f.tenant,actor(f),ROOT)).hasChanges).toBe(false);
  await env.DB.prepare("UPDATE catalogue_items SET name='Republished Pump' WHERE id=?").bind(f.product).run();
  const next=await prepare(f);expect((await route(f))!.public_id).toBe(p.publication.id);
  const old=await env.DB.prepare("SELECT name FROM published_items WHERE publication_id=(SELECT id FROM catalogue_publications WHERE public_id=?) AND item_public_id=?").bind(p.publication.id,id("itm",f.product)).first<{name:string}>();
  expect(old!.name).toBe("Precision Pump");await activate(f,next);
  expect((await route(f))!.public_id).toBe(next.publication.id);expect(await revision(f)).toBeGreaterThan(sourceBefore);
  expect((await env.DB.prepare("SELECT state FROM catalogue_publications WHERE public_id=?").bind(p.publication.id).first<{state:string}>())!.state).toBe("retired");
  expect((await service().status(f.tenant,actor(f),ROOT)).hasChanges).toBe(false);
 });
 it("makes repeated and concurrent activation idempotent with a single audit event",async()=>{
  const f=await publicationFixture(),p=await prepare(f);
  const results=await Promise.all([activate(f,p),activate(f,p)]);expect(results.every(x=>x.publication.id===p.publication.id)).toBe(true);
  await activate(f,p);expect(await count(f,"publication.activated")).toBe(1);
 });
 it("supersedes earlier previews without replacing the live revision",async()=>{
  const f=await publicationFixture(),live=await prepare(f);await activate(f,live);
  const first=await prepare(f),second=await prepare(f);
  expect((await route(f))!.public_id).toBe(live.publication.id);
  expect((await env.DB.prepare("SELECT state,preview_revoked_at FROM catalogue_publications WHERE public_id=?").bind(first.publication.id).first())).toMatchObject({state:"failed"});
  expect((await request(f,"/activate","POST",{publicationId:first.publication.id,sourceRevision:first.sourceRevision})).status).toBe(409);
  await activate(f,second);
 });
 it("rolls back all candidate rows if snapshot insertion fails",async()=>{
  const f=await publicationFixture(),p=await prepare(f);await activate(f,p);
  await env.DB.exec("CREATE TRIGGER m7_test_snapshot_failure BEFORE INSERT ON published_items BEGIN SELECT RAISE(ABORT,'injected snapshot failure'); END;");
  try {
   const response=await request(f,"/prepare","POST",{sourceRevision:await revision(f)});
   expect(response.status).toBe(503);expect(await response.text()).not.toContain("injected");
   expect(await count(f)).toBe(1);expect(await count(f,"publication.prepared")).toBe(1);expect((await route(f))!.public_id).toBe(p.publication.id);
  } finally {await env.DB.exec("DROP TRIGGER m7_test_snapshot_failure;");}
 });
 it("rolls back retirement, activation, catalogue metadata and route when audit insertion fails",async()=>{
  const f=await publicationFixture(),live=await prepare(f);await activate(f,live);const next=await prepare(f);
  await env.DB.exec("CREATE TRIGGER m7_test_audit_failure BEFORE INSERT ON audit_events WHEN NEW.action='publication.activated' BEGIN SELECT RAISE(ABORT,'injected activation failure'); END;");
  try {
   const response=await request(f,"/activate","POST",{sourceRevision:next.sourceRevision,publicationId:next.publication.id});
   expect(response.status).toBe(503);expect((await route(f))!.public_id).toBe(live.publication.id);
   expect((await env.DB.prepare("SELECT state FROM catalogue_publications WHERE public_id=?").bind(next.publication.id).first<{state:string}>())!.state).toBe("building");
   expect((await env.DB.prepare("SELECT published_revision FROM catalogues WHERE id=?").bind(f.n).first<{published_revision:number}>())!.published_revision).toBe(live.publication.revision);
   expect(await count(f,"publication.activated")).toBe(1);
  } finally {await env.DB.exec("DROP TRIGGER m7_test_audit_failure;");}
 });
 it("discards idempotently without requiring a current publishing entitlement",async()=>{
  const f=await publicationFixture(),p=await prepare(f);await subscription(f,"canceled");
  expect((await request(f,"/"+p.publication.id,"DELETE")).status).toBe(204);
  expect((await request(f,"/"+p.publication.id,"DELETE")).status).toBe(204);
  expect(await count(f,"publication.discarded")).toBe(1);expect(await route(f)).toBeNull();
  const record=await new PublicationRepository(env.DB).find(f.tenant,p.publication.id);
  expect(record!.preview_revoked_at).not.toBeNull();
  await expect(env.DB.prepare("UPDATE catalogue_publications SET preview_revoked_at=NULL WHERE public_id=?").bind(p.publication.id).run()).rejects.toThrow();
 });
 it("unpublishes with an exact live revision, closes previews and retains source/history",async()=>{
  const f=await publicationFixture(),p=await prepare(f);await activate(f,p);const candidate=await prepare(f);
  expect((await request(f,"/unpublish","POST",{sourceRevision:await revision(f),publicationId:candidate.publication.id})).status).toBe(409);
  await subscription(f,"canceled");
  expect((await request(f,"/unpublish","POST",{sourceRevision:await revision(f),publicationId:p.publication.id})).status).toBe(204);
  expect(await route(f)).toBeNull();expect(await count(f)).toBe(2);
  expect((await env.DB.prepare("SELECT count(*) AS n FROM catalogue_items WHERE catalogue_id=?").bind(f.n).first<{n:number}>())!.n).toBe(5);
  expect((await env.DB.prepare("SELECT state FROM catalogue_publications WHERE public_id=?").bind(candidate.publication.id).first<{state:string}>())!.state).toBe("failed");
 });
 it("never resolves a foreign publication for activation or discard",async()=>{
  const f=await publicationFixture(),other=await publicationFixture(),p=await prepare(other);
  expect((await request(f,"/activate","POST",{sourceRevision:await revision(f),publicationId:p.publication.id})).status).toBe(404);
  expect((await request(f,"/"+p.publication.id,"DELETE")).status).toBe(404);
 });
 it("respects catalogue suspension and revokes private previews on organization suspension",async()=>{
  const f=await publicationFixture(),live=await prepare(f);await activate(f,live);const p=await prepare(f);
  await env.DB.prepare("UPDATE public_catalogue_routes SET status='suspended' WHERE slug=?").bind(f.slug).run();
  expect((await request(f,"/activate","POST",{sourceRevision:p.sourceRevision,publicationId:p.publication.id})).status).toBe(409);
  expect((await request(f,"/prepare","POST",{sourceRevision:await revision(f)})).status).toBe(409);
  await env.DB.prepare("UPDATE organizations SET status='suspended' WHERE id=?").bind(f.n).run();
  expect((await new PublicationRepository(env.DB).find(f.tenant,p.publication.id))!.preview_revoked_at).not.toBeNull();
 });
 it("protects referenced upload metadata from being deleted after source detachment",async()=>{
  const f=await publicationFixture();await prepare(f);
  await env.DB.prepare("DELETE FROM item_images WHERE item_id=?").bind(f.product).run();
  await env.DB.prepare("UPDATE catalogue_website_settings SET logo_asset_id=NULL,hero_asset_id=NULL WHERE catalogue_id=?").bind(f.n).run();
  await expect(env.DB.prepare("UPDATE assets SET status='deleted',deleted_at=? WHERE id=?").bind(new Date().toISOString(),f.product).run()).rejects.toThrow("asset_in_use");
 });
 it("rejects unsafe origins, malformed identifiers, unknown fields and oversized JSON",async()=>{
  const f=await publicationFixture(),sourceRevision=await revision(f);
  expect((await request(f,"/prepare","POST",{sourceRevision},{headers:{Origin:"https://evil.example"}})).status).toBe(403);
  for(const body of [{sourceRevision:0},{sourceRevision:1.2},{sourceRevision,role:"owner"},{sourceRevision:"1"}])expect((await request(f,"/prepare","POST",body)).status).toBe(400);
  expect((await request(f,"/activate","POST",{sourceRevision,publicationId:"pub_invalid"})).status).toBe(400);
  expect((await request(f,"/prepare","POST",{sourceRevision,extra:"x".repeat(3000)})).status).toBe(413);
  const response=await app.fetch(new Request(ROOT+"/api/v1/catalogue/publications/prepare",{method:"POST",headers:{cookie:await f.session(),[TENANT_HEADER]:id("org",f.n),Origin:ROOT,"Content-Type":"application/json"},body:"{"}),{...env,...previewConfig});
  expect(response.status).toBe(400);expect(await count(f)).toBe(0);
 });

 it("rejects activation after expiry without changing the live revision",async()=>{
  const f=await publicationFixture(),live=await prepare(f);await activate(f,live);const p=await prepare(f);
  const expired=new Date(Date.parse(p.expiresAt)+1);
  await expect(service().activate(f.tenant,actor(f),p.publication.id,p.sourceRevision,ROOT,expired)).rejects.toMatchObject({status:409,code:"publication_preview_expired"});
  expect((await route(f))!.public_id).toBe(live.publication.id);
 });
 it("verifies the checksum even when R2 size, type and ETag still match",async()=>{
  const f=await publicationFixture();
  await env.DB.prepare("UPDATE assets SET checksum_sha256=? WHERE id=?").bind("0".repeat(64),f.product).run();
  expect((await request(f,"/prepare","POST",{sourceRevision:await revision(f)})).status).toBe(409);
  expect(await count(f)).toBe(0);
 });
 it("leaves exactly one shareable candidate after concurrent preparation",async()=>{
  const f=await publicationFixture(),sourceRevision=await revision(f);
  const results=await Promise.allSettled([service().prepare(f.tenant,actor(f),sourceRevision,ROOT),service().prepare(f.tenant,actor(f),sourceRevision,ROOT)]);
  expect(results.some(r=>r.status==="fulfilled")).toBe(true);
  const candidates=(await env.DB.prepare("SELECT public_id FROM catalogue_publications WHERE catalogue_id=? AND state='building' AND sealed_at IS NOT NULL AND preview_revoked_at IS NULL").bind(f.n).all<{public_id:string}>()).results;
  expect(candidates).toHaveLength(1);expect(await route(f)).toBeNull();
  const history=await new PublicationRepository(env.DB).history(f.tenant);
  expect(history[0].public_id).toBe(candidates[0].public_id);
 });
 it("reports the active revision even when it falls outside the recent history window",async()=>{
  const f=await publicationFixture(),live=await prepare(f);await activate(f,live);
  const timestamp=new Date().toISOString();
  await env.DB.batch(Array.from({length:21},(_,index)=>env.DB.prepare("INSERT INTO catalogue_publications (public_id,catalogue_id,catalogue_public_id,revision_number,state,source_catalogue_version,created_at,failed_at) VALUES (?,?,?,?,'failed',1,?,?)").bind(id("pub",f.n*100+index),f.n,id("cat",f.n),index+2,timestamp,timestamp)));
  const status=await service().status(f.tenant,actor(f),ROOT);
  expect(status.history).toHaveLength(20);expect(status.active!.id).toBe(live.publication.id);expect(status.hasChanges).toBe(false);
 });

 it("retains completed setup and workspace access after publishing and unpublishing",async()=>{
  const f=await publicationFixture(),p=await prepare(f);await activate(f,p);
  const response=await app.fetch(new Request(ROOT+"/api/v1/onboarding/state",{headers:{cookie:await f.session(),[TENANT_HEADER]:id("org",f.n)}}),{...env,...previewConfig});
  expect(response.status).toBe(200);
  expect((await response.json<{data:{progress:Record<string,boolean>}}>()).data.progress).toMatchObject({setupComplete:true,readyToPublish:false});
  await service().unpublish(f.tenant,actor(f),await revision(f),p.publication.id);
  const after=await app.fetch(new Request(ROOT+"/api/v1/onboarding/state",{headers:{cookie:await f.session(),[TENANT_HEADER]:id("org",f.n)}}),{...env,...previewConfig});
  expect((await after.json<{data:{progress:Record<string,boolean>}}>()).data.progress).toMatchObject({setupComplete:true,readyToPublish:true});
 });

 it("keeps a published workspace accessible after every source item is removed",async()=>{
  const f=await publicationFixture(),p=await prepare(f);await activate(f,p);
  await env.DB.prepare("UPDATE catalogue_items SET deleted_at=? WHERE catalogue_id=?").bind(new Date().toISOString(),f.n).run();
  const response=await app.fetch(new Request(ROOT+"/api/v1/onboarding/state",{headers:{cookie:await f.session(),[TENANT_HEADER]:id("org",f.n)}}),{...env,...previewConfig});
  expect(response.status).toBe(200);
  expect((await response.json<{data:{progress:Record<string,boolean>}}>()).data.progress).toMatchObject({firstItemComplete:false,setupComplete:true,readyToPublish:false});
  expect((await route(f))!.public_id).toBe(p.publication.id);
 });
});
