import {
  normalizeLoginEmail,
  type UserStatus,
} from "@techabanca/domain";

export type AuthUserRecord = {
  id: number;
  publicId: string;
  email: string;
  passwordHash: string;
  displayName: string;
  status: UserStatus;
  emailVerifiedAt: string | null;
};

type AuthUserRow = {
  id: number;
  public_id: string;
  email: string;
  password_hash: string;
  display_name: string;
  status: UserStatus;
  email_verified_at: string | null;
};

export class UserAuthRepository {
  constructor(private readonly db: D1Database) {}

  async findActiveByEmail(
    email: string,
  ): Promise<AuthUserRecord | null> {
    const normalizedEmail = normalizeLoginEmail(email);

    if (normalizedEmail.length === 0) {
      return null;
    }

    const row = await this.db
      .prepare(
        `SELECT
           id,
           public_id,
           email,
           password_hash,
           display_name,
           status,
           email_verified_at
         FROM users
         WHERE email = ?
           AND status = 'active'
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(normalizedEmail)
      .first<AuthUserRow>();

    return row ? this.map(row) : null;
  }

  async findActiveById(
    userId: number,
  ): Promise<AuthUserRecord | null> {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return null;
    }

    const row = await this.db
      .prepare(
        `SELECT
           id,
           public_id,
           email,
           password_hash,
           display_name,
           status,
           email_verified_at
         FROM users
         WHERE id = ?
           AND status = 'active'
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(userId)
      .first<AuthUserRow>();

    return row ? this.map(row) : null;
  }

  private map(row: AuthUserRow): AuthUserRecord {
    return {
      id: row.id,
      publicId: row.public_id,
      email: row.email,
      passwordHash: row.password_hash,
      displayName: row.display_name,
      status: row.status,
      emailVerifiedAt: row.email_verified_at,
    };
  }
}
