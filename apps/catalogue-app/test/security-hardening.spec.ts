import { env } from "cloudflare:workers";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/worker";
import { authSecurityConfiguration, consumeAuthBudget, verifyAuthChallenge, purgeAuthWindows } from "../src/worker/services/auth-abuse-service";
import { readRequestJson } from "../src/worker/http/request-json";
import { AuthSessionService } from "../src/worker/services/auth-session-service";
import { SessionRepository } from "../src/worker/repositories";
import { PasswordHasher } from "../src/worker/security/password-hasher";
import { publicationFixture } from "./publication-fixtures";
const root = "https://catalogue.test", local = { ...env, DEPLOYMENT_ENVIRONMENT: "local" };
const hosted = { ...env, DEPLOYMENT_ENVIRONMENT: "staging", AUTH_RATE_LIMIT_SECRET: "a".repeat(64),
  TURNSTILE_SITE_KEY: "0x" + "b".repeat(26), TURNSTILE_SECRET_KEY: "c".repeat(32) };
const now = new Date("2026-10-05T12:01:00.000Z");
function request(ip = "198.51.100.14") { return new Request(root + "/api/v1/auth/login", { headers: { "CF-Connecting-IP": ip } }); }
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status }); }
const valid = { success: true, hostname: "catalogue.test", action: "auth_login", challenge_ts: now.toISOString() };
beforeEach(async () => { await env.DB.prepare("DELETE FROM auth_attempt_windows").run(); });
afterEach(() => vi.restoreAllMocks());
describe("hosted bot verification", () => {
  it("keeps an explicit local workflow and publishes only public configuration", async () => {
    expect(authSecurityConfiguration(local)).toEqual({ enabled: false, siteKey: null });
    const r = await app.request(root + "/api/v1/auth/security", {}, local);
    expect(r.status).toBe(200); expect(await r.json()).toEqual({ data: { enabled: false, siteKey: null } });
    const data = authSecurityConfiguration(hosted); expect(data).toEqual({ enabled: true, siteKey: hosted.TURNSTILE_SITE_KEY });
    expect(JSON.stringify(data)).not.toContain(hosted.TURNSTILE_SECRET_KEY); expect(JSON.stringify(data)).not.toContain(hosted.AUTH_RATE_LIMIT_SECRET);
  });
  it.each(["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "AUTH_RATE_LIMIT_SECRET"] as const)("fails closed without %s", key => {
    expect(() => authSecurityConfiguration({ ...hosted, [key]: undefined })).toThrow();
  });
  it("does not allow test site keys or partial configuration to disable hosted checks", () => {
    expect(() => authSecurityConfiguration({ ...hosted, TURNSTILE_SITE_KEY: "1x00000000000000000000AA" })).toThrow();
    expect(() => authSecurityConfiguration({ ...local, TURNSTILE_SITE_KEY: hosted.TURNSTILE_SITE_KEY })).toThrow();
  });
  it("fails closed over HTTP without exposing missing binding details", async () => {
    const r = await app.request("https://catalogue-preview.techabanca.com/api/v1/auth/security", {}, { ...env, DEPLOYMENT_ENVIRONMENT: "staging" });
    expect(r.status).toBe(503); expect(await r.text()).not.toMatch(/TURNSTILE|SECRET|binding/);
  });
  it("verifies every attempt server-side with action, hostname, expiry and a bounded timeout", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(_url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
      expect(init?.method).toBe("POST"); expect(init?.redirect).toBe("error"); expect(init?.signal).toBeTruthy();
      expect(JSON.parse(String(init?.body))).toEqual({ secret: hosted.TURNSTILE_SECRET_KEY, response: "synthetic-token" });
      return response(valid);
    });
    await verifyAuthChallenge(hosted, request(), "login", "synthetic-token", fetcher as typeof fetch, now);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { success: false }, { hostname: "evil.test" }, { action: "auth_register" },
    { challenge_ts: "2026-10-05T11:55:59.999Z" }, { challenge_ts: "2026-10-05T12:02:00.001Z" },
    { challenge_ts: "invalid" }, { success: "true" },
  ])("rejects an invalid verification result: %j", async patch => {
    await expect(verifyAuthChallenge(hosted, request(), "login", "synthetic-token", (async () => response({ ...valid, ...patch })) as typeof fetch, now))
      .rejects.toMatchObject({ status: 400, code: "verification_required" });
  });
  it.each([undefined, "", 42, "x".repeat(2049), "token\nvalue"])("rejects invalid tokens before provider work: %s", async token => {
    const fetcher = vi.fn();
    await expect(verifyAuthChallenge(hosted, request(), "login", token, fetcher, now)).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["network", "http", "json", "oversize"] as const)("fails closed on %s provider failure", async kind => {
    const fetcher = (async () => { if (kind === "network") throw new Error("PRIVATE SECRET");
      if (kind === "http") return response({}, 500);
      return new Response(kind === "oversize" ? "x".repeat(8193) : "not-json"); }) as typeof fetch;
    await expect(verifyAuthChallenge(hosted, request(), "login", "synthetic-token", fetcher, now))
      .rejects.toMatchObject({ status: 503, code: "authentication_unavailable" });
  });
  it("rejects replayed provider tokens and never caches a successful validation", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(valid)).mockResolvedValueOnce(response({ success: false, "error-codes": ["timeout-or-duplicate"] }));
    await verifyAuthChallenge(hosted, request(), "login", "same-token", fetcher, now);
    await expect(verifyAuthChallenge(hosted, request(), "login", "same-token", fetcher, now)).rejects.toMatchObject({ status: 400 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
describe("durable authentication abuse budgets", () => {
  it("allows 10 client/account attempts and rejects the next without storing identity data", async () => {
    for (let i = 0; i < 10; i++) await consumeAuthBudget(hosted, request(), "login", "private@example.test", now);
    await expect(consumeAuthBudget(hosted, request(), "login", "private@example.test", now)).rejects.toMatchObject({ status: 429, retryAfter: 840 });
    const rows = (await env.DB.prepare("SELECT * FROM auth_attempt_windows").all()).results;
    expect(rows).toHaveLength(2); expect(JSON.stringify(rows)).not.toMatch(/private|example|198\.51/);
    expect(rows.every(row => /^[a-f0-9]{64}$/.test(String(row.client_hash)))).toBe(true);
  });
  it("limits a client even when account addresses rotate", async () => {
    for (let i = 0; i < 20; i++) await consumeAuthBudget(hosted, request(), "login", "account-" + i + "@example.test", now);
    await expect(consumeAuthBudget(hosted, request(), "login", "new@example.test", now)).rejects.toMatchObject({ status: 429 });
    for (let i = 0; i < 3; i++) await expect(consumeAuthBudget(hosted, request(), "login", "blocked-" + i + "@example.test", now)).rejects.toMatchObject({ status: 429 });
    expect((await env.DB.prepare("SELECT count(*) AS n FROM auth_attempt_windows").first<{ n: number }>())!.n).toBe(21);
  });
  it("limits registrations separately to 5 attempts per window", async () => {
    for (let i = 0; i < 5; i++) await consumeAuthBudget(hosted, request(), "register", "new@example.test", now);
    await expect(consumeAuthBudget(hosted, request(), "register", "other@example.test", now)).rejects.toMatchObject({ status: 429 });
    await expect(consumeAuthBudget(hosted, request(), "login", "new@example.test", now)).resolves.toBeUndefined();
  });
  it("serializes simultaneous requests at the exact allowance", async () => {
    const rs = await Promise.allSettled(Array.from({ length: 15 }, () => consumeAuthBudget(hosted, request(), "login", "same@example.test", now)));
    expect(rs.filter(r => r.status === "fulfilled")).toHaveLength(10);
    expect(rs.filter(r => r.status === "rejected")).toHaveLength(5);
  });
  it("ignores forwarded-address headers and requires the trusted hosted address", async () => {
    await expect(consumeAuthBudget(hosted, new Request(root, { headers: { "X-Forwarded-For": "198.51.100.14" } }), "login", "x@example.test", now)).rejects.toMatchObject({ status: 503 });
  });
  it("opens a new time window and purges only expired rows", async () => {
    for (let i = 0; i < 11; i++) try { await consumeAuthBudget(hosted, request(), "login", "same@example.test", now); } catch {}
    await consumeAuthBudget(hosted, request(), "login", "same@example.test", new Date(now.getTime() + 900000));
    const before = (await env.DB.prepare("SELECT count(*) AS n FROM auth_attempt_windows").first<{ n: number }>())!.n;
    expect(before).toBe(4);
    await purgeAuthWindows(env.DB, new Date("2026-10-06T12:15:00.000Z"));
    expect((await env.DB.prepare("SELECT count(*) AS n FROM auth_attempt_windows").first<{ n: number }>())!.n).toBe(2);
  });
  it("enforces the budget over HTTP before password hashing and returns Retry-After", async () => {
    const req = request("198.51.100.29"), date = new Date();
    for (let i = 0; i < 10; i++) await consumeAuthBudget(local, req, "login", "nobody@example.test", date);
    const verify = vi.spyOn(PasswordHasher.prototype, "verify");
    const r = await app.request(root + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.29" },
      body: JSON.stringify({ email: "nobody@example.test", password: "synthetic-password" }) }, local);
    expect(r.status).toBe(429); expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0); expect(verify).not.toHaveBeenCalled();
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
  it("does not expose database failures or proceed without the limiter", async () => {
    const db = new Proxy(env.DB, { get(target,key) { if (key === "batch") return () => { throw new Error("PRIVATE DATABASE TOKEN"); }; const value = Reflect.get(target,key); return typeof value === "function" ? value.bind(target) : value; } });
    const r = await app.request(root + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.test", password: "synthetic-password" }) }, { ...local, DB: db });
    expect(r.status).toBe(500); expect(await r.text()).not.toContain("PRIVATE");
  });
});
describe("request/session security regressions", () => {
  it.each(["text/plain", "application/x-www-form-urlencoded", "application/json; charset=iso-8859-1"])("rejects credential bodies with %s", async mime => {
    const r = await app.request(root + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": mime }, body: '{"email":"x@example.test","password":"synthetic"}' }, local);
    expect(r.status).toBe(400);
  });
  it.each(['{"email":"x@example.test","email":"y@example.test","password":"synthetic"}','{"email":"x@example.test","password":"synthetic","role":"owner"}'])("rejects ambiguous/extra credential fields", async body => {
    expect((await app.request(root + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body }, local)).status).toBe(400);
  });
  it("bounds streamed bodies even without a declared length", async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(17000)); }, cancel() { canceled = true; } });
    const r = await app.fetch(new Request(root + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: stream }), local);
    expect(r.status).toBe(413); expect(canceled).toBe(true);
  });
  it("rejects malformed UTF-8 instead of replacing bytes", async () => {
    await expect(readRequestJson(new Request(root, { method: "POST", headers: { "Content-Type": "application/json" }, body: new Uint8Array([0x7b,0x22,0x78,0x22,0x3a,0x22,0xc3,0x22,0x7d]) }))).rejects.toThrow();
  });
  it.each(["https://catalogue.test/path", "https://user@catalogue.test", "null", "https://catalogue.test.evil.test"])("rejects noncanonical origins: %s", async Origin => {
    expect((await app.request(root + "/api/v1/auth/logout", { method: "POST", headers: { Origin } }, local)).status).toBe(403);
  });
  it("rejects ambiguous same-name session cookies", async () => {
    const f = await publicationFixture(), cookie = await f.session();
    for (const Cookie of [cookie + "; " + cookie, cookie + "; __Host-techabanca_catalogue_session=" + "0".repeat(64)])
      expect((await app.request(root + "/api/v1/auth/session", { headers: { Cookie } }, local)).status).toBe(401);
  });
  it("does not create a session after the user is suspended", async () => {
    const f = await publicationFixture();
    await env.DB.prepare("UPDATE users SET status='suspended' WHERE id=?").bind(f.owner).run();
    await expect(new AuthSessionService(new SessionRepository(env.DB)).create(f.owner,new Date())).rejects.toThrow("session_user_unavailable");
    expect((await env.DB.prepare("SELECT count(*) AS n FROM sessions WHERE user_id=?").bind(f.owner).first<{ n: number }>())!.n).toBe(0);
  });
  it("rechecks the user's active state when password verification finishes", async () => {
    const f = await publicationFixture();
    vi.spyOn(PasswordHasher.prototype, "verify").mockImplementation(async () => { await env.DB.prepare("UPDATE users SET status='suspended' WHERE id=?").bind(f.owner).run(); return true; });
    const r = await app.request(root + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner" + f.n + "@publisher.test", password: "synthetic" }) }, local);
    expect(r.status).toBe(500); expect(r.headers.get("Set-Cookie")).toBeNull();
    expect((await env.DB.prepare("SELECT count(*) AS n FROM sessions WHERE user_id=?").bind(f.owner).first<{ n: number }>())!.n).toBe(0);
  });
  it("adds a hosted HTML CSP, frame protection and HSTS to the static application", async () => {
    const bindings = { ...hosted, STATIC_ASSETS: { fetch: async () => new Response("<!doctype html><html></html>", { headers: { "Content-Type": "text/html" } }) } as unknown as Fetcher };
    const r = await app.request("https://catalogue-preview.techabanca.com/", {}, bindings);
    expect(r.status).toBe(200); const csp = r.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("frame-ancestors 'none'"); expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com;");
    expect(csp).not.toContain("unsafe-eval"); expect(r.headers.get("X-Frame-Options")).toBe("DENY");
    expect(r.headers.get("Strict-Transport-Security")).toBe("max-age=31536000"); expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("authorization after request bodies finish", () => {
  it("resolves authentication after a slow JSON body and rejects a session revoked during upload", async () => {
    const f = await publicationFixture(), Cookie = await f.session();
    const body = new TextEncoder().encode(JSON.stringify({ name: "Revoked request must not create an item", itemType: "product" }));
    const stream = new ReadableStream<Uint8Array>({ async pull(controller) {
      await env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE user_id=?").bind(new Date().toISOString(),f.owner).run();
      controller.enqueue(body); controller.close();
    } }, { highWaterMark: 0 });
    const r = await app.fetch(new Request(root + "/api/v1/catalogue/items", { method: "POST",
      headers: { Cookie, "X-Techabanca-Organization": f.tenant.organizationPublicId, "Content-Type": "application/json" }, body: stream }), local);
    expect(r.status).toBe(401);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM catalogue_items WHERE name=?").bind("Revoked request must not create an item").first<{ n: number }>())!.n).toBe(0);
  });
  it("requires a verified challenge on the hosted login HTTP route before password work", async () => {
    const verify = vi.spyOn(PasswordHasher.prototype,"verify");
    const r = await app.request("https://catalogue-preview.techabanca.com/api/v1/auth/login", { method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.36" },
      body: JSON.stringify({ email: "synthetic@example.test", password: "synthetic-password" }) }, hosted);
    expect(r.status).toBe(400); expect(await r.json()).toMatchObject({ error: { code: "verification_required" } });
    expect(verify).not.toHaveBeenCalled(); expect(r.headers.get("Set-Cookie")).toBeNull();
  });
});
