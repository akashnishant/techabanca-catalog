import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import app from "../src";
import { createFixture } from "./fixtures";
import { PublicRepository } from "../src/repository";
it("blocks expired trial pages and private assets on an already active route", async () => {
  const f = await createFixture(), end = new Date(Date.now() - 1000).toISOString(), start = new Date(Date.now() - 15 * 86400000).toISOString();
  expect((await app.request(f.origin + "/", {}, env)).status).toBe(200);
  await env.DB.prepare("UPDATE subscriptions SET trial_starts_at = ?, trial_ends_at = ? WHERE organization_id = ?").bind(start, end, f.n).run();
  for (const path of ["/", "/catalogue", "/contact", "/items/precision-pump", "/media/" + f.publicationId + "/" + f.documentId])
    expect((await app.request(f.origin + path, {}, env)).status).toBe(404);
  expect(await new PublicRepository(env.DB, true).site(f.slug)).toBeNull();
});
it("closes an expired verified paid period without changing its published snapshot", async () => {
  const f = await createFixture(), begin = new Date(Date.now() - 86400000).toISOString(), end = new Date(Date.now() + 60000).toISOString();
  await env.DB.prepare("UPDATE subscriptions SET status = 'canceled', paid_verified = 1, current_period_starts_at = ?, current_period_ends_at = ? WHERE organization_id = ?").bind(begin, end, f.n).run();
  expect((await app.request(f.origin + "/", {}, env)).status).toBe(200);
  await env.DB.prepare("UPDATE subscriptions SET current_period_ends_at = ? WHERE organization_id = ?").bind(new Date(Date.now() - 1000).toISOString(), f.n).run();
  expect((await app.request(f.origin + "/", {}, env)).status).toBe(404);
  expect((await env.DB.prepare("SELECT state FROM catalogue_publications WHERE id = ?").bind(f.n).first<{ state: string }>())!.state).toBe("active");
});
it("permits legacy no-subscription fixtures only with the local policy, never staging", async () => {
  const f = await createFixture(); await env.DB.prepare("DELETE FROM subscriptions WHERE organization_id = ?").bind(f.n).run();
  expect((await app.request(f.origin + "/", {}, env)).status).toBe(200);
  const origin = "https://" + f.slug + ".catalogue-preview.techabanca.com";
  expect((await app.request(origin + "/", {}, { ...env, DEPLOYMENT_ENVIRONMENT: "staging" })).status).toBe(404);
});
it("refuses a disabled plan and an unbounded subscription", async () => {
  const f = await createFixture(); await env.DB.prepare("UPDATE subscription_plans SET is_active = 0 WHERE id = ?").bind(f.n).run();
  expect((await app.request(f.origin + "/", {}, env)).status).toBe(404);
  await env.DB.prepare("UPDATE subscription_plans SET is_active = 1 WHERE id = ?").bind(f.n).run();
  await env.DB.prepare("UPDATE subscriptions SET trial_ends_at = NULL WHERE organization_id = ?").bind(f.n).run();
  expect((await app.request(f.origin + "/", {}, env)).status).toBe(404);
});

it("never restores local free access after a consumed trial subscription is removed", async () => {
  const f = await createFixture(), start = new Date(Date.now() - 15 * 86400000).toISOString(), end = new Date(Date.now() - 86400000).toISOString();
  await env.DB.prepare("INSERT INTO organization_trials (organization_id, subscription_public_id, started_at, ends_at) VALUES (?, ?, ?, ?)").bind(f.n, "sub_" + f.n.toString(16).padStart(32, "0"), start, end).run();
  await env.DB.prepare("DELETE FROM subscriptions WHERE organization_id = ?").bind(f.n).run();
  expect((await app.request(f.origin + "/", {}, env)).status).toBe(404);
});
