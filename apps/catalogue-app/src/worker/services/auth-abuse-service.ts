import { readCatalogueDeployment } from "@techabanca/domain";
import type { CatalogueAppEnv } from "../app-env";
import { boundedRequestBytes } from "../http/request-json";
type Bindings = CatalogueAppEnv["Bindings"];
export type AuthAction = "login" | "register";
export class AuthProtectionError extends Error {
  constructor(readonly status: 400 | 429 | 503, readonly code: string, message: string, readonly retryAfter?: number) { super(message); }
}
const unavailable = () => new AuthProtectionError(503, "authentication_unavailable", "Sign in is temporarily unavailable. Please try again.");
export function authSecurityConfiguration(env: Bindings) {
  const local = readCatalogueDeployment(env.DEPLOYMENT_ENVIRONMENT) === "local";
  const siteKey = env.TURNSTILE_SITE_KEY, secret = env.TURNSTILE_SECRET_KEY;
  if (local && !siteKey && !secret) return { enabled: false as const, siteKey: null };
  if (!/^0x[a-zA-Z0-9_-]{20,100}$/.test(siteKey ?? "") || !secret || secret.length < 20 || secret.length > 200) throw unavailable();
  if (!local && !/^[a-f0-9]{64}$/i.test(env.AUTH_RATE_LIMIT_SECRET ?? "")) throw unavailable();
  return { enabled: true as const, siteKey: siteKey! };
}
export async function consumeAuthBudget(env: Bindings, request: Request, action: AuthAction, email: string, date = new Date()) {
  const local = readCatalogueDeployment(env.DEPLOYMENT_ENVIRONMENT) === "local";
  const secret = env.AUTH_RATE_LIMIT_SECRET ?? (local ? "techabanca-local-auth-rate-limit-v1" : "");
  const ip = request.headers.get("CF-Connecting-IP") ?? (local ? "local" : "");
  if ((!local && !/^[a-f0-9]{64}$/i.test(secret)) || !ip || ip.length > 64 || (!local && !/^[a-f0-9:.]{3,64}$/i.test(ip))) throw unavailable();
  const bucket = Math.floor(date.getTime() / 900000), retry = 900 - Math.floor(date.getTime() / 1000) % 900;
  const expiry = new Date((bucket + 1) * 900000 + 86400000).toISOString();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hash = async (kind: string, input: string) => Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(JSON.stringify(["techabanca-auth-abuse-v1", Math.floor(date.getTime() / 86400000), action, kind, input])))), n => n.toString(16).padStart(2, "0")).join("");
  const budgets = [{ key: await hash("client", ip), limit: action === "login" ? 20 : 5 }];
  if (action === "login") budgets.push({ key: await hash("client-account", JSON.stringify([ip, email])), limit: 10 });
  const rs = await env.DB.batch(budgets.map((b,index) => {
    const client = budgets[0];
    // A blocked client must not create more per-account rows by rotating emails.
    const values = index === 0 ? "VALUES (?,?,?,1,?) " : "SELECT ?,?,?,1,? WHERE EXISTS (SELECT 1 FROM auth_attempt_windows "
      + "WHERE action=? AND client_hash=? AND bucket=? AND attempts<=?) ";
    const statement = env.DB.prepare("INSERT INTO auth_attempt_windows(action,client_hash,bucket,attempts,expires_at) " + values
      + "ON CONFLICT(action,client_hash,bucket) DO UPDATE SET attempts=MIN(auth_attempt_windows.attempts+1,?) RETURNING attempts");
    return index === 0 ? statement.bind(action,b.key,bucket,expiry,b.limit+1)
      : statement.bind(action,b.key,bucket,expiry,action,client.key,bucket,client.limit,b.limit+1);
  }));
  if (rs.some((r,i) => !r.results[0] || (r.results[0] as { attempts: number }).attempts > budgets[i].limit))
    throw new AuthProtectionError(429, "authentication_rate_limited", "Too many attempts. Please wait before trying again.", retry);
}
export async function verifyAuthChallenge(env: Bindings, request: Request, action: AuthAction, token: unknown,
  fetcher: typeof fetch = fetch, date = new Date()) {
  if (!authSecurityConfiguration(env).enabled) return;
  if (typeof token !== "string" || !token || token.length > 2048 || /[\x00-\x20\x7f]/.test(token))
    throw new AuthProtectionError(400, "verification_required", "Complete the security check and try again.");
  let result: Record<string, unknown>;
  try {
    const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error",
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw unavailable();
    result = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(await boundedRequestBytes(new Request("https://siteverify.invalid", { method: "POST", body: response.body }), 8192)));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw unavailable();
  } catch { throw unavailable(); }
  const timestamp = typeof result.challenge_ts === "string" ? Date.parse(result.challenge_ts) : NaN;
  if (result.success !== true || result.hostname !== new URL(request.url).hostname || result.action !== "auth_" + action
    || !Number.isFinite(timestamp) || timestamp < date.getTime() - 300000 || timestamp > date.getTime() + 60000)
    throw new AuthProtectionError(400, "verification_required", "Complete a new security check and try again.");
}
export async function purgeAuthWindows(db: D1Database, date = new Date()) {
  for (let round = 0; round < 20; round++) {
    const result = await db.prepare("DELETE FROM auth_attempt_windows WHERE (action,client_hash,bucket) IN "
      + "(SELECT action,client_hash,bucket FROM auth_attempt_windows WHERE expires_at<=? LIMIT 1000)").bind(date.toISOString()).run();
    if (result.meta.changes < 1000) return;
  }
  throw new Error("auth_retention_backlog");
}
