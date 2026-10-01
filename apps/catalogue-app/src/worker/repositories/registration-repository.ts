export type CreateOwnerAccountInput = {
  userPublicId: string;
  email: string;
  passwordHash: string;
  displayName: string;
  organizationPublicId: string;
  organizationName: string;
  membershipPublicId: string;
  sessionPublicId: string;
  sessionTokenHash: string;
  sessionExpiresAt: string;
  createdAt: string;
};

export class RegistrationRepository {
  constructor(private readonly db: D1Database) {}

  async emailExists(email: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT 1 AS found
         FROM users
         WHERE email = ?
         LIMIT 1`,
      )
      .bind(email)
      .first<{ found: number }>();

    return row !== null;
  }

  async createOwnerAccount(
    input: CreateOwnerAccountInput,
  ): Promise<void> {
    const userInsert = this.db
      .prepare(
        `INSERT INTO users (
           public_id,
           email,
           password_hash,
           display_name,
           status,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      )
      .bind(
        input.userPublicId,
        input.email,
        input.passwordHash,
        input.displayName,
        input.createdAt,
        input.createdAt,
      );

    const organizationInsert = this.db
      .prepare(
        `INSERT INTO organizations (
           public_id,
           name,
           timezone,
           status,
           created_at,
           updated_at
         ) VALUES (?, ?, 'UTC', 'active', ?, ?)`,
      )
      .bind(
        input.organizationPublicId,
        input.organizationName,
        input.createdAt,
        input.createdAt,
      );

    const membershipInsert = this.db
      .prepare(
        `INSERT INTO organization_members (
           public_id,
           organization_id,
           user_id,
           role,
           status,
           created_at,
           updated_at
         )
         SELECT
           ?,
           o.id,
           u.id,
           'owner',
           'active',
           ?,
           ?
         FROM organizations o
         CROSS JOIN users u
         WHERE o.public_id = ?
           AND u.public_id = ?`,
      )
      .bind(
        input.membershipPublicId,
        input.createdAt,
        input.createdAt,
        input.organizationPublicId,
        input.userPublicId,
      );

    const profileInsert = this.db
      .prepare(
        `INSERT INTO business_profiles (
           organization_id,
           legal_or_display_name,
           created_at,
           updated_at
         )
         SELECT
           o.id,
           ?,
           ?,
           ?
         FROM organizations o
         WHERE o.public_id = ?`,
      )
      .bind(
        input.organizationName,
        input.createdAt,
        input.createdAt,
        input.organizationPublicId,
      );

    const sessionInsert = this.db
      .prepare(
        `INSERT INTO sessions (
           public_id,
           user_id,
           token_hash,
           expires_at,
           created_at
         )
         SELECT
           ?,
           u.id,
           ?,
           ?,
           ?
         FROM users u
         WHERE u.public_id = ?`,
      )
      .bind(
        input.sessionPublicId,
        input.sessionTokenHash,
        input.sessionExpiresAt,
        input.createdAt,
        input.userPublicId,
      );

    await this.db.batch([
      userInsert,
      organizationInsert,
      membershipInsert,
      profileInsert,
      sessionInsert,
    ]);
  }
}
