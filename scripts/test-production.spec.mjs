import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ROOT, ZERO_ID, readPlan, validateConfig, validateResources, validateArtifact, validateManifest, inventory, migrationInventory, dryRunArguments, validateAction } from "./production.mjs";
const plan = readPlan();
const id = "11111111-1111-4111-8111-111111111111";
function config(role) {
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/catalogue-" + role + "/wrangler.jsonc"), "utf8"));
  const value = { ...source, ...source.env.production }; delete value.env; return value;
}
function resources() {
  return { accountId: plan.accountId, database: { name: plan.databaseName, id }, bucket: { name: plan.bucketName, publicAccess: false } };
}
test("resource plan separates M17 from routing and remote execution", () => {
  assert.deepEqual(plan.routing.configuredRoutes, []);
  assert.equal(plan.routing.milestone, "M18");
  assert.equal(plan.release.remoteMutations, false);
  assert.equal(plan.release.deployable, false);
});
test("isolated private production resources can be checked offline", () => validateResources(resources()));
for (const [name, alter] of [
  ["Billing ID", value => value.database.id = plan.protected.databaseId],
  ["Billing ID case variant", value => value.database.id = plan.protected.databaseId.toUpperCase()],
  ["placeholder ID", value => value.database.id = ZERO_ID],
  ["malformed ID", value => value.database.id = "not-a-database"],
  ["foreign account", value => value.accountId = "foreign"],
  ["staging database name", value => value.database.name = "techabanca-catalogue-staging"],
  ["Billing database", value => value.database.name = plan.protected.databaseName],
  ["staging bucket", value => value.bucket.name = "techabanca-catalogue-staging-assets"],
  ["Billing bucket", value => value.bucket.name = plan.protected.bucketName],
  ["public bucket", value => value.bucket.publicAccess = true],
  ["extra resource", value => value.worker = "billdesk"],
]) test("resource guard refuses " + name, () => {
  const value = resources(); alter(value); assert.throws(() => validateResources(value));
});
test("production cannot reuse a recorded staging database ID", () => {
  assert.throws(() => validateResources(resources(), { stagingDatabaseId: id.toUpperCase() }), /isolated/);
});
for (const role of ["app", "public"]) {
  test(role + " explicitly selects safe production settings", () => validateConfig(config(role), role));
  for (const [name, alter] of [
    ["staging Worker", value => value.name += "-staging"],
    ["foreign account", value => value.account_id = "foreign"],
    ["workers.dev exposure", value => value.workers_dev = true],
    ["version preview exposure", value => value.preview_urls = true],
    ["early wildcard route", value => value.routes = [{ pattern: "*.techabanca.com/*", zone_name: "techabanca.com" }]],
    ["single route bypass", value => value.route = "billing.techabanca.com/*"],
    ["local access", value => value.vars.LOCAL_PREVIEW = "true"],
    ["staging deployment", value => value.vars.DEPLOYMENT_ENVIRONMENT = "staging"],
    ["real DB in offline artifact", value => value.d1_databases[0].database_id = id],
    ["remote DB option", value => value.d1_databases[0].remote = true],
    ["extra DB", value => value.d1_databases.push({ ...value.d1_databases[0] })],
    ["public R2 option", value => value.r2_buckets[0].preview_bucket_name = "billdesk-files"],
    ["service binding", value => value.services = [{ binding: "OTHER", service: "billdesk" }]],
    ["unknown binding", value => value.browser = { binding: "OTHER" }],
    ["unsafe binding", value => value.unsafe = { bindings: [{ name: "OTHER", type: "secret_text", text: "private" }] }],
    ["external email binding", value => value.send_email = [{ name: "EMAIL" }]],
    ["external analytics", value => value.analytics_engine_datasets = [{ binding: "OTHER", dataset: "other" }]],
    ["unexpected cron", value => value.triggers = { crons: ["* * * * *"] }],
  ]) test(role + " refuses " + name, () => {
    const value = config(role); alter(value); assert.throws(() => validateConfig(value, role));
  });
}
test("plain secret variables are rejected without disclosing the value", () => {
  const value = config("app"); value.vars.PUBLICATION_PREVIEW_SECRET = "PRIVATE_VALUE";
  try { validateConfig(value, "app"); assert.fail("expected refusal"); }
  catch (error) { assert.match(error.message, /Unsafe production variables/); assert(!error.message.includes("PRIVATE_VALUE")); }
});
test("management cannot bypass entitlements or Worker-first routing", () => {
  const value = config("app"); value.vars.ALLOW_UNSUBSCRIBED_PUBLISHING = "true";
  assert.throws(() => validateConfig(value, "app"));
  const assets = config("app"); assets.assets.run_worker_first = false;
  assert.throws(() => validateConfig(assets, "app"));
});
test("Public Worker cannot acquire SPA assets", () => {
  const value = config("public"); value.assets = config("app").assets;
  assert.throws(() => validateConfig(value, "public"));
});
function fixture(role = "app") {
  const out = path.join(ROOT, ".wrangler/production/test-" + randomUUID());
  const worker = path.join(out, "worker"), client = path.join(out, "client");
  fs.mkdirSync(worker, { recursive: true }); fs.mkdirSync(client);
  const value = config(role); value.main = "index.js";
  value.d1_databases[0].migrations_dir = path.join(ROOT, "database/migrations");
  if (value.assets) value.assets.directory = "../client";
  fs.writeFileSync(path.join(worker, "wrangler.json"), JSON.stringify(value));
  fs.writeFileSync(path.join(worker, "index.js"), "export default {};");
  fs.writeFileSync(path.join(client, "index.html"), "<p>fixture</p>");
  const relative = file => path.relative(ROOT, file).replaceAll("\\", "/");
  const artifact = { configFile: relative(path.join(worker, "wrangler.json")), files: inventory(out).map(file => ({
    file: relative(file), sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  })) };
  return { out, worker, client, artifact, clean: () => fs.rmSync(out, { recursive: true, force: true }) };
}
test("complete unchanged artifact inventory is accepted", () => {
  const f = fixture(); try { validateArtifact(f.artifact, "app", f.out); } finally { f.clean(); }
});
for (const [name, change] of [
  ["changed bytes", f => fs.appendFileSync(path.join(f.worker, "index.js"), "changed")],
  ["unrecorded file", f => fs.writeFileSync(path.join(f.client, "extra.js"), "unrecorded")],
  ["removed file", f => fs.unlinkSync(path.join(f.client, "index.html"))],
  ["duplicate file", f => f.artifact.files.push(f.artifact.files[0])],
  ["traversal path", f => f.artifact.configFile = "apps/catalogue-app/dist-production/../../wrangler.jsonc"],
  ["absolute path", f => f.artifact.configFile = path.join(f.worker, "wrangler.json")],
  ["Windows path", f => f.artifact.configFile = "C:\\outside\\wrangler.json"],
  ["noncanonical path", f => f.artifact.configFile = f.artifact.configFile.replace("/worker/", "/worker/../worker/")],
  ["invalid digest", f => f.artifact.files[0].sha256 = "invalid"],
  ["copied secret", f => {
    const file = path.join(f.worker, ".dev.vars"); fs.writeFileSync(file, "SECRET=private");
    f.artifact.files.push({ file: path.relative(ROOT, file).replaceAll("\\", "/"), sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex") });
  }],
]) test("artifact guard refuses " + name, () => {
  const f = fixture(); try { change(f); assert.throws(() => validateArtifact(f.artifact, "app", f.out)); } finally { f.clean(); }
});
test("artifact directory symlinks are refused", () => {
  const f = fixture(), link = path.join(f.out, "linked");
  try { fs.symlinkSync(f.client, link, process.platform === "win32" ? "junction" : "dir"); assert.throws(() => inventory(f.out), /Symlink/); }
  finally { if (fs.existsSync(link)) fs.unlinkSync(link); f.clean(); }
});
function reseal(f, alter) {
  const file = path.join(f.worker, "wrangler.json"), value = JSON.parse(fs.readFileSync(file, "utf8"));
  alter(value); fs.writeFileSync(file, JSON.stringify(value));
  f.artifact.files.find(entry => path.basename(entry.file) === "wrangler.json").sha256 = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
for (const [name, alter] of [
  ["entry outside output", value => value.main = "../../../outside.js"],
  ["missing Worker entry", value => value.main = "missing.js"],
  ["assets outside output", value => value.assets.directory = "../../../outside"],
  ["wrong migration folder", value => value.d1_databases[0].migrations_dir = "other/migrations"],
]) test("resealing cannot conceal " + name, () => {
  const f = fixture(); try { reseal(f, alter); assert.throws(() => validateArtifact(f.artifact, "app", f.out)); } finally { f.clean(); }
});
const hash = "a".repeat(64);
function manifest() { return { version: 1, environment: "production", deployable: false, remoteMutations: false, sourceHash: hash, verifiedSourceHash: hash, migrations: migrationInventory(), artifacts: {} }; }
for (const [name, alter] of [
  ["staging manifest", value => value.environment = "staging"],
  ["deployment approval", value => value.deployable = true],
  ["remote mutations", value => value.remoteMutations = true],
  ["stale source", value => value.sourceHash = "b".repeat(64)],
  ["unverified source", value => value.verifiedSourceHash = null],
  ["migration tampering", value => value.migrations[0].sha256 = "c".repeat(64)],
]) test("manifest refuses " + name, () => {
  const value = manifest(); alter(value); assert.throws(() => validateManifest(value, hash));
});
test("migration inventory includes all ordered SQL files with content digests", () => {
  const migrations = migrationInventory();
  assert(migrations.length >= 25);
  assert.deepEqual(migrations.map(value => value.file), [...migrations.map(value => value.file)].sort());
  assert(migrations.every(value => /^[0-9a-f]{64}$/.test(value.sha256)));
});
test("Wrangler preparation arguments always specify dry-run and explicit config", () => {
  assert.deepEqual(dryRunArguments("config.json", "out"), ["deploy", "--dry-run", "--config", "config.json", "--outdir", "out"]);
});
for (const action of ["provision", "deploy", "smoke", "migrate", "destroy"])
  test("CLI refuses remote action " + action + " before side effects", () => {
    const result = spawnSync(process.execPath, ["scripts/production.mjs", action], { cwd: ROOT, encoding: "utf8" });
    assert.equal(result.status, 1); assert.match(result.stderr, /Remote actions are unavailable/); assert.equal(result.stdout, "");
  });
test("CLI does not accept flags that change a dry-run into a deploy", () => {
  assert.throws(() => validateAction("build", ["--remote"]));
  assert.throws(() => validateAction("build", ["--dry-run=false"]));
  for (const action of ["plan", "build", "verify", "check"]) assert.equal(validateAction(action), action);
});
