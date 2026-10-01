import {
  createPublicId,
  normalizeLoginEmail,
} from "@techabanca/domain";
import type { RegistrationRepository } from "../repositories";
import { PasswordHasher } from "../security/password-hasher";
import {
  generateSessionToken,
  hashSessionToken,
} from "../security/session-token";
import {
  DEFAULT_SESSION_TTL_SECONDS,
} from "./auth-session-service";

export type RegistrationInput = {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
};

export type RegisteredAccount = {
  token: string;
  expiresAt: string;
  user: {
    publicId: string;
    email: string;
    displayName: string;
  };
  organization: {
    publicId: string;
    name: string;
    role: "owner";
  };
};

export type RegistrationResult =
  | {
      kind: "created";
      account: RegisteredAccount;
    }
  | {
      kind: "conflict";
    };

function cleanRequiredText(
  value: string,
): string {
  return value.trim().replace(/\s+/g, " ");
}

export class RegistrationService {
  constructor(
    private readonly repository:
      RegistrationRepository,
    private readonly passwordHasher:
      PasswordHasher = new PasswordHasher(),
  ) {}

  async register(
    input: RegistrationInput,
    now: Date,
  ): Promise<RegistrationResult> {
    if (Number.isNaN(now.getTime())) {
      throw new Error("invalid_date");
    }

    const email = normalizeLoginEmail(input.email);
    const displayName = cleanRequiredText(
      input.displayName,
    );
    const organizationName = cleanRequiredText(
      input.organizationName,
    );

    if (await this.repository.emailExists(email)) {
      return {
        kind: "conflict",
      };
    }

    const passwordHash =
      await this.passwordHasher.hash(input.password);

    const token = generateSessionToken();
    const sessionTokenHash =
      await hashSessionToken(token);

    const userPublicId = createPublicId("usr");
    const organizationPublicId =
      createPublicId("org");
    const membershipPublicId =
      createPublicId("mem");
    const sessionPublicId =
      createPublicId("ses");

    const createdAt = now.toISOString();
    const expiresAt = new Date(
      now.getTime()
        + DEFAULT_SESSION_TTL_SECONDS * 1000,
    ).toISOString();

    try {
      await this.repository.createOwnerAccount({
        userPublicId,
        email,
        passwordHash,
        displayName,
        organizationPublicId,
        organizationName,
        membershipPublicId,
        sessionPublicId,
        sessionTokenHash,
        sessionExpiresAt: expiresAt,
        createdAt,
      });
    } catch (error) {
      if (
        await this.repository.emailExists(email)
      ) {
        return {
          kind: "conflict",
        };
      }

      throw error;
    }

    return {
      kind: "created",
      account: {
        token,
        expiresAt,
        user: {
          publicId: userPublicId,
          email,
          displayName,
        },
        organization: {
          publicId: organizationPublicId,
          name: organizationName,
          role: "owner",
        },
      },
    };
  }
}
