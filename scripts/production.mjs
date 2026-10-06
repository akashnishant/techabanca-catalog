import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
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
  assert.deepEqual(plan.routing, { milestone: "M18", managementHost: "catalogue.techabanca.com", publicSuffix: "techabanca.com", configuredRoutes: [{ pattern: "catalogue.techabanca.com", custom_domain: true }], publicRoutes: [{ pattern: "example-industries.techabanca.com", custom_domain: true }] });
  assert.deepEqual(plan.retention, { days: 365, cron: "0 3 * * *", worker: plan.workers.app });
  assert.deepEqual(plan.security, { app: ["ASSET_UPLOAD_SIGNING_SECRET", "AUTH_RATE_LIMIT_SECRET", "PUBLICATION_PREVIEW_SECRET", "TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY"], public: ["PUBLICATION_PREVIEW_SECRET"], publicBucketAccess: false });
  assert.equal(plan.release.remoteMutations, true);
  assert.equal(plan.release.deployable, true);
  assert.equal(plan.release.workflow, "local-tests-production-pilot");
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
export function validateConfig(config, role, resources = null) {
  assert(ROLES.includes(role), "Unknown Worker role");
  const plan = readPlan();
  for (const key of Object.keys(config)) assert(CONFIG_KEYS.has(key), "Unexpected configuration field: " + key);
  assert.equal(config.name, plan.workers[role], "Wrong production Worker");
  assert.equal(config.account_id, plan.accountId, "Wrong production account");
  assert.equal(config.workers_dev, false, "workers.dev must be disabled");
  assert.equal(config.preview_urls, false, "Version previews must be disabled");
  assert.deepEqual(config.routes, role === "app" ? plan.routing.configuredRoutes : plan.routing.publicRoutes, "Only the approved management and pilot business custom domains are allowed");
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
  if (resources) {
    validateResources(resources);
    assert.equal(db.database_id, resources.database.id, "Production database differs from recorded resources");
  } else assert.equal(db.database_id, ZERO_ID, "Offline build must retain its placeholder");
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
export function validateManifest(manifest, hash = sourceHash(), resources = resourceState()) {
  assert.equal(manifest.version, 2);
  assert.equal(manifest.environment, "production");
  assert.equal(manifest.deployable, !!resources, "Resource readiness changed since build");
  assert.deepEqual(manifest.resources, resources, "Production resource evidence changed");
  assert.equal(manifest.remoteMutations, false);
  assert.equal(manifest.sourceHash, hash, "Source changed since production build");
  assert.equal(manifest.verifiedSourceHash, hash, "Run production verification");
  assert.deepEqual(manifest.migrations, migrationInventory(), "Migration inventory changed");
  keys(manifest.artifacts, ROLES, "Unexpected release roles");
  for (const role of ROLES) validateArtifact(manifest.artifacts[role], role, undefined, resources);
  const performance = checkBudgets(measureBuild(path.join(ROOT, "apps/catalogue-app/dist-production/client")));
  assert.deepEqual(manifest.performance, performance, "Performance evidence changed");
  return manifest;
}
export function validateArtifact(artifact, role, out = path.join(ROOT, "apps/catalogue-" + role + "/dist-production"), resources = null) {
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
  const config = validateConfig(JSON.parse(fs.readFileSync(configFile, "utf8")), role, resources);
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
  const before = sourceHash(), resources = resourceState();
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
    if (resources) config.d1_databases[0].database_id = resources.database.id;
    validateConfig(config, role, resources);
    assertRuntimePaths(config, file, out);
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
    runNode(path.join(ROOT, "node_modules/wrangler/bin/wrangler.js"), dryRunArguments(file, path.join(STATE, "dry-run", role)));
    artifacts[role] = { configFile: relative(file), files: inventory(out).map(file => ({ file: relative(file), sha256: digest(file) })) };
  }
  const performance = checkBudgets(measureBuild(path.join(ROOT, "apps/catalogue-app/dist-production/client")));
  assert.equal(sourceHash(), before, "Source changed during production build");
  const manifest = { version: 2, environment: "production", sourceHash: before,
    verifiedSourceHash: verified ? before : null, deployable: !!resources, resources, remoteMutations: false,
    createdAt: new Date().toISOString(), migrations: migrationInventory(), performance, artifacts };
  if (verified) validateManifest(manifest, before, resources);
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(path.join(STATE, "build-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("PRODUCTION_PREPARATION_PASSED " + JSON.stringify({ verified, deployable: !!resources, remoteMutations: false, sourceHash: before, migrations: manifest.migrations.length, performance }));
  return manifest;
}
export function validateAction(action, extra = []) {
  assert(["plan", "build", "verify", "check", "provision", "bootstrap", "deploy", "smoke", "configure-security"].includes(action) && extra.length === 0,
    "Use a documented production action without extra flags. Arbitrary remote actions are unavailable.");
  return action;
}
export async function main(action = "plan", extra = []) {
  validateAction(action, extra); readPlan();
  if (action === "provision") { provision(); return; }
  if (action === "bootstrap" || action === "deploy") { await deploy({ bootstrap: action === "bootstrap" }); return; }
  if (action === "smoke") { await smoke(); return; }
  if (action === "configure-security") { configureSecurity(); return; }
  if (action === "plan") { ROLES.forEach(sourceConfig); console.log(JSON.stringify(readPlan(), null, 2)); return; }
  if (action === "build") { await build(); return; }
  if (action === "check") {
    validateManifest(JSON.parse(fs.readFileSync(path.join(STATE, "build-manifest.json"), "utf8")));
    console.log("Verified production artifacts are unchanged. Hosted authentication requires real Turnstile bindings."); return;
  }
  const before = sourceHash();
  npm(["run", "verify"], { env: { CLOUDFLARE_ENV: "" }, timeout: 900000 });
  assert.equal(sourceHash(), before, "Source changed during verification");
  await build({ verified: true });
}


function writeState(name, value) {
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(path.join(STATE, name), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
}
export function resourceState(required = false) {
  const file = path.join(STATE, "resources.json");
  if (!fs.existsSync(file)) {
    assert(!required, "Provision the isolated production resources first");
    return null;
  }
  const stagingFile = path.join(ROOT, ".wrangler/staging/resources.json");
  const stagingDatabaseId = fs.existsSync(stagingFile)
    ? JSON.parse(fs.readFileSync(stagingFile, "utf8")).database?.id : undefined;
  return validateResources(JSON.parse(fs.readFileSync(file, "utf8")), { stagingDatabaseId });
}
function remote(args, { capture = false } = {}) {
  const result = spawnSync(process.execPath, [path.join(ROOT, "node_modules/wrangler/bin/wrangler.js"), ...args], {
    cwd: ROOT, encoding: "utf8", stdio: capture ? "pipe" : "inherit", timeout: 300000,
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false", CLOUDFLARE_ACCOUNT_ID: ACCOUNT }
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "Cloudflare operation failed: " + args.slice(0, 3).join(" "));
  return result.stdout ?? "";
}
const databases = () => JSON.parse(remote(["d1", "list", "--json"], { capture: true }));
const bucketNames = () => [...remote(["r2", "bucket", "list"], { capture: true }).matchAll(/^name:\s+(\S+)/gm)].map(match => match[1]);
export function validateBucketPrivacy(devUrlOutput, domainOutput) {
  assert(/Public access via the r2\.dev URL is disabled\./.test(devUrlOutput), "Production r2.dev access must be disabled");
  assert(/There are no custom domains connected to this bucket\./.test(domainOutput), "Production storage must have no public custom domains");
}
function assertRemoteResources(resources) {
  validateResources(resources);
  const matches = databases().filter(db => db.name === resources.database.name);
  assert(matches.length === 1 && matches[0].uuid === resources.database.id, "Production database ownership does not match");
  assert(bucketNames().includes(resources.bucket.name), "Production storage bucket is missing");
  validateBucketPrivacy(
    remote(["r2", "bucket", "dev-url", "get", resources.bucket.name], { capture: true }),
    remote(["r2", "bucket", "domain", "list", resources.bucket.name], { capture: true })
  );
}
export function provision() {
  const plan = readPlan(), recorded = resourceState();
  if (recorded) { assertRemoteResources(recorded); console.log("Recorded production resources and storage privacy verified."); return recorded; }
  let db = databases().find(value => value.name === plan.databaseName);
  assert(!db, "An unrecorded production database already exists; inspect ownership before adopting it");
  assert(!bucketNames().includes(plan.bucketName), "An unrecorded production bucket already exists; inspect ownership before adopting it");
  remote(["d1", "create", plan.databaseName, "--update-config=false"]);
  db = databases().find(value => value.name === plan.databaseName);
  assert(db, "Production database creation did not complete");
  remote(["r2", "bucket", "create", plan.bucketName]);
  const resources = validateResources({ accountId: plan.accountId, database: { name: db.name, id: db.uuid },
    bucket: { name: plan.bucketName, publicAccess: false } });
  writeState("resources.json", resources);
  assertRemoteResources(resources);
  console.log("Isolated production resources are recorded and private.");
  return resources;
}
export function validateSecrets(value, { requireTurnstile = true } = {}) {
  keys(value, ["version", "app", "public"], "Unexpected security fields");
  assert.equal(value.version, 1);
  const hasSite = Object.hasOwn(value.app, "TURNSTILE_SITE_KEY"), hasSecret = Object.hasOwn(value.app, "TURNSTILE_SECRET_KEY");
  assert(hasSite === hasSecret, "Turnstile configuration is incomplete");
  keys(value.app, ["ASSET_UPLOAD_SIGNING_SECRET", "AUTH_RATE_LIMIT_SECRET", "PUBLICATION_PREVIEW_SECRET",
    ...(hasSite ? ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"] : [])], "Unexpected app security bindings");
  keys(value.public, ["PUBLICATION_PREVIEW_SECRET"], "Unexpected public security bindings");
  const signing = ["ASSET_UPLOAD_SIGNING_SECRET", "AUTH_RATE_LIMIT_SECRET", "PUBLICATION_PREVIEW_SECRET"].map(key => value.app[key]);
  assert(signing.every(secret => /^[a-f0-9]{64}$/i.test(secret ?? "")), "Invalid production signing configuration");
  assert(new Set(signing.map(secret => secret.toLowerCase())).size === 3, "Production signing keys must be distinct");
  assert(value.public.PUBLICATION_PREVIEW_SECRET === value.app.PUBLICATION_PREVIEW_SECRET, "Preview signing keys differ");
  if (hasSite) {
    assert(/^0x[a-zA-Z0-9_-]{20,100}$/.test(value.app.TURNSTILE_SITE_KEY ?? ""), "Invalid production Turnstile site key");
    assert(typeof value.app.TURNSTILE_SECRET_KEY === "string" && value.app.TURNSTILE_SECRET_KEY.length >= 20
      && value.app.TURNSTILE_SECRET_KEY.length <= 200 && !/\s/.test(value.app.TURNSTILE_SECRET_KEY), "Invalid production Turnstile secret");
  }
  assert(!requireTurnstile || hasSite, "Configure the dedicated production Turnstile widget before activating authentication");
  return value;
}
function productionSecrets({ requireTurnstile = true } = {}) {
  const file = path.join(STATE, "security.json"), ignored = relative(file);
  assert.equal(git(["check-ignore", ignored]).trim(), ignored, "Production security file must be ignored by Git");
  if (!fs.existsSync(file)) {
    assert(!fs.existsSync(path.join(STATE, "deployment.json")), "Production security file is missing after deployment; do not regenerate signing keys");
    const preview = randomBytes(32).toString("hex");
    const value = { version: 1, app: { ASSET_UPLOAD_SIGNING_SECRET: randomBytes(32).toString("hex"),
      AUTH_RATE_LIMIT_SECRET: randomBytes(32).toString("hex"), PUBLICATION_PREVIEW_SECRET: preview },
      public: { PUBLICATION_PREVIEW_SECRET: preview } };
    writeState("security.json", value);
  }
  return validateSecrets(JSON.parse(fs.readFileSync(file, "utf8")), { requireTurnstile });
}
function configureSecurity() {
  const values = JSON.parse(fs.readFileSync(0, "utf8"));
  keys(values, ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"], "Unexpected Turnstile input");
  const security = productionSecrets({ requireTurnstile: false });
  security.app = { ...security.app, ...values };
  validateSecrets(security);
  writeState("security.json", security);
  console.log("Dedicated production Turnstile bindings saved securely. Redeploy to activate them.");
}

export function validateActivation(security, bootstrap) {
  validateSecrets(security, { requireTurnstile: !bootstrap });
  if (bootstrap) assert(!Object.hasOwn(security.app, "TURNSTILE_SITE_KEY"),
    "Authentication is configured; use deploy rather than a closed bootstrap");
  return bootstrap ? "pending-turnstile" : "configured";
}
export function deploymentArguments(configFile, secretsFile) {
  return ["deploy", "--config", configFile, "--secrets-file", secretsFile, "--strict"];
}
export async function deploy({ bootstrap = false } = {}) {
  const resources = resourceState(true);
  const manifest = validateManifest(JSON.parse(fs.readFileSync(path.join(STATE, "build-manifest.json"), "utf8")));
  assert(manifest.deployable, "Production resource bindings are not deployable");
  const security = productionSecrets({ requireTurnstile: !bootstrap });
  const authentication = validateActivation(security, bootstrap);
  const previousFile = path.join(STATE, "deployment.json");
  if (bootstrap && fs.existsSync(previousFile)) {
    const previous = JSON.parse(fs.readFileSync(previousFile, "utf8"));
    assert(previous.authentication === "pending-turnstile", "Bootstrap must never regress active authentication");
  }
  assertRemoteResources(resources);
  const configs = Object.fromEntries(ROLES.map(role => [role, path.join(ROOT, manifest.artifacts[role].configFile)]));
  for (const role of ROLES) validateConfig(JSON.parse(fs.readFileSync(configs[role], "utf8")), role, resources);
  remote(["d1", "migrations", "apply", resources.database.name, "--remote", "--config", configs.app]);
  for (const role of ["public", "app"]) {
    const file = path.join(STATE, "upload-secrets-" + role + ".json");
    assert(!fs.existsSync(file), "A temporary secrets upload file already exists; inspect before continuing");
    fs.writeFileSync(file, JSON.stringify(security[role]), { flag: "wx", mode: 0o600 });
    try { remote(deploymentArguments(configs[role], file)); }
    finally { fs.unlinkSync(file); }
  }
  writeState("deployment.json", { sourceHash: manifest.sourceHash, deployedAt: new Date().toISOString(),
    resources, authentication, managementUrl: "https://" + readPlan().routing.managementHost,
    publicRouting: "pending", smoke: "pending" });
  console.log("PRODUCTION_DEPLOYED " + JSON.stringify({ authentication, managementUrl: "https://" + readPlan().routing.managementHost,
    publicRouting: "pending", sourceHash: manifest.sourceHash }));
}
export async function smoke() {
  const plan = readPlan(), security = productionSecrets({ requireTurnstile: false });
  const configured = Object.hasOwn(security.app, "TURNSTILE_SITE_KEY"), origin = "https://" + plan.routing.managementHost;
  const checks = [];
  const request = async (pathname, status) => {
    const response = await fetch(origin + pathname, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, status, "Unexpected HTTP status for " + pathname);
    assert.equal(response.headers.get("x-techabanca-environment"), "production", "Wrong hosted environment");
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
    checks.push({ pathname, status: response.status });
    return response;
  };
  const home = await request("/", 200);
  assert.match(await home.text(), /Techabanca/i);
  assert.match(home.headers.get("cache-control") ?? "", /no-store/);
  assert.match(home.headers.get("content-security-policy") ?? "", /default-src/);
  assert.equal((await (await request("/api/health", 200)).json()).service, "techabanca-catalogue-app");
  await request("/api/v1/auth/session", 401);
  const auth = await request("/api/v1/auth/security", configured ? 200 : 503);
  if (configured) {
    const body = await auth.json();
    assert(body.data?.enabled === true && body.data.siteKey === security.app.TURNSTILE_SITE_KEY, "Wrong hosted Turnstile configuration");
  }
  await request("/api/production-unknown", 404);
  assert.match(await (await request("/robots.txt", 200)).text(), /Disallow: \//);
  const state = { completedAt: new Date().toISOString(), origin, tls: "verified-by-fetch", checks,
    authentication: configured ? "configured" : "pending-turnstile", publicRouting: "pending" };
  writeState("smoke.json", state);
  const deploymentFile = path.join(STATE, "deployment.json");
  if (fs.existsSync(deploymentFile)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    deployment.smoke = "passed"; deployment.smokeCompletedAt = state.completedAt;
    writeState("deployment.json", deployment);
  }
  console.log("PRODUCTION_SMOKE_PASSED " + JSON.stringify(state));
  return state;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv[2] ?? "plan", process.argv.slice(3)).catch(error => { console.error(error.message); process.exitCode = 1; });
