import { parseStrictJson } from "@techabanca/domain";
import { createPublicId, hasSubscriptionAccess, subscriptionAccessSql, TRIAL_DAYS, webhookSignatureValid,
  type SubscriptionStatus, type SubscriptionView, type TenantContext } from "@techabanca/domain";
import type { CatalogueAppEnv } from "../app-env";
import { EntitlementService } from "./entitlement-service";

type Bindings = CatalogueAppEnv["Bindings"];
type Actor = { role: string; userId: number };
type Row = { id: number; public_id: string; organization_id: number; plan_id: number; plan_name: string;
  status: SubscriptionStatus; trial_starts_at: string | null; trial_ends_at: string | null;
  current_period_starts_at: string | null; current_period_ends_at: string | null;
  billing_interval: "monthly" | "annual" | null; amount_minor_units: number | null; currency_code: string | null;
  cancel_at_period_end: number; version: number; paid_verified: number; provider_subscription_id: string | null;
  provider_event_at: number; provider_terminal_at: number | null };
type Offer = { public_id: string; plan_id: number; name: string; billing_interval: "monthly" | "annual";
  currency_code: string; amount_minor_units: number; provider_plan_id: string; provider_account_id: string; total_cycles: number };
type Checkout = { public_id: string; organization_id: number; offer_public_id: string; subscription_public_id: string;
  status: "creating" | "ready" | "unknown" | "closed" | "failed"; provider_subscription_id: string | null;
  provider_plan_id: string; provider_account_id: string; plan_id: number; billing_interval: "monthly" | "annual";
  currency_code: string; amount_minor_units: number; checkout_url: string | null; checkout_version?: number };

export class SubscriptionError extends Error {
  constructor(public readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 503, public readonly code: string, message: string) { super(message); }
}
const invalid = () => new SubscriptionError(400, "invalid_subscription_request", "Check the subscription request and try again.");
export function requireSubscriptionManager(actor: Actor) {
  if (actor.role !== "owner" && actor.role !== "admin") throw new SubscriptionError(403, "subscription_read_only", "Only owners and admins can manage subscriptions.");
}
function configuration(env: Bindings) {
  if (!["local", "staging"].includes(env.DEPLOYMENT_ENVIRONMENT ?? "local") || env.CATALOGUE_PAYMENT_MODE !== "razorpay-test"
    || !/^rzp_test_[a-zA-Z0-9]{6,40}$/.test(env.CATALOGUE_RAZORPAY_KEY_ID ?? "")
    || (env.CATALOGUE_RAZORPAY_KEY_SECRET?.length ?? 0) < 32
    || (env.CATALOGUE_RAZORPAY_WEBHOOK_SECRET?.length ?? 0) < 32
    || !/^acc_[a-zA-Z0-9]{3,76}$/.test(env.CATALOGUE_RAZORPAY_ACCOUNT_ID ?? ""))
    throw new SubscriptionError(503, "payments_unavailable", "Paid plans are not available yet. You can continue editing your catalogue.");
  return { keyId: env.CATALOGUE_RAZORPAY_KEY_ID!, keySecret: env.CATALOGUE_RAZORPAY_KEY_SECRET!,
    account: env.CATALOGUE_RAZORPAY_ACCOUNT_ID!, secrets: [env.CATALOGUE_RAZORPAY_WEBHOOK_SECRET!, env.CATALOGUE_RAZORPAY_PREVIOUS_WEBHOOK_SECRET].filter((s): s is string => !!s) };
}
function enabled(env: Bindings) { try { configuration(env); return true; } catch { return false; } }
function access(row: Row, now: Date) {
  return hasSubscriptionAccess({ status: row.status, trialStartsAt: row.trial_starts_at, trialEndsAt: row.trial_ends_at,
    periodStartsAt: row.current_period_starts_at, periodEndsAt: row.current_period_ends_at, paidVerified: row.paid_verified === 1 }, now);
}
const actorSql = "EXISTS (SELECT 1 FROM organization_members m JOIN users u ON u.id = m.user_id JOIN organizations o ON o.id = m.organization_id "
  + "WHERE m.organization_id = ? AND m.user_id = ? AND m.status = 'active' AND m.role IN ('owner', 'admin') AND u.status = 'active' "
  + "AND u.deleted_at IS NULL AND o.status = 'active' AND o.deleted_at IS NULL)";
const rowSql = "SELECT s.*, p.name AS plan_name FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id ";

export async function subscriptionRequestBytes(request: Request, max = 16384): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max)) throw new SubscriptionError(413, "request_too_large", "The request is too large.");
  const reader = request.body?.getReader(); if (!reader) throw invalid();
  const buffer = new Uint8Array(max); let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break;
    if (size + part.value.length > max) { await reader.cancel(); throw new SubscriptionError(413, "request_too_large", "The request is too large."); }
    buffer.set(part.value, size); size += part.value.length;
  }} finally { reader.releaseLock(); }
  return buffer.slice(0, size);
}
export async function subscriptionInput(request: Request, keys: string[]) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw invalid();
  const bytes = await subscriptionRequestBytes(request);
  let body: Record<string, unknown>;
  try { body = parseStrictJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)) as Record<string, unknown>; } catch { throw invalid(); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join(",") !== [...keys].sort().join(",")) throw invalid();
  return body;
}

export class SubscriptionService {
  private db: D1Database;
  constructor(private readonly env: Bindings, private readonly fetcher: typeof fetch = fetch) { this.db = env.DB; }
  async summary(tenant: TenantContext, role: string, date = new Date()): Promise<SubscriptionView> {
    const db = this.db, now = date.toISOString(), config = enabled(this.env);
    const results = await db.batch([
      db.prepare(rowSql + "WHERE s.organization_id = ? ORDER BY CASE WHEN s.status IN ('trialing', 'active', 'past_due') THEN 0 WHEN s.paid_verified = 1 AND s.current_period_ends_at > ? THEN 1 ELSE 2 END, s.created_at DESC, s.id DESC LIMIT 1").bind(tenant.organizationId, now),
      db.prepare("SELECT 1 FROM organization_trials WHERE organization_id = ? UNION ALL SELECT 1 FROM subscriptions WHERE organization_id = ? LIMIT 1").bind(tenant.organizationId, tenant.organizationId),
      db.prepare("SELECT (SELECT COUNT(*) FROM catalogue_items i JOIN catalogues c ON c.id = i.catalogue_id WHERE c.organization_id = ? AND i.deleted_at IS NULL AND c.deleted_at IS NULL) AS items, "
        + "(SELECT COUNT(*) FROM categories g JOIN catalogues c ON c.id = g.catalogue_id WHERE c.organization_id = ? AND g.deleted_at IS NULL AND c.deleted_at IS NULL) AS categories, "
        + "(SELECT COALESCE(SUM(byte_size), 0) FROM assets WHERE organization_id = ? AND status = 'ready' AND deleted_at IS NULL) AS storageBytes, "
        + "(SELECT COUNT(*) FROM enquiries WHERE organization_id = ? AND deleted_at IS NULL AND expires_at > ?) AS enquiries")
        .bind(tenant.organizationId, tenant.organizationId, tenant.organizationId, tenant.organizationId, now),
      db.prepare("SELECT c.*, s.version AS checkout_version FROM subscription_checkouts c LEFT JOIN subscriptions s ON s.public_id = c.subscription_public_id WHERE c.organization_id = ? AND c.status IN ('creating', 'ready', 'unknown') LIMIT 1").bind(tenant.organizationId),
      db.prepare("SELECT e.entitlement_key AS key, e.value_type, e.boolean_value, e.integer_value, e.string_value FROM subscriptions s "
        + "JOIN subscription_plans p ON p.id = s.plan_id JOIN plan_entitlements e ON e.plan_id = s.plan_id WHERE s.organization_id = ? AND p.is_active = 1 AND " + subscriptionAccessSql())
        .bind(tenant.organizationId, now, now, now, now),
    ]);
    const row = results[0].results[0] as Row | undefined, checkout = results[3].results[0] as Checkout | undefined;
    const limits: Record<string, boolean | number | string> = {};
    for (const e of results[4].results as Array<{ key: string; value_type: string; boolean_value: number; integer_value: number; string_value: string }>)
      limits[e.key] = e.value_type === "boolean" ? e.boolean_value === 1 : e.value_type === "integer" ? e.integer_value : e.string_value;
    const offers = config ? (await db.prepare("SELECT o.*, p.name FROM subscription_offers o JOIN subscription_plans p ON p.id = o.plan_id "
      + "WHERE o.is_active = 1 AND p.is_active = 1 AND o.mode = 'test' AND o.provider_account_id = ? ORDER BY p.sort_order, o.billing_interval, o.public_id")
      .bind(configuration(this.env).account).all<Offer>()).results : [];
    return { subscription: row ? { id: row.public_id, planName: row.plan_name, status: row.status,
      effectiveStatus: access(row, date) ? row.status : row.status === "trialing" || row.status === "active" ? "expired" : row.status,
      trialEndsAt: row.trial_ends_at, periodEndsAt: row.current_period_ends_at, cancelAtPeriodEnd: row.cancel_at_period_end === 1,
      version: row.version, interval: row.billing_interval, amount: row.amount_minor_units, currency: row.currency_code, provider: !!row.provider_subscription_id } : null,
      trialAvailable: !results[1].results.length && !(await db.prepare("SELECT 1 FROM subscription_plans WHERE code = 'catalogue-trial-14' AND is_active = 0").first()), canManage: role === "owner" || role === "admin", canPublish: await new EntitlementService(db).canPublish(tenant, false, now),
      paymentMode: config ? "test" : "disabled", checkout: checkout ? { id: checkout.public_id, status: checkout.status as "creating" | "ready" | "unknown", subscriptionId: checkout.subscription_public_id, version: checkout.checkout_version ?? null, url: config && (role === "owner" || role === "admin") && checkout.status === "ready" ? checkout.checkout_url : null } : null,
      offers: offers.map(o => ({ id: o.public_id, name: o.name, interval: o.billing_interval, amount: o.amount_minor_units, currency: o.currency_code, cycles: o.total_cycles })),
      usage: results[2].results[0] as SubscriptionView["usage"], limits };
  }

  async startTrial(tenant: TenantContext, actor: Actor, date = new Date()) {
    requireSubscriptionManager(actor);
    const now = date.toISOString(), end = new Date(date.getTime() + TRIAL_DAYS * 86400000).toISOString(), id = createPublicId("sub"), db = this.db;
    const results = await db.batch([
      db.prepare("INSERT INTO subscription_plans (code, name, description, created_at, updated_at) VALUES ('catalogue-trial-14', '14-day trial', 'Catalogue trial; no payment method required', ?, ?) ON CONFLICT(code) DO NOTHING").bind(now, now),
      db.prepare("INSERT INTO plan_entitlements (plan_id, entitlement_key, value_type, boolean_value, created_at, updated_at) "
        + "SELECT id, 'catalogue.publish', 'boolean', 1, ?, ? FROM subscription_plans WHERE code = 'catalogue-trial-14' ON CONFLICT(plan_id, entitlement_key) DO NOTHING").bind(now, now),
      db.prepare("INSERT INTO organization_trials (organization_id, subscription_public_id, started_at, ends_at) SELECT ?, ?, ?, ? WHERE " + actorSql
        + " AND EXISTS (SELECT 1 FROM subscription_plans WHERE code = 'catalogue-trial-14' AND is_active = 1)"
        + " AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE organization_id = ?) ON CONFLICT(organization_id) DO NOTHING")
        .bind(tenant.organizationId, id, now, end, tenant.organizationId, actor.userId, tenant.organizationId),
      db.prepare("INSERT INTO subscriptions (public_id, organization_id, plan_id, status, trial_starts_at, trial_ends_at, created_at, updated_at) "
        + "SELECT ?, ?, p.id, 'trialing', ?, ?, ?, ? FROM subscription_plans p WHERE p.code = 'catalogue-trial-14' AND p.is_active = 1 "
        + "AND EXISTS (SELECT 1 FROM organization_trials WHERE organization_id = ? AND subscription_public_id = ?) AND changes() = 1")
        .bind(id, tenant.organizationId, now, end, now, now, tenant.organizationId, id),
      db.prepare("INSERT INTO subscription_activity (organization_id, subscription_public_id, action, actor_user_id, created_at) SELECT ?, ?, 'trial_started', ?, ? WHERE changes() = 1")
        .bind(tenant.organizationId, id, actor.userId, now),
    ]);
    if (!results[3].meta.changes) throw new SubscriptionError(409, "trial_unavailable", "This workspace has already used its trial or its trial is unavailable. Refresh the subscription page.");
    return this.summary(tenant, actor.role, date);
  }

  async checkout(tenant: TenantContext, actor: Actor, offerId: unknown, requestId: unknown, date = new Date()) {
    requireSubscriptionManager(actor); const config = configuration(this.env), db = this.db, now = date.toISOString();
    if (typeof offerId !== "string" || !/^off_[a-f0-9]{32}$/.test(offerId) || typeof requestId !== "string" || !/^chk_[a-f0-9]{32}$/.test(requestId)) throw invalid();
    const previous = await db.prepare("SELECT * FROM subscription_checkouts WHERE public_id = ? AND organization_id = ?").bind(requestId, tenant.organizationId).first<Checkout>();
    if (previous) { if (previous.offer_public_id !== offerId) throw new SubscriptionError(409, "checkout_conflict", "Refresh the subscription page before choosing a plan."); return this.summary(tenant, actor.role, date); }
    const offer = await db.prepare("SELECT o.*, p.name FROM subscription_offers o JOIN subscription_plans p ON p.id = o.plan_id WHERE o.public_id = ? "
      + "AND o.is_active = 1 AND p.is_active = 1 AND o.mode = 'test' AND o.provider_account_id = ?").bind(offerId, config.account).first<Offer>();
    if (!offer || !/^plan_[a-zA-Z0-9]{1,75}$/.test(offer.provider_plan_id)) throw new SubscriptionError(404, "offer_unavailable", "This plan is unavailable. Refresh the subscription page.");
    const subId = createPublicId("sub");
    try {
      const claimed = await db.prepare("INSERT INTO subscription_checkouts (public_id, organization_id, offer_public_id, subscription_public_id, provider_plan_id, provider_account_id, plan_id, billing_interval, currency_code, amount_minor_units, status, created_at, updated_at) "
        + "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?, ? WHERE " + actorSql
        + " AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.organization_id = ? AND s.status <> 'trialing' AND " + subscriptionAccessSql() + ") "
        + "AND NOT EXISTS (SELECT 1 FROM subscription_checkouts WHERE organization_id = ? AND status IN ('creating', 'ready', 'unknown')) ON CONFLICT(public_id) DO NOTHING")
        .bind(requestId, tenant.organizationId, offerId, subId, offer.provider_plan_id, config.account, offer.plan_id, offer.billing_interval,
          offer.currency_code, offer.amount_minor_units, now, now, tenant.organizationId, actor.userId, tenant.organizationId, now, now, now, now, tenant.organizationId).run();
      if (!claimed.meta.changes) throw new SubscriptionError(409, "checkout_in_progress", "An existing subscription or checkout must finish before starting another. Refresh this page.");
    } catch (e) { if (e instanceof SubscriptionError) throw e; throw new SubscriptionError(409, "checkout_in_progress", "Another checkout is already in progress. Refresh this page."); }
    let created: { id: string; plan_id: string; status: string; short_url: string };
    try {
      const response = await this.provider(config, "/subscriptions", { plan_id: offer.provider_plan_id, total_count: offer.total_cycles,
        quantity: 1, customer_notify: false, notes: { catalogue_checkout: requestId, catalogue_subscription: subId } });
      created = response as typeof created;
      const url = new URL(created.short_url);
      if (!/^sub_[a-zA-Z0-9]{1,75}$/.test(created.id) || created.plan_id !== offer.provider_plan_id || created.status !== "created"
        || url.protocol !== "https:" || url.hostname !== "rzp.io" || url.port || url.username || url.password || url.hash || created.short_url.length > 500) throw new Error();
    } catch {
      await db.prepare("UPDATE subscription_checkouts SET status = 'unknown', updated_at = ? WHERE public_id = ? AND status = 'creating'").bind(now, requestId).run();
      throw new SubscriptionError(503, "checkout_needs_review", "Checkout setup could not be confirmed. Refresh this page; do not start another payment.");
    }
    await db.batch([
      db.prepare("UPDATE subscription_checkouts SET status = 'ready', provider_subscription_id = ?, checkout_url = ?, updated_at = ? WHERE public_id = ? AND status = 'creating'")
        .bind(created.id, created.short_url, now, requestId),
      db.prepare("INSERT INTO subscriptions (public_id, organization_id, plan_id, status, billing_interval, provider, provider_subscription_id, currency_code, amount_minor_units, created_at, updated_at) "
        + "SELECT ?, ?, ?, 'expired', ?, 'razorpay', ?, ?, ?, ?, ? WHERE changes() = 1")
        .bind(subId, tenant.organizationId, offer.plan_id, offer.billing_interval, created.id, offer.currency_code, offer.amount_minor_units, now, now),
      db.prepare("INSERT INTO subscription_activity (organization_id, subscription_public_id, action, actor_user_id, created_at) SELECT ?, ?, 'checkout_created', ?, ? WHERE changes() = 1")
        .bind(tenant.organizationId, subId, actor.userId, now),
    ]);
    return this.summary(tenant, actor.role, date);
  }

  private async provider(config: ReturnType<typeof configuration>, route: string, body: unknown) {
    const response = await this.fetcher("https://api.razorpay.com/v1" + route, { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { Authorization: "Basic " + btoa(config.keyId + ":" + config.keySecret), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("provider_unavailable");
    return await response.json() as Record<string, unknown>;
  }

  async cancel(tenant: TenantContext, actor: Actor, id: unknown, version: unknown, date = new Date()) {
    requireSubscriptionManager(actor);
    if (typeof id !== "string" || !/^sub_[a-f0-9]{32}$/.test(id) || !Number.isSafeInteger(version) || (version as number) < 1) throw invalid();
    const db = this.db, now = date.toISOString();
    const row = await db.prepare(rowSql + "WHERE s.organization_id = ? AND s.public_id = ?").bind(tenant.organizationId, id).first<Row>();
    if (!row) throw new SubscriptionError(404, "subscription_not_found", "This subscription could not be found.");
    if (row.version !== version) throw new SubscriptionError(409, "subscription_changed", "This subscription changed. Refresh before trying again.");
    if (row.cancel_at_period_end === 1 || row.status === "canceled") return this.summary(tenant, actor.role, date);
    if (row.status === "trialing") {
      const results = await db.batch([
        db.prepare("UPDATE subscriptions SET status = 'canceled', canceled_at = ?, version = version + 1, updated_at = ? WHERE public_id = ? AND organization_id = ? AND version = ? AND " + actorSql)
          .bind(now, now, id, tenant.organizationId, version as number, tenant.organizationId, actor.userId),
        db.prepare("INSERT INTO subscription_activity (organization_id, subscription_public_id, action, actor_user_id, created_at) SELECT ?, ?, 'trial_ended', ?, ? WHERE changes() = 1")
          .bind(tenant.organizationId, id, actor.userId, now),
      ]);
      if (!results[0].meta.changes) throw new SubscriptionError(409, "subscription_changed", "Refresh before trying again.");
    } else {
      const config = configuration(this.env);
      const link = await db.prepare("SELECT * FROM subscription_checkouts WHERE subscription_public_id = ? AND organization_id = ? AND provider_account_id = ?")
        .bind(id, tenant.organizationId, config.account).first<Checkout>();
      if (!row.provider_subscription_id || !link || !["ready", "closed"].includes(link.status)) throw new SubscriptionError(409, "subscription_not_cancelable", "This subscription cannot be changed here.");
      const atEnd = row.paid_verified === 1 && access(row, date);
      let reply: Record<string, unknown>;
      try { reply = await this.provider(config, "/subscriptions/" + row.provider_subscription_id + "/cancel", { cancel_at_cycle_end: atEnd }); }
      catch { throw new SubscriptionError(503, "cancellation_unconfirmed", "Cancellation could not be confirmed. Refresh the status before trying again."); }
      if (reply.id !== row.provider_subscription_id || reply.plan_id !== link.provider_plan_id || (!atEnd && reply.status !== "cancelled")
        || (atEnd && reply.status !== "active" && reply.status !== "pending" && reply.status !== "halted" && reply.status !== "cancelled"))
        throw new SubscriptionError(503, "cancellation_unconfirmed", "Cancellation could not be confirmed. Refresh the status before trying again.");
      // Acknowledge cancellation only; provider replies never create or extend paid access.
      await db.batch([
        db.prepare("UPDATE subscriptions SET cancel_at_period_end = 1, canceled_at = ?, provider_terminal_at = CASE WHEN ? = 0 THEN ? ELSE provider_terminal_at END, "
          + "status = CASE WHEN ? = 0 THEN 'canceled' ELSE status END, version = version + 1, updated_at = ? WHERE public_id = ? AND organization_id = ? AND " + actorSql)
          .bind(now, atEnd ? 1 : 0, Math.floor(date.getTime() / 1000), atEnd ? 1 : 0, now, id, tenant.organizationId, tenant.organizationId, actor.userId),
        db.prepare("UPDATE subscription_checkouts SET status = 'closed', updated_at = ? WHERE subscription_public_id = ? AND changes() = 1").bind(now, id),
        db.prepare("INSERT INTO subscription_activity (organization_id, subscription_public_id, action, actor_user_id, created_at) SELECT ?, ?, 'cancel_requested', ?, ? WHERE changes() = 1")
          .bind(tenant.organizationId, id, actor.userId, now),
      ]);
    }
    return this.summary(tenant, actor.role, date);
  }

  async webhook(request: Request, date = new Date()) {
    const config = configuration(this.env), db = this.db;
    const bytes = await subscriptionRequestBytes(request, 131072);
    if (!await webhookSignatureValid(bytes, request.headers.get("X-Razorpay-Signature"), config.secrets))
      throw new SubscriptionError(401, "invalid_webhook_signature", "The webhook could not be verified.");
    const eventId = request.headers.get("X-Razorpay-Event-Id");
    if (!eventId || !/^[a-zA-Z0-9_-]{1,255}$/.test(eventId)) throw invalid();
    let event: { account_id: string; event: string; created_at: number; payload?: { subscription?: { entity?: Record<string, unknown> }; payment?: { entity?: Record<string, unknown> } } };
    try { event = parseStrictJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)) as typeof event; } catch { throw invalid(); }
    if (!event || event.account_id !== config.account || typeof event.event !== "string" || !/^[a-z.]{1,160}$/.test(event.event)
      || !Number.isSafeInteger(event.created_at) || event.created_at <= 0 || event.created_at > Math.floor(date.getTime() / 1000) + 300) throw invalid();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes))), n => n.toString(16).padStart(2, "0")).join("");
    const existing = await db.prepare("SELECT payload_sha256, status FROM payment_webhook_events WHERE provider = 'razorpay' AND event_id = ?").bind(eventId).first<{ payload_sha256: string; status: string }>();
    if (existing) { if (existing.payload_sha256 !== hash) throw new SubscriptionError(409, "webhook_event_conflict", "The webhook event conflicts with a previous delivery."); return { duplicate: true }; }
    const entity = event.payload?.subscription?.entity, payment = event.payload?.payment?.entity;
    const link = typeof entity?.id === "string" ? await db.prepare("SELECT * FROM subscription_checkouts WHERE provider_subscription_id = ? AND provider_account_id = ?")
      .bind(entity.id, config.account).first<Checkout>() : null;
    const now = date.toISOString(), recognized = ["subscription.charged", "subscription.pending", "subscription.halted", "subscription.paused", "subscription.cancelled", "subscription.completed", "subscription.expired"].includes(event.event);
    // Unknown IDs can be legitimate deliveries during provider creation. Retry instead of permanently losing them.
    if (recognized && !link) throw new SubscriptionError(503, "webhook_mapping_pending", "The subscription mapping is not ready. Retry this delivery.");
    if (link && entity?.plan_id !== link.provider_plan_id) throw invalid();
    const statements: D1PreparedStatement[] = [db.prepare("INSERT INTO payment_webhook_events (provider, event_id, event_type, payload_sha256, status, received_at, processed_at) "
      + "VALUES ('razorpay', ?, ?, ?, ?, ?, ?) ON CONFLICT(provider, event_id) DO NOTHING").bind(eventId, event.event, hash, recognized ? "processed" : "ignored", now, now)];
    const gate = "EXISTS (SELECT 1 FROM payment_webhook_events WHERE provider = 'razorpay' AND event_id = ? AND payload_sha256 = ?)";
    if (link && recognized) {
      const row = await db.prepare(rowSql + "WHERE s.public_id = ? AND s.organization_id = ?").bind(link.subscription_public_id, link.organization_id).first<Row>();
      if (!row) throw new SubscriptionError(503, "webhook_mapping_pending", "The subscription mapping is not ready. Retry this delivery.");
      if (event.event === "subscription.charged") {
        const start = entity!.current_start, end = entity!.current_end;
        if (!payment || typeof payment.id !== "string" || !/^pay_[a-zA-Z0-9]{1,75}$/.test(payment.id) || payment.status !== "captured"
          || payment.amount !== link.amount_minor_units || payment.currency !== link.currency_code || Number(payment.amount_refunded ?? 0) !== 0
          || entity!.quantity !== 1 || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || (start as number) <= 0 || (end as number) <= (start as number)
          || (start as number) > Math.floor(date.getTime() / 1000) + 300 || (end as number) - (start as number) > (link.billing_interval === "monthly" ? 35 : 370) * 86400) throw invalid();
        const begins = new Date((start as number) * 1000).toISOString(), ends = new Date((end as number) * 1000).toISOString();
        const paid = await db.prepare("SELECT subscription_id, period_starts_at, period_ends_at FROM subscription_payments WHERE provider = 'razorpay' AND payment_id = ?")
          .bind(payment.id).first<{ subscription_id: number; period_starts_at: string; period_ends_at: string }>();
        if (paid && (paid.subscription_id !== row.id || paid.period_starts_at !== begins || paid.period_ends_at !== ends)) throw new SubscriptionError(409, "payment_conflict", "This payment conflicts with an earlier delivery.");
        statements.push(db.prepare("INSERT INTO subscription_payments (provider, payment_id, subscription_id, event_id, amount_minor_units, currency_code, period_starts_at, period_ends_at, created_at) "
          + "SELECT 'razorpay', ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1 AND " + gate + " ON CONFLICT(provider, payment_id) DO NOTHING")
          .bind(payment.id, row.id, eventId, link.amount_minor_units, link.currency_code, begins, ends, now, eventId, hash));
        // Supersede a trial/expired current record only when this charge is new, mapped and eligible.
        const eligible = "EXISTS (SELECT 1 FROM subscriptions target WHERE target.id = ? AND (target.provider_terminal_at IS NULL OR ? <= target.provider_terminal_at) "
          + "AND (target.current_period_ends_at IS NULL OR target.current_period_ends_at < ?) AND NOT EXISTS (SELECT 1 FROM subscriptions other "
          + "WHERE other.organization_id = target.organization_id AND other.id <> target.id AND other.paid_verified = 1 AND other.current_period_ends_at > ?))";
        statements.push(db.prepare("UPDATE subscriptions SET status = 'expired', version = version + 1, updated_at = ? WHERE organization_id = ? AND id <> ? "
          + "AND status IN ('trialing', 'active', 'past_due') AND changes() = 1 AND " + eligible).bind(now, link.organization_id, row.id, row.id, start as number, ends, begins));
        // Do not depend on changes() from expiring an optional trial. The new payment's event ID is the atomic gate.
        statements.push(db.prepare("UPDATE subscriptions SET status = CASE WHEN provider_terminal_at IS NOT NULL THEN 'canceled' WHEN provider_event_at > ? AND status = 'past_due' THEN 'past_due' ELSE 'active' END, "
          + "paid_verified = 1, current_period_starts_at = ?, current_period_ends_at = ?, provider_event_at = MAX(provider_event_at, ?), version = version + 1, updated_at = ? "
          + "WHERE id = ? AND " + eligible + " AND EXISTS (SELECT 1 FROM subscription_payments WHERE provider = 'razorpay' AND payment_id = ? AND event_id = ? AND period_starts_at = ? AND period_ends_at = ?) AND " + gate)
          .bind(event.created_at, begins, ends, event.created_at, now, row.id, row.id, start as number, ends, begins, payment.id, eventId, begins, ends, eventId, hash));
      } else {
        const terminal = ["subscription.cancelled", "subscription.completed", "subscription.expired"].includes(event.event);
        statements.push(db.prepare("UPDATE subscriptions SET status = ?, cancel_at_period_end = CASE WHEN ? = 1 THEN 1 ELSE cancel_at_period_end END, "
          + "provider_terminal_at = CASE WHEN ? = 1 THEN MIN(COALESCE(provider_terminal_at, ?), ?) ELSE provider_terminal_at END, provider_event_at = ?, version = version + 1, updated_at = ? "
          + "WHERE id = ? AND provider_event_at <= ? AND (provider_terminal_at IS NULL OR ? = 1) AND changes() = 1 AND " + gate)
          .bind(terminal ? "canceled" : "past_due", terminal ? 1 : 0, terminal ? 1 : 0, event.created_at, event.created_at, event.created_at, now, row.id, event.created_at, terminal ? 1 : 0, eventId, hash));
      }
      statements.push(db.prepare("INSERT INTO subscription_activity (organization_id, subscription_public_id, action, event_id, created_at) SELECT ?, ?, 'provider_event', ?, ? "
        + "WHERE changes() = 1 ON CONFLICT(action, event_id) DO NOTHING").bind(link.organization_id, row.public_id, eventId, now));
      statements.push(db.prepare("UPDATE subscription_checkouts SET status = 'closed', checkout_url = NULL, updated_at = ? WHERE public_id = ? "
        + "AND EXISTS (SELECT 1 FROM subscriptions WHERE public_id = ? AND (paid_verified = 1 OR provider_terminal_at IS NOT NULL)) AND " + gate)
        .bind(now, link.public_id, row.public_id, eventId, hash));
    }
    await db.batch(statements);
    const committed = await db.prepare("SELECT payload_sha256 FROM payment_webhook_events WHERE provider = 'razorpay' AND event_id = ?").bind(eventId).first<{ payload_sha256: string }>();
    if (committed?.payload_sha256 !== hash) throw new SubscriptionError(409, "webhook_event_conflict", "The webhook event conflicts with a previous delivery.");
    return { duplicate: false };
  }
}
