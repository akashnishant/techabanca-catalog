import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkBudgets, measureBuild } from "./performance.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE = path.join(ROOT, ".wrangler", "production");
export const ZERO_ID = "00000000-0000-0000-0000-000000000000";
const ACCOUNT = "00e59d5fe6cfdd53bdc0b8594b5dc8fa";
const BILLING_ID = "1bbac4e5-6c75-473d-a9d4-406f31b0abc4";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const ROLES = ["app", "public"];
const EMPTY_BINDINGS = {
  services: [], kv_namespaces: [], queues: { producers: [], consumers: [] },
  durable_objects: { bindings: [] }, workflows: [], migrations: [], exports: {},
  cloudchamber: {}, send_email: [], connect: [], vectorize: [], ai_search_namespaces: [],
  ai_search: [], agent_memory: [], hyperdrive: [], analytics_engine_datasets: [],
  dispatch_namespaces: [], mtls_certificates: [], pipelines: [], secrets_store_secrets: [],
  artifacts: [], unsafe_hello_world: [], flagship: [], worker_loaders: [], ratelimits: [],
  vpc_services: [], vpc_networks: [], logfwdr: { bindings: [] },
};
const CONFIG_KEYS = new Set([
  ...Object.keys(EMPTY_BINDINGS), "name", "main", "account_id", "compatibility_date",
  "compatibility_flags", "assets", "workers_dev", "preview_urls", "routes", "triggers",
  "vars", "d1_databases", "r2_buckets", "configPath", "userConfigPath", "topLevelName",
  "definedEnvironments", "targetEnvironment", "jsx_factory", "jsx_fragment", "rules",
  "python_modules", "dev", "no_bundle",
]);
const keys = (value, expected, message) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), message);

export function readPlan() {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "deployment/production-plan.json"), "utf8"));
  assert.equal(plan.accountId, ACCOUNT);
  assert.equal(plan.databaseName, "techabanca-catalogue-production");
  assert.equal(plan.bucketName, "techabanca-catalogue-production-assets");
  assert.deepEqual(plan.workers, { app: "techabanca-catalogue-app", public: "techabanca-catalogue-public" });
  assert.deepEqual(plan.routing, { milestone: "M18", managementHost: "catalogue.techabanca.com", publicSuffix: "techabanca.com", configuredRoutes: [] });
  assert.deepEqual(plan.retention, { days: 365, cron: "0 3 * * *", worker: plan.workers.app });
  assert.deepEqual(plan.security, { app: ["ASSET_UPLOAD_SIGNING_SECRET", "AUTH_RATE_LIMIT_SECRET", "PUBLICATION_PREVIEW_SECRET", "TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY"], public: ["PUBLICATION_PREVIEW_SECRET"], publicBucketAccess: false });
  assert.equal(plan.release.remoteMutations, false);
  assert.equal(plan.release.deployable, false);
  assert.equal(plan.protected.databaseId, BILLING_ID);
  return plan;
}
export function validateResources(value, { stagingDatabaseId } = {}) {
  const plan = readPlan();
  keys(value, ["accountId", "database", "bucket"], "Unexpected resource fields");
  keys(value.database, ["name", "id"], "Unexpected database fields");
  keys(value.bucket, ["name", "publicAccess"], "Unexpected bucket fields");
  assert.equal(value.accountId, plan.accountId, "Wrong production account");
  assert.equal(value.database.name, plan.databaseName, "Wrong production database");
  assert(UUID.test(value.database.id ?? "") && value.database.id.toLowerCase() !== ZERO_ID
    && value.database.id.toLowerCase() !== BILLING_ID
    && value.database.id.toLowerCase() !== stagingDatabaseId?.toLowerCase(), "Production database must be real and isolated");
  assert.equal(value.bucket.name, plan.bucketName, "Wrong production bucket");
  assert.equal(value.bucket.publicAccess, false, "Production assets must remain private");
  return value;
}
export function validateConfig(config, role) {
  assert(ROLES.includes(role), "Unknown Worker role");
  const plan = readPlan();
  for (const key of Object.keys(config)) assert(CONFIG_KEYS.has(key), "Unexpected configuration field: " + key);
  assert.equal(config.name, plan.workers[role], "Wrong production Worker");
  assert.equal(config.account_id, plan.accountId, "Wrong production account");
  assert.equal(config.workers_dev, false, "workers.dev must be disabled");
  assert.equal(config.preview_urls, false, "Version previews must be disabled");
  assert.deepEqual(config.routes, [], "Routing belongs to M18");
  const expectedVars = role === "app"
    ? { DEPLOYMENT_ENVIRONMENT: "production", LOCAL_PREVIEW: "false", ALLOW_UNSUBSCRIBED_PUBLISHING: "false" }
    : { DEPLOYMENT_ENVIRONMENT: "production", LOCAL_PREVIEW: "false" };
  assert(config.vars && Object.keys(config.vars).length === Object.keys(expectedVars).length
    && Object.entries(expectedVars).every(([key, value]) => config.vars[key] === value), "Unsafe production variables");
  assert.equal(config.d1_databases.length, 1, "Exactly one database is required");
  const db = config.d1_databases[0];
  keys(db, ["binding", "database_name", "database_id", "migrations_dir"], "Unexpected database options");
  assert.equal(db.binding, "DB");
  assert.equal(db.database_name, plan.databaseName, "Wrong production database");
  // Offline M17 outputs are always deliberately non-deployable.
  assert.equal(db.database_id, ZERO_ID, "Offline build must retain its placeholder");
  assert.deepEqual(config.r2_buckets, [{ binding: "ASSETS", bucket_name: plan.bucketName }], "Unsafe production storage");
  assert.deepEqual(config.triggers ?? {}, role === "app" ? { crons: [plan.retention.cron] } : {}, "Unsafe retention schedule");
  if (role === "app") {
    assert(config.assets);
    keys(config.assets, config.assets.directory === undefined
      ? ["binding", "run_worker_first", "not_found_handling"]
      : ["binding", "run_worker_first", "not_found_handling", "directory"], "Unexpected asset options");
    assert.equal(config.assets.binding, "STATIC_ASSETS");
    assert.equal(config.assets.run_worker_first, true);
    assert.equal(config.assets.not_found_handling, "single-page-application");
  } else assert.equal(config.assets, undefined, "Public Worker has no SPA assets");
  for (const [key, empty] of Object.entries(EMPTY_BINDINGS))
    if (config[key] !== undefined) assert.deepEqual(config[key], empty, "Unexpected external binding: " + key);
  if (config.targetEnvironment !== undefined) assert.equal(config.targetEnvironment, "production");
  return config;
}
function sourceConfig(role) {
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/catalogue-" + role + "/wrangler.jsonc"), "utf8"));
  assert(source.env.production, "Explicit production environment is required");
  for (const key of ["name", "workers_dev", "preview_urls", "routes", "vars", "d1_databases", "r2_buckets", "triggers"])
    assert(Object.hasOwn(source.env.production, key), "Production must explicitly specify " + key);
  const config = { ...source, ...source.env.production }; delete config.env;
  return validateConfig(config, role);
}
export function inventory(directory) {
  const root = path.resolve(directory);
  assert(!fs.lstatSync(root).isSymbolicLink(), "Symlink build directory");
  const visit = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name), stat = fs.lstatSync(file);
    assert(!stat.isSymbolicLink(), "Symlink in release artifacts");
    if (stat.isDirectory()) return visit(file);
    assert(stat.isFile(), "Unexpected artifact type");
    return [file];
  });
  return visit(root).sort();
}
const digest = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, "Git check failed"); return result.stdout;
}
export function sourceHash() {
  const names = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean).sort();
  const hash = createHash("sha256");
  for (const name of names) { hash.update(name + "\0"); hash.update(fs.readFileSync(path.join(ROOT, name))); hash.update("\0"); }
  return hash.digest("hex");
}
function inside(root, relative) {
  assert(typeof relative === "string" && relative && !path.isAbsolute(relative) && !/^[a-z]:|^\\\\/i.test(relative), "Invalid artifact path");
  assert(!relative.includes("\\") && !relative.split("/").some(part => part === "." || part === ".." || !part), "Noncanonical artifact path");
  const full = path.resolve(ROOT, relative), remaining = path.relative(root, full);
  assert(remaining && remaining !== ".." && !remaining.startsWith(".." + path.sep) && !path.isAbsolute(remaining), "Artifact escapes production output");
  return full;
}
function relative(file) { return path.relative(ROOT, file).replaceAll("\\", "/"); }
function assertRuntimePaths(config, configFile, out) {
  const resolve = value => {
    assert(typeof value === "string" && value && !path.isAbsolute(value), "Invalid runtime artifact path");
    const full = path.resolve(path.dirname(configFile), value);
    inside(out, relative(full));
    assert(fs.existsSync(full), "Missing runtime artifact");
    return full;
  };
  assert(fs.statSync(resolve(config.main)).isFile(), "Missing Worker entry");
  if (config.assets) assert(fs.statSync(resolve(config.assets.directory)).isDirectory(), "Missing SPA assets");
}
export function migrationInventory() {
  const folder = path.join(ROOT, "database/migrations");
  return fs.readdirSync(folder).filter(file => file.endsWith(".sql")).sort().map(file => ({ file: "database/migrations/" + file, sha256: digest(path.join(folder, file)) }));
}
export function validateManifest(manifest, hash = sourceHash()) {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.environment, "production");
  assert.equal(manifest.deployable, false, "M17 preparation cannot authorize deployment");
  assert.equal(manifest.remoteMutations, false);
  assert.equal(manifest.sourceHash, hash, "Source changed since production build");
  assert.equal(manifest.verifiedSourceHash, hash, "Run production verification");
  assert.deepEqual(manifest.migrations, migrationInventory(), "Migration inventory changed");
  keys(manifest.artifacts, ROLES, "Unexpected release roles");
  for (const role of ROLES) validateArtifact(manifest.artifacts[role], role);
  const performance = checkBudgets(measureBuild(path.join(ROOT, "apps/catalogue-app/dist-production/client")));
  assert.deepEqual(manifest.performance, performance, "Performance evidence changed");
  return manifest;
}
export function validateArtifact(artifact, role, out = path.join(ROOT, "apps/catalogue-" + role + "/dist-production")) {
  const configFile = inside(out, artifact.configFile);
  assert.equal(path.basename(configFile), "wrangler.json", "Wrong deployment configuration");
  const names = artifact.files.map(entry => entry.file);
  assert.equal(new Set(names).size, names.length, "Duplicate release artifact");
  assert.deepEqual([...names].sort(), inventory(out).map(relative).sort(), "Release inventory changed");
  assert(names.includes(artifact.configFile), "Unrecorded deployment configuration");
  assert.equal(artifact.files.filter(entry => path.basename(entry.file) === "wrangler.json").length, 1, "Ambiguous deployment configuration");
  for (const entry of artifact.files) {
    const file = inside(out, entry.file);
    assert(!/(?:^|\/)(?:\.dev\.vars|\.env)(?:\.|$)/.test(entry.file), "Local secrets in release");
    assert(SHA.test(entry.sha256), "Invalid artifact digest");
    assert.equal(digest(file), entry.sha256, "Release artifact changed");
  }
  const config = validateConfig(JSON.parse(fs.readFileSync(configFile, "utf8")), role);
  assert.equal(config.d1_databases[0].migrations_dir, path.join(ROOT, "database/migrations"));
  assertRuntimePaths(config, configFile, out);
  return artifact;
}

function runNode(script, args, { timeout = 300000, env = {} } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: ROOT, stdio: "inherit", timeout,
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false", CLOUDFLARE_ACCOUNT_ID: ACCOUNT, ...env } });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "Local verification command failed");
}
function npm(args, options) {
  const cli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  assert(fs.existsSync(cli), "npm CLI unavailable"); runNode(cli, args, options);
}
export function dryRunArguments(configFile, outdir) {
  return ["deploy", "--dry-run", "--config", configFile, "--outdir", outdir];
}
export async function build({ verified = false } = {}) {
  const before = sourceHash();
  ROLES.forEach(sourceConfig);
  npm(["run", "build"], { env: { CLOUDFLARE_ENV: "production" } });
  const artifacts = {};
  for (const role of ROLES) {
    const out = path.join(ROOT, "apps/catalogue-" + role + "/dist-production");
    for (const file of inventory(out).filter(file => /^(?:\.dev\.vars|\.env)(?:\.|$)/.test(path.basename(file)))) fs.unlinkSync(file);
    const configs = inventory(out).filter(file => path.basename(file) === "wrangler.json");
    assert.equal(configs.length, 1, "Expected one production configuration");
    const file = configs[0], config = JSON.parse(fs.readFileSync(file, "utf8"));
    config.d1_databases[0].migrations_dir = path.join(ROOT, "database/migrations");
    validateConfig(config, role);
    assertRuntimePaths(config, file, out);
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
    runNode(path.join(ROOT, "node_modules/wrangler/bin/wrangler.js"), dryRunArguments(file, path.join(STATE, "dry-run", role)));
    artifacts[role] = { configFile: relative(file), files: inventory(out).map(file => ({ file: relative(file), sha256: digest(file) })) };
  }
  const performance = checkBudgets(measureBuild(path.join(ROOT, "apps/catalogue-app/dist-production/client")));
  assert.equal(sourceHash(), before, "Source changed during production build");
  const manifest = { version: 1, environment: "production", sourceHash: before,
    verifiedSourceHash: verified ? before : null, deployable: false, remoteMutations: false,
    createdAt: new Date().toISOString(), migrations: migrationInventory(), performance, artifacts };
  if (verified) validateManifest(manifest, before);
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(path.join(STATE, "build-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("PRODUCTION_PREPARATION_PASSED " + JSON.stringify({ verified, deployable: false, remoteMutations: false, sourceHash: before, migrations: manifest.migrations.length, performance }));
  return manifest;
}
export function validateAction(action, extra = []) {
  assert(["plan", "build", "verify", "check"].includes(action) && extra.length === 0,
    "Use plan, build, verify or check. Remote actions are unavailable under the existing M8 approval block.");
  return action;
}
export async function main(action = "plan", extra = []) {
  validateAction(action, extra); readPlan();
  if (action === "plan") { ROLES.forEach(sourceConfig); console.log(JSON.stringify(readPlan(), null, 2)); return; }
  if (action === "build") { await build(); return; }
  if (action === "check") {
    validateManifest(JSON.parse(fs.readFileSync(path.join(STATE, "build-manifest.json"), "utf8")));
    console.log("Verified offline production artifacts are unchanged. Deployment remains blocked."); return;
  }
  const before = sourceHash();
  npm(["run", "staging:verify"], { env: { CLOUDFLARE_ENV: "" }, timeout: 900000 });
  assert.equal(sourceHash(), before, "Source changed during verification");
  await build({ verified: true });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv[2] ?? "plan", process.argv.slice(3)).catch(error => { console.error(error.message); process.exitCode = 1; });
