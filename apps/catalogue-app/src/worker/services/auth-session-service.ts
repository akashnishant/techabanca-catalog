import { createPublicId } from "@techabanca/domain";
import type {
  AuthenticatedSessionRecord,
  SessionRepository,
} from "../repositories";
import {
  generateSessionToken,
  hashSessionToken,
  isSessionToken,
} from "../security/session-token";

export const DEFAULT_SESSION_TTL_SECONDS =
  60 * 60 * 24 * 30;

export type CreatedSession = {
  token: string;
  sessionPublicId: string;
  expiresAt: string;
};

function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new Error("invalid_date");
  }
}

export class AuthSessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly ttlSeconds = DEFAULT_SESSION_TTL_SECONDS,
  ) {
    if (
      !Number.isSafeInteger(ttlSeconds)
      || ttlSeconds <= 0
    ) {
      throw new Error("invalid_session_ttl");
    }
  }

  async create(
    userId: number,
    now: Date,
  ): Promise<CreatedSession> {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new Error("invalid_user_id");
    }

    assertValidDate(now);

    const token = generateSessionToken();
    const tokenHash = await hashSessionToken(token);
    const sessionPublicId = createPublicId("ses");
    const expiresAt = new Date(
      now.getTime() + this.ttlSeconds * 1000,
    ).toISOString();

    await this.sessions.create({
      publicId: sessionPublicId,
      userId,
      tokenHash,
      expiresAt,
      createdAt: now.toISOString(),
    });

    return {
      token,
      sessionPublicId,
      expiresAt,
    };
  }

  async authenticate(
    token: string,
    now: Date,
  ): Promise<AuthenticatedSessionRecord | null> {
    assertValidDate(now);

    if (!isSessionToken(token)) {
      return null;
    }

    const tokenHash = await hashSessionToken(token);

    return this.sessions.findAuthenticatedByTokenHash(
      tokenHash,
      now.toISOString(),
    );
  }

  async revoke(
    userId: number,
    sessionPublicId: string,
    now: Date,
  ): Promise<boolean> {
    assertValidDate(now);

    return this.sessions.revokeForUser(
      userId,
      sessionPublicId,
      now.toISOString(),
    );
  }
}
