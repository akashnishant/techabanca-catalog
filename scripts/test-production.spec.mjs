import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ROOT, ZERO_ID, readPlan, validateConfig, validateResources, validateArtifact, validateManifest, inventory, migrationInventory, dryRunArguments, validateAction, validateBucketPrivacy, validateSecrets, validateActivation, deploymentArguments } from "./production.mjs";
const plan = readPlan();
const id = "11111111-1111-4111-8111-111111111111";
function config(role) {
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/catalogue-" + role + "/wrangler.jsonc"), "utf8"));
  const value = { ...source, ...source.env.production }; delete value.env; return value;
}
function resources() {
  return { accountId: plan.accountId, database: { name: plan.databaseName, id }, bucket: { name: plan.bucketName, publicAccess: false } };
}
test("production-only release allows only the approved management custom domain", () => {
  assert.deepEqual(plan.routing.configuredRoutes, [{ pattern: "catalogue.techabanca.com", custom_domain: true }]);
  assert.equal(plan.release.workflow, "local-tests-production-pilot");
  assert.equal(plan.release.remoteMutations, true);
  assert.equal(plan.release.deployable, true);
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
function manifest() { return { version: 2, environment: "production", deployable: false, resources: null, remoteMutations: false, sourceHash: hash, verifiedSourceHash: hash, migrations: migrationInventory(), artifacts: {} }; }
for (const [name, alter] of [
  ["staging manifest", value => value.environment = "staging"],
  ["deployment approval", value => value.deployable = true],
  ["remote mutations", value => value.remoteMutations = true],
  ["stale source", value => value.sourceHash = "b".repeat(64)],
  ["unverified source", value => value.verifiedSourceHash = null],
  ["migration tampering", value => value.migrations[0].sha256 = "c".repeat(64)],
]) test("manifest refuses " + name, () => {
  const value = manifest(); alter(value); assert.throws(() => validateManifest(value, hash, null));
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
for (const action of ["migrate", "destroy"])
  test("CLI refuses remote action " + action + " before side effects", () => {
    const result = spawnSync(process.execPath, ["scripts/production.mjs", action], { cwd: ROOT, encoding: "utf8" });
    assert.equal(result.status, 1); assert.match(result.stderr, /Arbitrary remote actions are unavailable/); assert.equal(result.stdout, "");
  });
test("CLI does not accept flags that change a dry-run into a deploy", () => {
  assert.throws(() => validateAction("build", ["--remote"]));
  assert.throws(() => validateAction("build", ["--dry-run=false"]));
  for (const action of ["plan", "build", "verify", "check", "provision", "bootstrap", "deploy", "smoke", "configure-security"]) assert.equal(validateAction(action), action);
});

test("recorded production resources bind both verified configurations", () => {
  for (const role of ["app", "public"]) {
    const value = config(role); value.d1_databases[0].database_id = id;
    validateConfig(value, role, resources());
    value.d1_databases[0].database_id = "22222222-2222-4222-8222-222222222222";
    assert.throws(() => validateConfig(value, role, resources()), /recorded resources/);
  }
});
for (const host of ["billing.techabanca.com", "billing-api.techabanca.com", "www.techabanca.com", "techabanca.com", "CATALOGUE.techabanca.com"])
  test("management routing refuses " + host, () => {
    const value = config("app"); value.routes = [{ pattern: host, custom_domain: true }];
    assert.throws(() => validateConfig(value, "app"));
  });
test("storage privacy checks fail closed on enabled access or unknown output", () => {
  const disabled = "Public access via the r2.dev URL is disabled.", noDomains = "There are no custom domains connected to this bucket.";
  validateBucketPrivacy(disabled, noDomains);
  assert.throws(() => validateBucketPrivacy("Public access is enabled.", noDomains));
  assert.throws(() => validateBucketPrivacy(disabled, "domain: files.techabanca.com"));
  assert.throws(() => validateBucketPrivacy("", ""));
});
function secrets(configured = true) {
  const preview = "c".repeat(64);
  return { version: 1, app: { ASSET_UPLOAD_SIGNING_SECRET: "a".repeat(64), AUTH_RATE_LIMIT_SECRET: "b".repeat(64),
    PUBLICATION_PREVIEW_SECRET: preview, ...(configured ? { TURNSTILE_SITE_KEY: "0x" + "A".repeat(22), TURNSTILE_SECRET_KEY: "D".repeat(35) } : {}) },
    public: { PUBLICATION_PREVIEW_SECRET: preview } };
}
test("activation requires complete production-only authentication bindings", () => {
  validateSecrets(secrets());
  assert.equal(validateActivation(secrets(), false), "configured");
  assert.throws(() => validateActivation(secrets(false), false), /Turnstile/);
});
test("bootstrap is visibly closed and cannot regress a configured widget", () => {
  assert.equal(validateActivation(secrets(false), true), "pending-turnstile");
  assert.throws(() => validateActivation(secrets(), true), /use deploy/);
});
for (const [name, alter] of [
  ["partial widget", value => delete value.app.TURNSTILE_SECRET_KEY],
  ["test site key", value => value.app.TURNSTILE_SITE_KEY = "1x00000000000000000000AA"],
  ["malformed secret", value => value.app.TURNSTILE_SECRET_KEY = "invalid"],
  ["whitespace secret", value => value.app.TURNSTILE_SECRET_KEY = "x ".repeat(20)],
  ["wrong preview", value => value.public.PUBLICATION_PREVIEW_SECRET = "e".repeat(64)],
  ["reused signing key", value => value.app.AUTH_RATE_LIMIT_SECRET = value.app.ASSET_UPLOAD_SIGNING_SECRET],
  ["extra binding", value => value.app.BILLING_KEY = "private"],
]) test("security guard refuses " + name + " without printing credentials", () => {
  const value = secrets(); alter(value);
  assert.throws(() => validateSecrets(value), error => {
    for (const secret of Object.values(value.app).filter(value => typeof value === "string" && value.length >= 20))
      assert(!error.message.includes(secret), "Credentials must not appear in validation errors");
    return true;
  });
});
test("production uploads install secrets atomically and respect explicit config", () => {
  assert.deepEqual(deploymentArguments("config.json", "private.json"),
    ["deploy", "--config", "config.json", "--secrets-file", "private.json", "--strict"]);
});
