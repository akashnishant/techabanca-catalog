import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SessionRepository,
  TenantAccessRepository,
  UserAuthRepository,
} from "../src/worker/repositories";
import { PasswordHasher } from "../src/worker/security/password-hasher";
import {
  generateSessionToken,
  hashSessionToken,
  isSessionToken,
} from "../src/worker/security/session-token";
import { AuthSessionService } from "../src/worker/services/auth-session-service";

const now = new Date("2026-09-30T16:30:00.000Z");
const nowText = now.toISOString();

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM business_profiles"),
    env.DB.prepare("DELETE FROM organization_members"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM organizations"),
    env.DB.prepare("DELETE FROM users"),
  ]);
}

async function createUser(input: {
  id: number;
  publicId: string;
  email: string;
  passwordHash: string;
  displayName?: string;
  status?: "active" | "suspended";
  deletedAt?: string | null;
}) {
  await env.DB.prepare(
    `INSERT INTO users (
       id,
       public_id,
       email,
       password_hash,
       display_name,
       status,
       created_at,
       updated_at,
       deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.publicId,
      input.email,
      input.passwordHash,
      input.displayName ?? "Auth Test User",
      input.status ?? "active",
      nowText,
      nowText,
      input.deletedAt ?? null,
    )
    .run();
}

async function createOrganization(input: {
  id: number;
  publicId: string;
  name: string;
}) {
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
      input.id,
      input.publicId,
      input.name,
      "IN",
      "Asia/Kolkata",
      "active",
      nowText,
      nowText,
    )
    .run();
}

async function createMembership(input: {
  id: number;
  publicId: string;
  organizationId: number;
  userId: number;
  role: "owner" | "admin" | "editor";
  status?: "active" | "invited" | "suspended";
}) {
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
      input.id,
      input.publicId,
      input.organizationId,
      input.userId,
      input.role,
      input.status ?? "active",
      nowText,
      nowText,
    )
    .run();
}

describe("authentication foundation", () => {
  beforeEach(async () => {
    await resetFixture();
  });

  it("hashes and verifies passwords without storing plaintext", async () => {
    const hasher = new PasswordHasher();
    const password = "Correct Horse Battery Staple! 42";
    const encoded = await hasher.hash(password);

    expect(encoded).not.toContain(password);
    expect(encoded).toMatch(
      /^pbkdf2-sha256\$600000\$[0-9a-f]{32}\$[0-9a-f]{64}$/,
    );
    await expect(
      hasher.verify(password, encoded),
    ).resolves.toBe(true);
    await expect(
      hasher.verify("wrong password", encoded),
    ).resolves.toBe(false);
    await expect(
      hasher.verify(password, "invalid"),
    ).resolves.toBe(false);
  });

  it("generates opaque session tokens and deterministic SHA-256 hashes", async () => {
    const first = generateSessionToken();
    const second = generateSessionToken();

    expect(isSessionToken(first)).toBe(true);
    expect(isSessionToken(second)).toBe(true);
    expect(first).not.toBe(second);

    const firstHash = await hashSessionToken(first);

    expect(firstHash).toMatch(/^[0-9a-f]{64}$/);
    expect(firstHash).not.toBe(first);
    await expect(
      hashSessionToken(first),
    ).resolves.toBe(firstHash);
  });

  it("finds only active non-deleted users by normalized email", async () => {
    const hasher = new PasswordHasher();
    const hash = await hasher.hash("A secure test password 123!");

    await createUser({
      id: 90101,
      publicId: "usr_11111111111111111111111111111111",
      email: "owner@example.com",
      passwordHash: hash,
    });
    await createUser({
      id: 90102,
      publicId: "usr_22222222222222222222222222222222",
      email: "suspended@example.com",
      passwordHash: hash,
      status: "suspended",
    });
    await createUser({
      id: 90103,
      publicId: "usr_33333333333333333333333333333333",
      email: "deleted@example.com",
      passwordHash: hash,
      deletedAt: nowText,
    });

    const repository = new UserAuthRepository(env.DB);

    await expect(
      repository.findActiveByEmail("  OWNER@EXAMPLE.COM "),
    ).resolves.toMatchObject({
      id: 90101,
      email: "owner@example.com",
    });

    await expect(
      repository.findActiveByEmail("suspended@example.com"),
    ).resolves.toBeNull();

    await expect(
      repository.findActiveById(90103),
    ).resolves.toBeNull();
  });

  it("stores only session-token hashes and authenticates active sessions", async () => {
    const hasher = new PasswordHasher();
    const passwordHash = await hasher.hash(
      "A different secure test password 456!",
    );

    await createUser({
      id: 90201,
      publicId: "usr_44444444444444444444444444444444",
      email: "session@example.com",
      passwordHash,
      displayName: "Session User",
    });

    const repository = new SessionRepository(env.DB);
    const service = new AuthSessionService(
      repository,
      60 * 60,
    );

    const created = await service.create(90201, now);

    const stored = await env.DB.prepare(
      `SELECT token_hash
       FROM sessions
       WHERE public_id = ?`,
    )
      .bind(created.sessionPublicId)
      .first<{ token_hash: string }>();

    expect(stored).not.toBeNull();
    expect(stored?.token_hash).not.toBe(created.token);
    await expect(
      hashSessionToken(created.token),
    ).resolves.toBe(stored?.token_hash);

    await expect(
      service.authenticate(
        created.token,
        new Date(now.getTime() + 30 * 60 * 1000),
      ),
    ).resolves.toMatchObject({
      userId: 90201,
      userPublicId: "usr_44444444444444444444444444444444",
      email: "session@example.com",
      displayName: "Session User",
    });

    await expect(
      service.authenticate(
        created.token,
        new Date(now.getTime() + 2 * 60 * 60 * 1000),
      ),
    ).resolves.toBeNull();
  });

  it("revokes sessions only for their owning user", async () => {
    const hasher = new PasswordHasher();
    const hash = await hasher.hash("Revocation test password 789!");

    await createUser({
      id: 90301,
      publicId: "usr_55555555555555555555555555555555",
      email: "revoke@example.com",
      passwordHash: hash,
    });
    await createUser({
      id: 90302,
      publicId: "usr_66666666666666666666666666666666",
      email: "other@example.com",
      passwordHash: hash,
    });

    const repository = new SessionRepository(env.DB);
    const service = new AuthSessionService(repository);

    const created = await service.create(90301, now);

    await expect(
      service.revoke(
        90302,
        created.sessionPublicId,
        new Date(now.getTime() + 1000),
      ),
    ).resolves.toBe(false);

    await expect(
      service.authenticate(
        created.token,
        new Date(now.getTime() + 2000),
      ),
    ).resolves.not.toBeNull();

    await expect(
      service.revoke(
        90301,
        created.sessionPublicId,
        new Date(now.getTime() + 3000),
      ),
    ).resolves.toBe(true);

    await expect(
      service.authenticate(
        created.token,
        new Date(now.getTime() + 4000),
      ),
    ).resolves.toBeNull();
  });

  it("resolves active tenant membership together with its role", async () => {
    const hasher = new PasswordHasher();
    const hash = await hasher.hash("Tenant test password 123!");

    await createUser({
      id: 90401,
      publicId: "usr_77777777777777777777777777777777",
      email: "tenant@example.com",
      passwordHash: hash,
    });

    await createOrganization({
      id: 90411,
      publicId: "org_88888888888888888888888888888888",
      name: "Tenant A",
    });
    await createOrganization({
      id: 90412,
      publicId: "org_99999999999999999999999999999999",
      name: "Tenant B",
    });

    await createMembership({
      id: 90421,
      publicId: "mem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      organizationId: 90411,
      userId: 90401,
      role: "owner",
    });
    await createMembership({
      id: 90422,
      publicId: "mem_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      organizationId: 90412,
      userId: 90401,
      role: "editor",
      status: "suspended",
    });

    const repository = new TenantAccessRepository(env.DB);

    await expect(
      repository.resolveAccessForUser(
        90401,
        "org_88888888888888888888888888888888",
      ),
    ).resolves.toMatchObject({
      role: "owner",
      tenant: {
        organizationId: 90411,
        organizationPublicId:
          "org_88888888888888888888888888888888",
      },
    });

    await expect(
      repository.resolveAccessForUser(
        90401,
        "org_99999999999999999999999999999999",
      ),
    ).resolves.toBeNull();
  });
});
