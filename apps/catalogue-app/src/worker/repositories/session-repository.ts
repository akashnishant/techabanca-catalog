export type CreateSessionInput = {
  publicId: string;
  userId: number;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
};

export type AuthenticatedSessionRecord = {
  sessionId: number;
  sessionPublicId: string;
  userId: number;
  userPublicId: string;
  email: string;
  displayName: string;
  emailVerifiedAt: string | null;
  expiresAt: string;
  lastSeenAt: string | null;
};

type AuthenticatedSessionRow = {
  session_id: number;
  session_public_id: string;
  user_id: number;
  user_public_id: string;
  email: string;
  display_name: string;
  email_verified_at: string | null;
  expires_at: string;
  last_seen_at: string | null;
};

export class SessionRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateSessionInput): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO sessions (
           public_id,
           user_id,
           token_hash,
           expires_at,
           created_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        input.publicId,
        input.userId,
        input.tokenHash,
        input.expiresAt,
        input.createdAt,
      )
      .run();
  }

  async findAuthenticatedByTokenHash(
    tokenHash: string,
    now: string,
  ): Promise<AuthenticatedSessionRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           s.id AS session_id,
           s.public_id AS session_public_id,
           u.id AS user_id,
           u.public_id AS user_public_id,
           u.email,
           u.display_name,
           u.email_verified_at,
           s.expires_at,
           s.last_seen_at
         FROM sessions s
         INNER JOIN users u
           ON u.id = s.user_id
         WHERE s.token_hash = ?
           AND s.revoked_at IS NULL
           AND s.expires_at > ?
           AND u.status = 'active'
           AND u.deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(tokenHash, now)
      .first<AuthenticatedSessionRow>();

    if (!row) {
      return null;
    }

    return {
      sessionId: row.session_id,
      sessionPublicId: row.session_public_id,
      userId: row.user_id,
      userPublicId: row.user_public_id,
      email: row.email,
      displayName: row.display_name,
      emailVerifiedAt: row.email_verified_at,
      expiresAt: row.expires_at,
      lastSeenAt: row.last_seen_at,
    };
  }

  async revokeForUser(
    userId: number,
    sessionPublicId: string,
    revokedAt: string,
  ): Promise<boolean> {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return false;
    }

    const result = await this.db
      .prepare(
        `UPDATE sessions
         SET revoked_at = ?
         WHERE user_id = ?
           AND public_id = ?
           AND revoked_at IS NULL`,
      )
      .bind(revokedAt, userId, sessionPublicId)
      .run();

    return (result.meta.changes ?? 0) > 0;
  }

  async touchLastSeen(
    sessionId: number,
    lastSeenAt: string,
  ): Promise<void> {
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
      return;
    }

    await this.db
      .prepare(
        `UPDATE sessions
         SET last_seen_at = ?
         WHERE id = ?
           AND revoked_at IS NULL`,
      )
      .bind(lastSeenAt, sessionId)
      .run();
  }
}
