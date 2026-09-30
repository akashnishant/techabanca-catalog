import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  BusinessProfileRepository,
  TenantAccessRepository,
} from "../src/worker/repositories";

const now = "2026-09-30T12:00:00.000Z";

async function resetTenantFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM business_profiles"),
    env.DB.prepare("DELETE FROM organization_members"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM organizations"),
    env.DB.prepare("DELETE FROM users"),
  ]);
}

async function seedTenantFixture() {
  await env.DB.prepare(
    `INSERT INTO users (
       id,
       public_id,
       email,
       password_hash,
       display_name,
       status,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      9101,
      "usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "tenant-scope@example.com",
      "test-password-hash",
      "Tenant Scope User",
      "active",
      now,
      now,
    )
    .run();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO organizations (
         id,
         public_id,
         name,
         country_code,
         timezone,
         status,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      9201,
      "org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "Accessible Organisation",
      "IN",
      "Asia/Kolkata",
      "active",
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO organizations (
         id,
         public_id,
         name,
         country_code,
         timezone,
         status,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      9202,
      "org_cccccccccccccccccccccccccccccccc",
      "Other Organisation",
      "IN",
      "Asia/Kolkata",
      "active",
      now,
      now,
    ),
  ]);

  await env.DB.prepare(
    `INSERT INTO organization_members (
       id,
       public_id,
       organization_id,
       user_id,
       role,
       status,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      9301,
      "mem_dddddddddddddddddddddddddddddddd",
      9201,
      9101,
      "owner",
      "active",
      now,
      now,
    )
    .run();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO business_profiles (
         organization_id,
         legal_or_display_name,
         email,
         city,
         country_code,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      9201,
      "Accessible Organisation",
      "accessible@example.com",
      "Mumbai",
      "IN",
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO business_profiles (
         organization_id,
         legal_or_display_name,
         email,
         city,
         country_code,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      9202,
      "Other Organisation",
      "other@example.com",
      "Pune",
      "IN",
      now,
      now,
    ),
  ]);
}

describe("tenant-scoped repository foundations", () => {
  beforeEach(async () => {
    await resetTenantFixture();
  });

  it("resolves only organizations with an active membership", async () => {
    await seedTenantFixture();

    const tenantAccess = new TenantAccessRepository(env.DB);

    const allowed = await tenantAccess.resolveForUser(
      9101,
      "org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );

    const denied = await tenantAccess.resolveForUser(
      9101,
      "org_cccccccccccccccccccccccccccccccc",
    );

    expect(allowed?.organizationId).toBe(9201);
    expect(allowed?.organizationPublicId).toBe(
      "org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    expect(denied).toBeNull();
  });

  it("uses the resolved tenant context for profile reads", async () => {
    await seedTenantFixture();

    const tenantAccess = new TenantAccessRepository(env.DB);
    const profiles = new BusinessProfileRepository(env.DB);

    const tenant = await tenantAccess.resolveForUser(
      9101,
      "org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );

    expect(tenant).not.toBeNull();

    if (!tenant) {
      throw new Error("Expected an accessible tenant.");
    }

    const profile = await profiles.findByTenant(tenant);

    expect(profile).toMatchObject({
      organizationId: 9201,
      legalOrDisplayName: "Accessible Organisation",
      email: "accessible@example.com",
      city: "Mumbai",
      countryCode: "IN",
    });
    expect(profile?.legalOrDisplayName).not.toBe("Other Organisation");
  });
});
