import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ROOT, ZERO_ID, readPlan, validateConfig, validateResources, validateManifest } from "./staging.mjs";
const plan = readPlan();
const databaseId = "11111111-1111-4111-8111-111111111111";
function config(role) {
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/catalogue-" + role + "/wrangler.jsonc"), "utf8"));
  const stage = { ...source, ...source.env.staging }; delete stage.env;
  stage.d1_databases[0].database_id = databaseId;
  return stage;
}
function resources() { return { accountId: plan.accountId, database: { name: plan.databaseName, id: databaseId }, bucket: { name: plan.bucketName } }; }
for (const role of ["app", "public"]) {
  test(role + " staging configuration uses the approved targets", () => validateConfig(config(role), role));
  test(role + " placeholder binding is refused for deployment", () => {
    const value = config(role); value.d1_databases[0].database_id = ZERO_ID;
    assert.throws(() => validateConfig(value, role), /Unsafe database/);
    validateConfig(value, role, { allowPlaceholder: true });
  });
  test(role + " production Worker name is refused", () => {
    const value = config(role); value.name = "techabanca-catalogue-" + role;
    assert.throws(() => validateConfig(value, role), /Wrong Worker/);
  });
  test(role + " extra secret in plain variables is refused", () => {
    const value = config(role); value.vars.PUBLICATION_PREVIEW_SECRET = "c".repeat(64);
    assert.throws(() => validateConfig(value, role), /Unexpected environment variables/);
  });
}
test("valid isolated resources are accepted", () => validateResources(resources()));
for (const [name, alter] of [
  ["Billing database ID", value => value.database.id = plan.protected.databaseId],
  ["placeholder database ID", value => value.database.id = ZERO_ID],
  ["foreign account", value => value.accountId = "a".repeat(32)],
  ["Billing database name", value => value.database.name = plan.protected.databaseName],
  ["Billing bucket", value => value.bucket.name = plan.protected.bucketName],
]) test("resource guard rejects " + name, () => { const value = resources(); alter(value); assert.throws(() => validateResources(value)); });
for (const [name, role, alter] of [
  ["workers.dev access", "app", value => value.workers_dev = true],
  ["version preview URLs", "public", value => value.preview_urls = true],
  ["local deployment environment", "public", value => value.vars.DEPLOYMENT_ENVIRONMENT = "local"],
  ["local hostname access", "public", value => value.vars.LOCAL_PREVIEW = "true"],
  ["unsubscribed publishing bypass", "app", value => value.vars.ALLOW_UNSUBSCRIBED_PUBLISHING = "true"],
  ["Billing storage binding", "public", value => value.r2_buckets[0].bucket_name = plan.protected.bucketName],
  ["Billing database binding", "app", value => value.d1_databases[0].database_id = plan.protected.databaseId],
  ["production wildcard", "public", value => value.routes[0].pattern = "*.techabanca.com/*"],
  ["Billing management host", "app", value => value.routes[0].pattern = "billing.techabanca.com"],
  ["asset-first API routing", "app", value => value.assets.run_worker_first = false],
  ["extra service binding", "app", value => value.services = [{ binding: "OTHER", service: "billdesk" }]],
]) test("release config rejects " + name, () => { const value = config(role); alter(value); assert.throws(() => validateConfig(value, role)); });
function artifactFixture() {
  const hash = "a".repeat(64), owned = [];
  const artifacts = {};
  for (const role of ["app", "public"]) {
    const folder = "apps/catalogue-" + role + "/dist-staging/_test-" + randomUUID();
    const full = path.join(ROOT, folder); fs.mkdirSync(full, { recursive: true }); owned.push(full);
    const file = folder + "/wrangler.json"; fs.writeFileSync(path.join(ROOT, file), "{}");
    artifacts[role] = { configFile: file, files: [{ file, sha256: createHash("sha256").update("{}").digest("hex") }] };
  }
  return { hash, manifest: { sourceHash: hash, verifiedSourceHash: hash, provisioned: true, artifacts },
    clean: () => owned.forEach(folder => fs.rmSync(folder, { recursive: true, force: true })) };
}
test("verified unchanged release artifacts pass", () => { const f = artifactFixture(); try { validateManifest(f.manifest, f.hash); } finally { f.clean(); } });
for (const [name, alter] of [
  ["changed source", value => value.sourceHash = "b".repeat(64)],
  ["unverified source", value => value.verifiedSourceHash = null],
  ["unprovisioned resource bindings", value => value.provisioned = false],
  ["path traversal", value => value.artifacts.app.configFile = "apps/catalogue-app/dist-staging/../../wrangler.jsonc"],
  ["absolute artifact path", value => value.artifacts.app.configFile = path.join(ROOT, value.artifacts.app.configFile)],
  ["unrecorded deployment config", value => value.artifacts.app.files = []],
]) test("release manifest rejects " + name, () => { const f = artifactFixture(); try { alter(f.manifest); assert.throws(() => validateManifest(f.manifest, f.hash)); } finally { f.clean(); } });
test("release manifest rejects a changed artifact", () => {
  const f = artifactFixture();
  try { fs.writeFileSync(path.join(ROOT, f.manifest.artifacts.public.configFile), '{"changed":true}'); assert.throws(() => validateManifest(f.manifest, f.hash), /artifact changed/); }
  finally { f.clean(); }
});

test("generated empty bindings are accepted", () => {
 const value = config("app"); Object.assign(value, { services: [], kv_namespaces: [], queues: { producers: [], consumers: [] }, durable_objects: { bindings: [] }, workflows: [], triggers: {} }); validateConfig(value, "app");
});
for (const [key, value] of [["queues", { producers: [{ binding: "OTHER", queue: "billdesk" }], consumers: [] }], ["durable_objects", { bindings: [{ name: "OTHER", class_name: "Billing" }] }], ["triggers", { crons: ["* * * * *"] }]]) test("generated config refuses active " + key, () => { const stage = config("app"); stage[key] = value; assert.throws(() => validateConfig(stage, "app")); });
