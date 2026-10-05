import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/worker";
import { SubscriptionService } from "../src/worker/services/subscription-service";
import { EntitlementService } from "../src/worker/services/entitlement-service";
import { publicationFixture, id, previewConfig } from "./publication-fixtures";

const config = { CATALOGUE_PAYMENT_MODE: "razorpay-test", CATALOGUE_RAZORPAY_KEY_ID: "rzp_test_qaabcdef",
  CATALOGUE_RAZORPAY_KEY_SECRET: "q".repeat(64), CATALOGUE_RAZORPAY_ACCOUNT_ID: "acc_QAM10",
  CATALOGUE_RAZORPAY_WEBHOOK_SECRET: "w".repeat(64) };
const root = "https://catalogue.test/api/v1/catalogue/subscription";
async function setup() {
  const f = await publicationFixture(), now = new Date().toISOString(), offer = "off_" + f.n.toString(16).padStart(32, "0");
  const providerId = "sub_QA" + f.n, planId = "plan_QA" + f.n;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO subscription_plans (id, code, name, created_at, updated_at) VALUES (?, ?, 'QA paid plan', ?, ?)").bind(f.n * 10 + 7, "qa-paid-" + f.n, now, now),
    env.DB.prepare("INSERT INTO plan_entitlements (plan_id, entitlement_key, value_type, boolean_value, created_at, updated_at) VALUES (?, 'catalogue.publish', 'boolean', 1, ?, ?)").bind(f.n * 10 + 7, now, now),
    env.DB.prepare("INSERT INTO subscription_offers (public_id, plan_id, billing_interval, currency_code, amount_minor_units, provider_plan_id, provider_account_id, total_cycles, mode, is_active, created_at) VALUES (?, ?, 'monthly', 'INR', 10000, ?, 'acc_QAM10', 12, 'test', 1, ?)").bind(offer, f.n * 10 + 7, planId, now),
  ]);
  const provider = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: providerId, plan_id: planId, status: "created", short_url: "https://rzp.io/i/qa" }), { headers: { "Content-Type": "application/json" } }));
  const bindings = { ...env, ...previewConfig, ...config }, service = new SubscriptionService(bindings, provider);
  const actor = { role: "owner", userId: f.owner }, requestId = "chk_" + f.n.toString(16).padStart(32, "0");
  const checkout = () => service.checkout(f.tenant, actor, offer, requestId);
  const stamp = Math.floor(Date.now() / 1000) - 2;
  const payload = (type = "subscription.charged", overrides: Record<string, unknown> = {}, payment: Record<string, unknown> = {}) => ({ account_id: config.CATALOGUE_RAZORPAY_ACCOUNT_ID,
    event: type, created_at: stamp, payload: { subscription: { entity: { id: providerId, plan_id: planId, quantity: 1, status: "active", current_start: stamp - 30, current_end: stamp + 30 * 86400, ...overrides } },
      payment: { entity: { id: "pay_QA" + f.n, amount: 10000, currency: "INR", status: "captured", amount_refunded: 0, ...payment } } } });
  const delivery = async (event: unknown, eventId = "evt_" + f.n, secret = config.CATALOGUE_RAZORPAY_WEBHOOK_SECRET) => {
    const body = JSON.stringify(event), key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))), n => n.toString(16).padStart(2, "0")).join("");
    return new Request("https://catalogue.test/api/v1/payments/webhooks/razorpay", { method: "POST", headers: { "Content-Type": "application/json", "X-Razorpay-Signature": signature, "X-Razorpay-Event-Id": eventId }, body });
  };
  return { ...f, offer, provider, planId, service, actor, checkout, payload, delivery, bindings, stamp, requestId };
}

describe("Catalogue subscription lifecycle", () => {
  beforeEach(async () => { await env.DB.prepare("UPDATE subscription_plans SET is_active = 1 WHERE code = 'catalogue-trial-14'").run(); });
  it("starts a one-time 14-day trial with no payment method and exact expiry", async () => {
    const f = await setup(), start = new Date(); const view = await f.service.startTrial(f.tenant, f.actor, start);
    expect(view).toMatchObject({ trialAvailable: false, canPublish: true, subscription: { effectiveStatus: "trialing", provider: false } });
    const end = new Date(start.getTime() + 14 * 86400000);
    expect(view.subscription!.trialEndsAt).toBe(end.toISOString());
    expect((await f.service.summary(f.tenant, "owner", end)).canPublish).toBe(false);
    expect((await f.service.summary(f.tenant, "owner", end)).subscription!.effectiveStatus).toBe("expired");
    await expect(f.service.startTrial(f.tenant, f.actor, end)).rejects.toMatchObject({ status: 409 });
    expect(f.provider).not.toHaveBeenCalled();
  });
  it("allows exactly one concurrent trial and records one activity", async () => {
    const f = await setup(), results = await Promise.allSettled([f.service.startTrial(f.tenant, f.actor), f.service.startTrial(f.tenant, f.actor)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM subscription_activity WHERE organization_id = ? AND action = 'trial_started'").bind(f.n).first<{ n: number }>())!.n).toBe(1);
  });
  it("keeps trial eligibility consumed after ending or deleting its subscription", async () => {
    const f = await setup(), v = await f.service.startTrial(f.tenant, f.actor);
    await f.service.cancel(f.tenant, f.actor, v.subscription!.id, v.subscription!.version);
    await env.DB.prepare("DELETE FROM subscriptions WHERE organization_id = ?").bind(f.n).run();
    expect(await new EntitlementService(env.DB).canPublish(f.tenant, true, new Date().toISOString())).toBe(false);
    await expect(f.service.startTrial(f.tenant, f.actor)).rejects.toMatchObject({ code: "trial_unavailable" });
  });
  it("never consumes eligibility when the configured trial is disabled", async () => {
    const f = await setup();
    await env.DB.prepare("INSERT INTO subscription_plans (code, name, is_active, created_at, updated_at) VALUES ('catalogue-trial-14', 'Disabled trial', 0, ?, ?) ON CONFLICT(code) DO UPDATE SET is_active = 0").bind(new Date().toISOString(), new Date().toISOString()).run();
    await expect(f.service.startTrial(f.tenant, f.actor)).rejects.toMatchObject({ code: "trial_unavailable" });
    expect(await env.DB.prepare("SELECT 1 FROM organization_trials WHERE organization_id = ?").bind(f.n).first()).toBeNull();
    await env.DB.prepare("UPDATE subscription_plans SET is_active = 1 WHERE code = 'catalogue-trial-14'").run();
  });
  it("rejects editors and rechecks a revoked manager at the write boundary", async () => {
    const f = await setup(); await expect(f.service.startTrial(f.tenant, { role: "editor", userId: f.editor })).rejects.toMatchObject({ status: 403 });
    await env.DB.prepare("UPDATE organization_members SET status = 'suspended' WHERE user_id = ?").bind(f.owner).run();
    await expect(f.service.startTrial(f.tenant, f.actor)).rejects.toMatchObject({ status: 409 });
  });
  it("reports source usage and does not accept persisted counters as authority", async () => {
    const f = await setup(), view = await f.service.summary(f.tenant, "editor");
    expect(view.usage).toMatchObject({ items: 5, categories: 3, enquiries: 0 }); expect(view.usage.storageBytes).toBeGreaterThan(0); expect(view.canManage).toBe(false);
  });
  it("disables unconfigured, live-key and production payment flows", async () => {
    const f = await setup();
    for (const bindings of [{ ...env, ...previewConfig }, { ...f.bindings, CATALOGUE_RAZORPAY_KEY_ID: "rzp_live_qaabcdef" }, { ...f.bindings, DEPLOYMENT_ENVIRONMENT: "production" }]) {
      const service = new SubscriptionService(bindings, f.provider);
      expect((await service.summary(f.tenant, "owner")).paymentMode).toBe("disabled");
      await expect(service.checkout(f.tenant, f.actor, f.offer, f.requestId)).rejects.toMatchObject({ status: 503 });
    }
    expect(f.provider).not.toHaveBeenCalled();
  });
  it("does not grant paid access from checkout creation or authentication callbacks", async () => {
    const f = await setup(), view = await f.checkout(); expect(view.checkout!.url).toBe("https://rzp.io/i/qa"); expect(view.canPublish).toBe(false);
    for (const type of ["subscription.authenticated", "subscription.activated"]) await f.service.webhook(await f.delivery(f.payload(type), type.replaceAll(".", "_")));
    expect((await f.service.summary(f.tenant, "owner")).canPublish).toBe(false);
    expect((await app.request(root + "/callback", { method: "POST", headers: { Origin: "https://catalogue.test" }, body: "success" }, f.bindings)).status).toBe(404);
  });
  it("resumes the same checkout without creating another provider subscription", async () => {
    const f = await setup(); await f.checkout(); await f.checkout(); expect(f.provider).toHaveBeenCalledTimes(1);
    expect((await f.service.summary(f.tenant, "editor")).checkout!.url).toBeNull();
    expect(f.provider.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/subscriptions");
    expect(JSON.parse(f.provider.mock.calls[0][1]!.body as string)).toMatchObject({ plan_id: f.planId, customer_notify: false, quantity: 1, total_count: 12 });
  });
  it("keeps uncertain provider creation locked against a blind retry", async () => {
    const f = await setup(); f.provider.mockRejectedValue(new Error("timeout secret response"));
    await expect(f.checkout()).rejects.toMatchObject({ code: "checkout_needs_review" }); await f.checkout();
    expect((await f.service.summary(f.tenant, "owner")).checkout).toMatchObject({ status: "unknown", url: null }); expect(f.provider).toHaveBeenCalledTimes(1);
  });
  it("rejects a checkout URL on an untrusted host", async () => {
    const f = await setup(); f.provider.mockResolvedValue(new Response(JSON.stringify({ id: "sub_QA" + f.n, plan_id: f.planId, status: "created", short_url: "https://rzp.io.evil.test/pay" })));
    await expect(f.checkout()).rejects.toMatchObject({ code: "checkout_needs_review" }); expect((await f.service.summary(f.tenant, "owner")).checkout!.url).toBeNull();
  });
  it("allows one concurrent checkout creation", async () => {
    const f = await setup(), results = await Promise.allSettled([f.checkout(), f.service.checkout(f.tenant, f.actor, f.offer, "chk_" + "a".repeat(32))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(f.provider).toHaveBeenCalledTimes(1);
  });
  it("atomically replaces a trial with a verified paid term", async () => {
    const f = await setup(); await f.service.startTrial(f.tenant, f.actor); await f.checkout();
    await f.service.webhook(await f.delivery(f.payload()));
    const v = await f.service.summary(f.tenant, "owner"); expect(v).toMatchObject({ canPublish: true, checkout: null, subscription: { status: "active", provider: true, amount: 10000, currency: "INR" } });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE organization_id = ? AND status IN ('trialing', 'active', 'past_due')").bind(f.n).first<{ n: number }>())!.n).toBe(1);
  });
  it("deduplicates concurrent deliveries and separate event IDs for one payment", async () => {
    const f = await setup(); await f.checkout(); const event = f.payload();
    await Promise.all([f.service.webhook(await f.delivery(event)), f.service.webhook(await f.delivery(event))]);
    const first = await f.service.summary(f.tenant, "owner"); await f.service.webhook(await f.delivery(event, "evt_other"));
    expect((await f.service.summary(f.tenant, "owner")).subscription!.version).toBe(first.subscription!.version);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM subscription_payments WHERE subscription_id = (SELECT id FROM subscriptions WHERE public_id = ?)").bind(first.subscription!.id).first<{ n: number }>())!.n).toBe(1);
  });
  it("rejects changed content under a previously processed event ID", async () => {
    const f = await setup(); await f.checkout(); await f.service.webhook(await f.delivery(f.payload()));
    await expect(f.service.webhook(await f.delivery(f.payload("subscription.cancelled")))).rejects.toMatchObject({ status: 409 });
    expect((await f.service.summary(f.tenant, "owner")).subscription!.status).toBe("active");
  });
  it.each([{ amount: 9999 }, { currency: "USD" }, { status: "authorized" }, { amount_refunded: 100 }, { id: "invalid" }])("rejects charge mismatch %j without persisting an event", async payment => {
    const f = await setup(); await f.checkout(); await expect(f.service.webhook(await f.delivery(f.payload("subscription.charged", {}, payment)))).rejects.toMatchObject({ status: 400 });
    expect((await f.service.summary(f.tenant, "owner")).canPublish).toBe(false); expect(await env.DB.prepare("SELECT 1 FROM payment_webhook_events WHERE event_id = ?").bind("evt_" + f.n).first()).toBeNull();
  });
  it.each([{ plan_id: "plan_wrong" }, { quantity: 2 }, { current_start: null }, { current_end: 9999999999 }])("rejects mapped plan or term mismatch %j", async entity => {
    const f = await setup(); await f.checkout(); await expect(f.service.webhook(await f.delivery(f.payload("subscription.charged", entity)))).rejects.toMatchObject({ status: 400 });
  });
  it("rejects bad signatures, another account, oversized and malformed deliveries", async () => {
    const f = await setup(); await f.checkout();
    await expect(f.service.webhook(await f.delivery(f.payload(), "evt_bad", "wrong".repeat(16)))).rejects.toMatchObject({ status: 401 });
    await expect(f.service.webhook(await f.delivery({ ...f.payload(), account_id: "acc_other" }, "evt_account"))).rejects.toMatchObject({ status: 400 });
    await expect(f.service.webhook(new Request("https://catalogue.test", { method: "POST", body: "a".repeat(131073) }))).rejects.toMatchObject({ status: 413 });
    const request = await f.delivery(f.payload()); request.headers.set("X-Razorpay-Event-Id", "bad id"); await expect(f.service.webhook(request)).rejects.toMatchObject({ status: 400 });
  });
  it("supports one previous webhook secret during rotation", async () => {
    const f = await setup(); await f.checkout(); const old = "o".repeat(64), service = new SubscriptionService({ ...f.bindings, CATALOGUE_RAZORPAY_PREVIOUS_WEBHOOK_SECRET: old });
    await service.webhook(await f.delivery(f.payload(), "evt_old", old)); expect((await service.summary(f.tenant, "owner")).canPublish).toBe(true);
  });
  it("retries unmapped events rather than losing a charge during checkout creation", async () => {
    const f = await setup(); await expect(f.service.webhook(await f.delivery(f.payload()))).rejects.toMatchObject({ status: 503 });
    expect(await env.DB.prepare("SELECT 1 FROM payment_webhook_events WHERE event_id = ?").bind("evt_" + f.n).first()).toBeNull();
  });
  it("does not regress a newer paid period when earlier charges arrive late", async () => {
    const f = await setup(); await f.checkout(); await f.service.webhook(await f.delivery(f.payload())); const v = await f.service.summary(f.tenant, "owner");
    await f.service.webhook(await f.delivery(f.payload("subscription.charged", { current_start: f.stamp - 60 * 86400, current_end: f.stamp - 30 * 86400 }, { id: "pay_older" }), "evt_older"));
    expect((await f.service.summary(f.tenant, "owner")).subscription!.periodEndsAt).toBe(v.subscription!.periodEndsAt);
  });
  it("handles terminal-before-charge delivery without adding a free grace period", async () => {
    const f = await setup(); await f.checkout(); await f.service.webhook(await f.delivery(f.payload("subscription.completed"), "evt_terminal"));
    expect((await f.service.summary(f.tenant, "owner")).canPublish).toBe(false);
    await f.service.webhook(await f.delivery({ ...f.payload(), created_at: f.stamp - 1 }, "evt_charge"));
    const v = await f.service.summary(f.tenant, "owner"); expect(v).toMatchObject({ canPublish: true, subscription: { status: "canceled", cancelAtPeriodEnd: true } });
    expect((await f.service.summary(f.tenant, "owner", new Date(v.subscription!.periodEndsAt!))).canPublish).toBe(false);
  });
  it("keeps only the verified paid period after a pending renewal and ignores stale status", async () => {
    const f = await setup(); await f.checkout(); await f.service.webhook(await f.delivery(f.payload()));
    await f.service.webhook(await f.delivery({ ...f.payload("subscription.pending"), created_at: f.stamp + 1 }, "evt_pending"));
    expect((await f.service.summary(f.tenant, "owner"))).toMatchObject({ canPublish: true, subscription: { status: "past_due" } });
    await f.service.webhook(await f.delivery({ ...f.payload("subscription.halted"), created_at: f.stamp - 1 }, "evt_stale"));
    expect((await f.service.summary(f.tenant, "owner")).subscription!.status).toBe("past_due");
  });
  it("rolls back event, payment, trial and paid changes together on a database failure", async () => {
    const f = await setup(); await f.service.startTrial(f.tenant, f.actor); await f.checkout();
    await env.DB.exec("CREATE TRIGGER qa_payment_failure BEFORE INSERT ON subscription_payments BEGIN SELECT RAISE(ABORT, 'qa_failure'); END;");
    try { await expect(f.service.webhook(await f.delivery(f.payload()))).rejects.toThrow();
      expect(await env.DB.prepare("SELECT 1 FROM payment_webhook_events WHERE event_id = ?").bind("evt_" + f.n).first()).toBeNull();
      expect((await f.service.summary(f.tenant, "owner")).subscription!.status).toBe("trialing");
    } finally { await env.DB.exec("DROP TRIGGER qa_payment_failure;"); }
    await f.service.webhook(await f.delivery(f.payload())); expect((await f.service.summary(f.tenant, "owner")).subscription!.status).toBe("active");
  });
  it("requires provider cancellation acknowledgement without extending access", async () => {
    const f = await setup(); await f.checkout(); await f.service.webhook(await f.delivery(f.payload())); const v = await f.service.summary(f.tenant, "owner");
    f.provider.mockRejectedValueOnce(new Error("provider secret")); await expect(f.service.cancel(f.tenant, f.actor, v.subscription!.id, v.subscription!.version)).rejects.toMatchObject({ code: "cancellation_unconfirmed" });
    expect((await f.service.summary(f.tenant, "owner")).subscription!.cancelAtPeriodEnd).toBe(false);
    f.provider.mockResolvedValueOnce(new Response(JSON.stringify({ id: "sub_QA" + f.n, plan_id: f.planId, status: "active" })));
    const canceled = await f.service.cancel(f.tenant, f.actor, v.subscription!.id, v.subscription!.version);
    expect(canceled).toMatchObject({ canPublish: true, subscription: { cancelAtPeriodEnd: true, periodEndsAt: v.subscription!.periodEndsAt } });
    expect(JSON.parse(f.provider.mock.calls.at(-1)![1]!.body as string)).toEqual({ cancel_at_cycle_end: true });
  });
  it("enforces item/storage limits at publishing while saved content remains readable", async () => {
    const f = await setup(); await f.checkout(); await f.service.webhook(await f.delivery(f.payload()));
    const now = new Date().toISOString(); await env.DB.prepare("INSERT INTO plan_entitlements (plan_id, entitlement_key, value_type, integer_value, created_at, updated_at) VALUES (?, 'items.max', 'integer', 4, ?, ?)").bind(f.n * 10 + 7, now, now).run();
    expect((await f.service.summary(f.tenant, "owner"))).toMatchObject({ canPublish: false, usage: { items: 5 }, limits: { "items.max": 4 } });
    await env.DB.prepare("DELETE FROM plan_entitlements WHERE plan_id = ? AND entitlement_key = 'items.max'").bind(f.n * 10 + 7).run();
    await env.DB.prepare("INSERT INTO plan_entitlements (plan_id, entitlement_key, value_type, integer_value, created_at, updated_at) VALUES (?, 'storage.bytes.max', 'integer', 1, ?, ?)").bind(f.n * 10 + 7, now, now).run();
    expect((await f.service.summary(f.tenant, "owner")).canPublish).toBe(false);
  });
  it("denies general entitlements at exact expiry and when a plan is disabled", async () => {
    const f = await setup(), start = new Date(), trial = await f.service.startTrial(f.tenant, f.actor, start), entitlement = new EntitlementService(env.DB);
    expect(await entitlement.get(f.tenant, "catalogue.publish", new Date(trial.subscription!.trialEndsAt!))).toBeNull();
    await env.DB.prepare("UPDATE subscription_plans SET is_active = 0 WHERE code = 'catalogue-trial-14'").run();
    expect(await entitlement.isEnabled(f.tenant, "catalogue.publish")).toBe(false);
  });
  it("protects HTTP management with authentication, tenant scope, role, origin and strict bodies", async () => {
    const f = await setup(), owner = await f.session(), editor = await f.session(f.editor), headers = { Cookie: owner, Origin: "https://catalogue.test", "X-Techabanca-Organization": id("org", f.n), "Content-Type": "application/json" };
    expect((await app.request(root, {}, f.bindings)).status).toBe(401);
    const response = await app.request(root, { headers }, f.bindings); expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await app.request(root + "/trial", { method: "POST", headers: { ...headers, Cookie: editor }, body: "{}" }, f.bindings)).status).toBe(403);
    expect((await app.request(root + "/trial", { method: "POST", headers: { ...headers, Origin: "https://evil.test" }, body: "{}" }, f.bindings)).status).toBe(403);
    expect((await app.request(root + "/trial", { method: "POST", headers, body: '{"planId":1}' }, f.bindings)).status).toBe(400);
    expect((await app.request(root + "/trial", { method: "POST", headers, body: "{}" }, f.bindings)).status).toBe(200);
    const other = await publicationFixture(); expect((await app.request(root, { headers: { ...headers, "X-Techabanca-Organization": id("org", other.n) } }, f.bindings)).status).toBe(403);
    const view = await f.service.summary(f.tenant, "owner"); await expect(f.service.cancel(other.tenant, { role: "owner", userId: other.owner }, view.subscription!.id, view.subscription!.version)).rejects.toMatchObject({ status: 404 });
  });
  it("cancels a pending checkout without ending its existing trial", async () => {
    const f = await setup(); await f.service.startTrial(f.tenant, f.actor); const v = await f.checkout();
    expect(v.checkout!.subscriptionId).not.toBe(v.subscription!.id);
    f.provider.mockResolvedValueOnce(new Response(JSON.stringify({ id: "sub_QA" + f.n, plan_id: f.planId, status: "cancelled" })));
    const canceled = await f.service.cancel(f.tenant, f.actor, v.checkout!.subscriptionId, v.checkout!.version!);
    expect(canceled).toMatchObject({ checkout: null, canPublish: true, subscription: { status: "trialing" } });
    expect(JSON.parse(f.provider.mock.calls.at(-1)![1]!.body as string)).toEqual({ cancel_at_cycle_end: false });
  });
  it("does not resurrect a terminated subscription with a later paid cycle", async () => {
    const f = await setup(); await f.checkout(); await f.service.webhook(await f.delivery(f.payload("subscription.cancelled"), "evt_cancel"));
    await f.service.webhook(await f.delivery(f.payload("subscription.charged", { current_start: f.stamp + 1 }, { id: "pay_afterCancel" }), "evt_after"));
    expect((await f.service.summary(f.tenant, "owner")).canPublish).toBe(false);
  });
  it("uses webhook signature authentication independently of browser sessions and origins", async () => {
    const f = await setup(); await f.checkout(); const request = await f.delivery(f.payload());
    const response = await app.request(request, undefined, f.bindings); expect(response.status).toBe(200);
    expect((await f.service.summary(f.tenant, "owner")).canPublish).toBe(true);
  });
});
