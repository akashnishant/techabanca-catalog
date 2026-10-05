import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE = path.join(ROOT, ".wrangler", "staging");
export const ZERO_ID = "00000000-0000-0000-0000-000000000000";
const ACCOUNT = "00e59d5fe6cfdd53bdc0b8594b5dc8fa";
const BILLING_DB = "1bbac4e5-6c75-473d-a9d4-406f31b0abc4";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readPlan() {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "deployment/staging-plan.json"), "utf8"));
  assert.equal(plan.accountId, ACCOUNT);
  assert.equal(plan.databaseName, "techabanca-catalogue-staging");
  assert.equal(plan.bucketName, "techabanca-catalogue-staging-assets");
  assert.equal(plan.managementHost, "catalogue-preview.techabanca.com");
  assert.equal(plan.publicRoute, "*.catalogue-preview.techabanca.com/*");
  assert.equal(plan.publicSuffix, "catalogue-preview.techabanca.com");
  assert.deepEqual(plan.tlsRequired, ["catalogue-preview.techabanca.com", "*.catalogue-preview.techabanca.com"]);
  assert.equal(plan.zone, "techabanca.com");
  assert.equal(plan.workers.app, "techabanca-catalogue-app-staging");
  assert.equal(plan.workers.public, "techabanca-catalogue-public-staging");
  assert.deepEqual(plan.enquiryRetention, { days: 365, worker: plan.workers.app, cron: "0 3 * * *" });
  return plan;
}
export function validateResources(resources, plan = readPlan()) {
  assert.equal(resources.accountId, plan.accountId, "Wrong Cloudflare account");
  assert.equal(resources.database.name, plan.databaseName, "Wrong database name");
  assert(UUID.test(resources.database.id) && resources.database.id !== ZERO_ID
    && resources.database.id !== BILLING_DB, "A real isolated staging database ID is required");
  assert.equal(resources.bucket.name, plan.bucketName, "Wrong bucket name");
  return resources;
}
export function validateConfig(config, role, { allowPlaceholder = false, plan = readPlan() } = {}) {
  assert(["app", "public"].includes(role));
  assert.equal(config.name, plan.workers[role], "Wrong Worker");
  assert.equal(config.account_id, plan.accountId, "Wrong account");
  assert.equal(config.workers_dev, false, "workers.dev must be disabled");
  assert.equal(config.preview_urls, false, "Version preview URLs must be disabled");
  assert.equal(config.vars.DEPLOYMENT_ENVIRONMENT, "staging");
  assert.equal(config.vars.LOCAL_PREVIEW, "false");
  assert.deepEqual(Object.keys(config.vars).sort(), (role === "app"
    ? ["ALLOW_UNSUBSCRIBED_PUBLISHING", "DEPLOYMENT_ENVIRONMENT", "LOCAL_PREVIEW"]
    : ["DEPLOYMENT_ENVIRONMENT", "LOCAL_PREVIEW"]).sort(), "Unexpected environment variables");
  if (role === "app") {
    assert.equal(config.vars.ALLOW_UNSUBSCRIBED_PUBLISHING, "false");
    assert.equal(config.assets.binding, "STATIC_ASSETS");
    assert.equal(config.assets.run_worker_first, true);
    assert.equal(config.assets.not_found_handling, "single-page-application");
  }
  assert.deepEqual(config.routes, role === "app"
    ? [{ pattern: plan.managementHost, custom_domain: true }]
    : [{ pattern: plan.publicRoute, zone_name: plan.zone }], "Unexpected route");
  assert.equal(config.d1_databases.length, 1);
  assert.equal(config.d1_databases[0].binding, "DB");
  assert.equal(config.d1_databases[0].database_name, plan.databaseName);
  const id = config.d1_databases[0].database_id;
  assert(UUID.test(id) && id !== BILLING_DB && (allowPlaceholder || id !== ZERO_ID), "Unsafe database binding");
  assert.deepEqual(config.r2_buckets, [{ binding: "ASSETS", bucket_name: plan.bucketName }], "Unsafe storage binding");
  const emptyBindings = { services: [], kv_namespaces: [], queues: { producers: [], consumers: [] },
    durable_objects: { bindings: [] }, workflows: [] };
  for (const [key, empty] of Object.entries(emptyBindings)) {
    if (config[key] !== undefined) assert.deepEqual(config[key], empty, "Unexpected external binding or trigger: " + key);
  }
  assert.deepEqual(config.triggers ?? {}, role === "app" ? { crons: ["0 3 * * *"] } : {}, "Unexpected retention schedule");
  return config;
}
function runNode(script, args, options = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT, encoding: "utf8", timeout: 300000,
    env: { ...process.env, CI: "true", CLOUDFLARE_ACCOUNT_ID: ACCOUNT, ...options.env },
    ...(options.input === undefined ? {} : { input: options.input }),
    stdio: options.capture || options.input !== undefined ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.capture || options.input !== undefined) {
      process.stderr.write(result.stderr ?? "");
      process.stderr.write(result.stdout ?? "");
    }
    throw new Error("Command failed: " + path.basename(script) + " " + args.join(" ") + " (exit " + result.status + ")");
  }
  if (options.input !== undefined && !options.capture) {
    process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
  }
  return result.stdout ?? "";
}
const wrangler = (args, options) => runNode(path.join(ROOT, "node_modules/wrangler/bin/wrangler.js"), args, options);
function npm(args, env = {}) {
  const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  assert(fs.existsSync(npmCli), "npm CLI could not be found");
  return runNode(npmCli, args, { env });
}
function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw new Error("Git check failed");
  return result.stdout;
}
export function sourceHash() {
  const files = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean).sort();
  const hash = createHash("sha256");
  for (const file of files) { hash.update(file + "\0"); hash.update(fs.readFileSync(path.join(ROOT, file))); }
  return hash.digest("hex");
}
function writeState(name, value) {
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(path.join(STATE, name), JSON.stringify(value, null, 2) + "\n");
}
function resourceState(required = false) {
  const file = path.join(STATE, "resources.json");
  if (!fs.existsSync(file)) {
    if (required) throw new Error("Staging resources have not been provisioned. Provision requires the explicit remote-resource decision.");
    return null;
  }
  return validateResources(JSON.parse(fs.readFileSync(file, "utf8")));
}
function stageConfig(role) {
  const input = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/catalogue-" + role + "/wrangler.jsonc"), "utf8"));
  const merged = { ...input, ...input.env.staging }; delete merged.env;
  return validateConfig(merged, role, { allowPlaceholder: true });
}
export function authDeploymentSecrets(environment = process.env) {
  const values = {
    AUTH_RATE_LIMIT_SECRET: environment.TECHABANCA_CATALOGUE_AUTH_RATE_LIMIT_SECRET,
    TURNSTILE_SITE_KEY: environment.TECHABANCA_CATALOGUE_TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET_KEY: environment.TECHABANCA_CATALOGUE_TURNSTILE_SECRET_KEY,
  };
  if (!/^[a-f0-9]{64}$/i.test(values.AUTH_RATE_LIMIT_SECRET ?? "")
    || !/^0x[a-zA-Z0-9_-]{20,100}$/.test(values.TURNSTILE_SITE_KEY ?? "")
    || !values.TURNSTILE_SECRET_KEY || values.TURNSTILE_SECRET_KEY.length < 20 || values.TURNSTILE_SECRET_KEY.length > 200)
    throw new Error("Hosted authentication configuration is incomplete or invalid. Configure the Catalogue-only security bindings before deployment.");
  return values;
}

function stageSecrets() {
  const appFile = path.join(ROOT, "apps/catalogue-app/.dev.vars.staging");
  const publicFile = path.join(ROOT, "apps/catalogue-public/.dev.vars.staging");
  const parse = file => Object.fromEntries(fs.readFileSync(file, "utf8").trim().split(/\r?\n/).map(line => {
    const match = /^([A-Z_]+)=([a-f0-9]{64})$/.exec(line); assert(match, "Invalid staging signing configuration"); return [match[1], match[2]];
  }));
  if (!fs.existsSync(appFile) && !fs.existsSync(publicFile)) {
    const preview = randomBytes(32).toString("hex"), asset = randomBytes(32).toString("hex");
    fs.writeFileSync(appFile, "ASSET_UPLOAD_SIGNING_SECRET=" + asset + "\nPUBLICATION_PREVIEW_SECRET=" + preview + "\n", { flag: "wx", mode: 0o600 });
    fs.writeFileSync(publicFile, "PUBLICATION_PREVIEW_SECRET=" + preview + "\n", { flag: "wx", mode: 0o600 });
  }
  assert(fs.existsSync(appFile) && fs.existsSync(publicFile), "Staging signing configuration is incomplete; do not overwrite existing keys");
  const app = parse(appFile), publicKeys = parse(publicFile);
  assert.deepEqual(Object.keys(app).sort(), ["ASSET_UPLOAD_SIGNING_SECRET", "PUBLICATION_PREVIEW_SECRET"]);
  assert.deepEqual(Object.keys(publicKeys), ["PUBLICATION_PREVIEW_SECRET"]);
  assert(app.PUBLICATION_PREVIEW_SECRET === publicKeys.PUBLICATION_PREVIEW_SECRET, "Preview signing keys differ");
  for (const file of [appFile, publicFile]) { const relative = path.relative(ROOT, file).replaceAll("\\", "/"); assert.equal(git(["check-ignore", relative]).trim(), relative, "Signing configuration must be ignored"); }
  return { app, public: publicKeys };
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
function digest(file) { return createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
export async function build({ verified = false } = {}) {
  const before = sourceHash(); const resources = resourceState(); stageSecrets();
  for (const role of ["app", "public"]) stageConfig(role);
  npm(["run", "build"], { CLOUDFLARE_ENV: "staging" });
  // Remove generated local secret copies before validating either release bundle.
  for (const role of ["app", "public"]) {
    const out = path.join(ROOT, "apps/catalogue-" + role + "/dist-staging");
    for (const file of walk(out).filter(file => path.basename(file).startsWith(".dev.vars"))) fs.unlinkSync(file);
  }
  const artifacts = {};
  for (const role of ["app", "public"]) {
    const out = path.join(ROOT, "apps/catalogue-" + role + "/dist-staging");
    const files = walk(out).filter(file => path.basename(file) === "wrangler.json");
    assert.equal(files.length, 1, "Expected one deployment configuration");
    const configFile = files[0], config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    config.d1_databases[0].migrations_dir = path.join(ROOT, "database/migrations");
    if (resources) config.d1_databases[0].database_id = resources.database.id;
    validateConfig(config, role, { allowPlaceholder: !resources });
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
    wrangler(["deploy", "--dry-run", "--config", configFile, "--outdir", path.join(STATE, "dry-run", role)]);
    artifacts[role] = { configFile: path.relative(ROOT, configFile), files: walk(out).map(file => ({ file: path.relative(ROOT, file), sha256: digest(file) })) };
  }
  assert.equal(sourceHash(), before, "Source changed while building");
  const manifest = { sourceHash: before, verifiedSourceHash: verified ? before : null,
    provisioned: !!resources, createdAt: new Date().toISOString(), artifacts };
  writeState("build-manifest.json", manifest);
  console.log("Staging builds and deployment dry-runs passed. Remote mutations: none.");
  return manifest;
}
export function validateManifest(manifest, hash = sourceHash()) {
  assert.equal(manifest.sourceHash, hash, "Source changed since the staging build");
  assert.equal(manifest.verifiedSourceHash, hash, "Run staging verification before deployment");
  assert.equal(manifest.provisioned, true, "Build has no provisioned staging resource bindings");
  for (const role of ["app", "public"]) {
    const artifact = manifest.artifacts[role];
    const prefix = "apps/catalogue-" + role + "/dist-staging/";
    const inside = relative => {
      assert(!path.isAbsolute(relative), "Unexpected absolute artifact path");
      const remaining = path.relative(path.resolve(ROOT, prefix), path.resolve(ROOT, relative));
      assert(remaining !== "" && !remaining.startsWith(".." + path.sep) && remaining !== ".." && !path.isAbsolute(remaining), "Unexpected artifact path");
    };
    inside(artifact.configFile);
    assert(artifact.files.some(entry => entry.file === artifact.configFile), "Deployment config was not recorded");
    for (const entry of artifact.files) {
      inside(entry.file);
      assert.equal(digest(path.join(ROOT, entry.file)), entry.sha256, "Release artifact changed: " + entry.file);
    }
  }
  return manifest;
}
function databases() { return JSON.parse(wrangler(["d1", "list", "--json"], { capture: true })); }
function bucketNames() { return [...wrangler(["r2", "bucket", "list"], { capture: true }).matchAll(/^name:\s+(\S+)/gm)].map(match => match[1]); }
function assertRemoteResources(resources) {
  validateResources(resources);
  const db = databases().find(value => value.name === resources.database.name);
  assert(db && db.uuid === resources.database.id, "Remote staging database ownership does not match");
  assert(bucketNames().includes(resources.bucket.name), "Staging storage bucket is missing");
}
export function provision() {
  const plan = readPlan();
  let db = databases().find(value => value.name === plan.databaseName);
  if (!db) { wrangler(["d1", "create", plan.databaseName, "--update-config=false"]); db = databases().find(value => value.name === plan.databaseName); }
  assert(db, "Staging database creation did not complete");
  if (!bucketNames().includes(plan.bucketName)) wrangler(["r2", "bucket", "create", plan.bucketName]);
  const resources = validateResources({ accountId: plan.accountId, database: { name: db.name, id: db.uuid }, bucket: { name: plan.bucketName } });
  assertRemoteResources(resources); writeState("resources.json", resources);
  console.log("Isolated staging database and bucket are recorded. No migrations, Workers or DNS were changed.");
}
export async function verifyWildcardTls(hostname) {
  await lookup(hostname);
  await new Promise((resolve, reject) => {
    const socket = tls.connect({ host: hostname, servername: hostname, port: 443, rejectUnauthorized: true });
    socket.setTimeout(10000, () => socket.destroy(new Error("Wildcard TLS connection timed out")));
    socket.once("error", reject);
    socket.once("secureConnect", () => { socket.end(); resolve(); });
  });
}
export async function deploy() {
  const resources = resourceState(true); assertRemoteResources(resources);
  const manifest = validateManifest(JSON.parse(fs.readFileSync(path.join(STATE, "build-manifest.json"), "utf8")));
  const plan = readPlan();
  await verifyWildcardTls("m8-" + randomBytes(6).toString("hex") + "." + plan.publicSuffix);
  const configs = {};
  for (const role of ["app", "public"]) {
    const file = path.join(ROOT, manifest.artifacts[role].configFile);
    const config = validateConfig(JSON.parse(fs.readFileSync(file, "utf8")), role);
    assert.equal(config.d1_databases[0].database_id, resources.database.id); configs[role] = file;
  }
  const authSecrets = authDeploymentSecrets();
  const secrets = stageSecrets();
  secrets.app = { ...secrets.app, ...authSecrets };
  wrangler(["d1", "migrations", "apply", plan.databaseName, "--remote", "--config", configs.app]);
  for (const role of ["app", "public"]) {
    wrangler(["deploy", "--config", configs[role]]);
    wrangler(["secret", "bulk", "--config", configs[role]], { input: JSON.stringify(secrets[role]) });
  }
  await smoke();
  writeState("deployment.json", { sourceHash: manifest.sourceHash, completedAt: new Date().toISOString(), resources, smoke: "passed" });
}
export async function smoke() {
  const plan = readPlan(), probe = "m8-" + randomBytes(6).toString("hex") + "." + plan.publicSuffix;
  await verifyWildcardTls(probe);
  const request = async (url, status) => {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, status, "Unexpected HTTP status for " + url);
    assert.equal(response.headers.get("x-techabanca-environment"), "staging");
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
    return response;
  };
  await request("https://" + plan.managementHost + "/", 200);
  await request("https://" + plan.managementHost + "/api/health", 200);
  await request("https://" + plan.managementHost + "/api/v1/auth/session", 401);
  await request("https://" + plan.managementHost + "/api/m8-unknown", 404);
  assert.match(await (await request("https://" + plan.managementHost + "/robots.txt", 200)).text(), /Disallow: \//);
  await request("https://" + probe + "/health", 200);
  await request("https://" + probe + "/", 404);
  console.log("Staging HTTPS, wildcard routing, crawler exclusions and same-origin API smoke checks passed.");
}
async function main(action) {
  readPlan();
  if (action === "plan") { console.log(JSON.stringify(readPlan(), null, 2)); return; }
  if (action === "build") { await build(); return; }
  if (action === "verify") {
    const hash = sourceHash();
    npm(["run", "verify"], { CLOUDFLARE_ENV: "" });
    assert.equal(sourceHash(), hash, "Source changed during verification");
    await build({ verified: true });
    npm(["run", "performance:verify", "--", "--staging"]); return;
  }
  if (action === "provision") { provision(); return; }
  if (action === "deploy") { await deploy(); return; }
  if (action === "smoke") { await smoke(); return; }
  throw new Error("Use plan, build, verify, provision, deploy or smoke.");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2] ?? "plan").catch(error => { console.error(error.message); process.exitCode = 1; });
}
