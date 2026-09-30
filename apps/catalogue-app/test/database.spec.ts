import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const now = "2026-09-30T11:30:00.000Z";

describe("identity and tenancy schema", () => {
  it("creates the expected foundation tables", async () => {
    const result = await env.DB.prepare(
      `SELECT name
       FROM sqlite_schema
       WHERE type = 'table'
         AND name IN (
           'users',
           'sessions',
           'organizations',
           'organization_members',
           'business_profiles',
           'd1_migrations'
         )
       ORDER BY name`,
    ).all<{ name: string }>();

    expect(result.results.map((row) => row.name)).toEqual([
      "business_profiles",
      "d1_migrations",
      "organization_members",
      "organizations",
      "sessions",
      "users",
    ]);
  });

  it("enforces case-insensitive unique user emails", async () => {
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
        1001,
        "usr_test_1001",
        "owner@example.com",
        "test-password-hash",
        "Owner",
        "active",
        now,
        now,
      )
      .run();

    await expect(
      env.DB.prepare(
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
          1002,
          "usr_test_1002",
          "OWNER@example.com",
          "another-test-password-hash",
          "Duplicate Owner",
          "active",
          now,
          now,
        )
        .run(),
    ).rejects.toThrow();
  });

  it("enforces membership uniqueness and tenant cascades", async () => {
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
        2001,
        "usr_test_2001",
        "tenant-owner@example.com",
        "test-password-hash",
        "Tenant Owner",
        "active",
        now,
        now,
      )
      .run();

    await env.DB.prepare(
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
    )
      .bind(
        3001,
        "org_test_3001",
        "Test Organisation",
        "IN",
        "Asia/Kolkata",
        "active",
        now,
        now,
      )
      .run();

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
        4001,
        "mem_test_4001",
        3001,
        2001,
        "owner",
        "active",
        now,
        now,
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO business_profiles (
         organization_id,
         legal_or_display_name,
         country_code,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(3001, "Test Organisation", "IN", now, now)
      .run();

    await expect(
      env.DB.prepare(
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
          4002,
          "mem_test_4002",
          3001,
          2001,
          "editor",
          "active",
          now,
          now,
        )
        .run(),
    ).rejects.toThrow();

    await env.DB.prepare(
      "DELETE FROM organizations WHERE id = ?",
    )
      .bind(3001)
      .run();

    const membership = await env.DB.prepare(
      "SELECT id FROM organization_members WHERE organization_id = ?",
    )
      .bind(3001)
      .first();

    const profile = await env.DB.prepare(
      "SELECT organization_id FROM business_profiles WHERE organization_id = ?",
    )
      .bind(3001)
      .first();

    expect(membership).toBeNull();
    expect(profile).toBeNull();
  });
});
