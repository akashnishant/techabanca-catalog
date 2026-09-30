import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { tenantContextFromResolvedMembership } from "@techabanca/domain";
import { SubscriptionRepository } from "../src/worker/repositories";
import { EntitlementService } from "../src/worker/services/entitlement-service";

const now = "2026-09-30T15:30:00.000Z";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM organization_usage"),
    env.DB.prepare("DELETE FROM payment_webhook_events"),
    env.DB.prepare("DELETE FROM subscriptions"),
    env.DB.prepare("DELETE FROM plan_entitlements"),
    env.DB.prepare("DELETE FROM subscription_plans"),
    env.DB.prepare("DELETE FROM business_profiles"),
    env.DB.prepare("DELETE FROM organization_members"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM organizations"),
    env.DB.prepare("DELETE FROM users"),
  ]);
}

async function createOrganization(
  id: number,
  publicId: string,
  name: string,
) {
  await env.DB.prepare(
    `INSERT INTO organizations (
       id,
       public_id,
       name,
       country_code,
       timezone,
       status,
       business_type_id,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      publicId,
      name,
      "IN",
      "Asia/Kolkata",
      "active",
      1,
      now,
      now,
    )
    .run();
}

async function createPlan(
  id: number,
  code: string,
  name: string,
) {
  await env.DB.prepare(
    `INSERT INTO subscription_plans (
       id,
       code,
       name,
       is_active,
       sort_order,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, code, name, 1, id, now, now)
    .run();
}

async function createSubscription(input: {
  id: number;
  publicId: string;
  organizationId: number;
  planId: number;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
}) {
  await env.DB.prepare(
    `INSERT INTO subscriptions (
       id,
       public_id,
       organization_id,
       plan_id,
       status,
       billing_interval,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.publicId,
      input.organizationId,
      input.planId,
      input.status,
      "monthly",
      now,
      now,
    )
    .run();
}

describe("subscription and entitlement foundation", () => {
  beforeEach(async () => {
    await resetFixture();
  });

  it("enforces typed plan entitlement values", async () => {
    await createPlan(70101, "starter-test", "Starter Test");

    await expect(
      env.DB.prepare(
        `INSERT INTO plan_entitlements (
           plan_id,
           entitlement_key,
           value_type,
           boolean_value,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          70101,
          "documents.enabled",
          "boolean",
          1,
          now,
          now,
        )
        .run(),
    ).resolves.toBeDefined();

    await expect(
      env.DB.prepare(
        `INSERT INTO plan_entitlements (
           plan_id,
           entitlement_key,
           value_type,
           boolean_value,
           integer_value,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          70101,
          "invalid.mixed",
          "boolean",
          1,
          25,
          now,
          now,
        )
        .run(),
    ).rejects.toThrow();
  });

  it("enforces one current subscription per organization", async () => {
    await createOrganization(
      70201,
      "org_11111111111111111111111111111111",
      "Single Subscription Org",
    );
    await createPlan(70202, "growth-test", "Growth Test");

    await createSubscription({
      id: 70203,
      publicId: "sub_22222222222222222222222222222222",
      organizationId: 70201,
      planId: 70202,
      status: "active",
    });

    await expect(
      createSubscription({
        id: 70204,
        publicId: "sub_33333333333333333333333333333333",
        organizationId: 70201,
        planId: 70202,
        status: "trialing",
      }),
    ).rejects.toThrow();

    await env.DB.prepare(
      `UPDATE subscriptions
       SET status = 'canceled',
           canceled_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
      .bind(now, now, 70203)
      .run();

    await expect(
      createSubscription({
        id: 70205,
        publicId: "sub_44444444444444444444444444444444",
        organizationId: 70201,
        planId: 70202,
        status: "active",
      }),
    ).resolves.toBeUndefined();
  });

  it("resolves typed entitlements through the central service", async () => {
    await createOrganization(
      70301,
      "org_55555555555555555555555555555555",
      "Entitlement Org",
    );
    await createPlan(70302, "business-test", "Business Test");

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO plan_entitlements (
           plan_id,
           entitlement_key,
           value_type,
           boolean_value,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        70302,
        "documents.enabled",
        "boolean",
        1,
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO plan_entitlements (
           plan_id,
           entitlement_key,
           value_type,
           integer_value,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        70302,
        "items.max",
        "integer",
        250,
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO plan_entitlements (
           plan_id,
           entitlement_key,
           value_type,
           string_value,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        70302,
        "analytics.level",
        "string",
        "advanced",
        now,
        now,
      ),
    ]);

    await createSubscription({
      id: 70303,
      publicId: "sub_66666666666666666666666666666666",
      organizationId: 70301,
      planId: 70302,
      status: "active",
    });

    const tenant = tenantContextFromResolvedMembership({
      organizationId: 70301,
      organizationPublicId: "org_55555555555555555555555555555555",
    });
    const service = new EntitlementService(env.DB);

    await expect(
      service.isEnabled(tenant, "documents.enabled"),
    ).resolves.toBe(true);

    await expect(
      service.getIntegerLimit(tenant, "items.max"),
    ).resolves.toBe(250);

    await expect(
      service.get(tenant, "analytics.level"),
    ).resolves.toBe("advanced");

    await expect(
      service.getIntegerLimit(tenant, "documents.enabled"),
    ).resolves.toBeNull();
  });

  it("does not grant entitlements without an active or trialing subscription", async () => {
    await createOrganization(
      70401,
      "org_77777777777777777777777777777777",
      "Past Due Org",
    );
    await createPlan(70402, "past-due-test", "Past Due Test");

    await env.DB.prepare(
      `INSERT INTO plan_entitlements (
         plan_id,
         entitlement_key,
         value_type,
         boolean_value,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        70402,
        "documents.enabled",
        "boolean",
        1,
        now,
        now,
      )
      .run();

    await createSubscription({
      id: 70403,
      publicId: "sub_88888888888888888888888888888888",
      organizationId: 70401,
      planId: 70402,
      status: "past_due",
    });

    const tenant = tenantContextFromResolvedMembership({
      organizationId: 70401,
      organizationPublicId: "org_77777777777777777777777777777777",
    });
    const service = new EntitlementService(env.DB);

    await expect(
      service.isEnabled(tenant, "documents.enabled"),
    ).resolves.toBe(false);

    await expect(
      service.get(tenant, "documents.enabled"),
    ).resolves.toBeNull();
  });

  it("keeps subscription repository reads inside the resolved tenant", async () => {
    await createOrganization(
      70501,
      "org_99999999999999999999999999999999",
      "Subscription Org A",
    );
    await createOrganization(
      70502,
      "org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "Subscription Org B",
    );
    await createPlan(70503, "tenant-test", "Tenant Test");

    await createSubscription({
      id: 70504,
      publicId: "sub_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      organizationId: 70501,
      planId: 70503,
      status: "active",
    });
    await createSubscription({
      id: 70505,
      publicId: "sub_cccccccccccccccccccccccccccccccc",
      organizationId: 70502,
      planId: 70503,
      status: "trialing",
    });

    const tenantA = tenantContextFromResolvedMembership({
      organizationId: 70501,
      organizationPublicId: "org_99999999999999999999999999999999",
    });

    const repository = new SubscriptionRepository(env.DB);

    await expect(repository.findCurrent(tenantA)).resolves.toMatchObject({
      publicId: "sub_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      planCode: "tenant-test",
      status: "active",
    });
  });

  it("deduplicates provider webhook events", async () => {
    const statement = env.DB.prepare(
      `INSERT INTO payment_webhook_events (
         provider,
         event_id,
         event_type,
         payload_sha256,
         status,
         received_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    );

    await expect(
      statement
        .bind(
          "razorpay",
          "evt_test_001",
          "subscription.activated",
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "received",
          now,
        )
        .run(),
    ).resolves.toBeDefined();

    await expect(
      statement
        .bind(
          "razorpay",
          "evt_test_001",
          "subscription.activated",
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "received",
          now,
        )
        .run(),
    ).rejects.toThrow();
  });

  it("tracks non-negative organization usage", async () => {
    await createOrganization(
      70601,
      "org_dddddddddddddddddddddddddddddddd",
      "Usage Org",
    );

    await expect(
      env.DB.prepare(
        `INSERT INTO organization_usage (
           organization_id,
           usage_key,
           quantity,
           updated_at
         ) VALUES (?, ?, ?, ?)`,
      )
        .bind(70601, "items.count", 42, now)
        .run(),
    ).resolves.toBeDefined();

    await expect(
      env.DB.prepare(
        `UPDATE organization_usage
         SET quantity = ?,
             updated_at = ?
         WHERE organization_id = ?
           AND usage_key = ?`,
      )
        .bind(-1, now, 70601, "items.count")
        .run(),
    ).rejects.toThrow();
  });
});
