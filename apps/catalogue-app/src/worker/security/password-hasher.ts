import { scrypt } from "node:crypto";

// OWASP scrypt settings: 16 MiB, N=2^14, r=8, p=5.
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 5;
const SCRYPT_MAX_MEMORY = 32 * 1024 * 1024;

const PASSWORD_ALGORITHM = "pbkdf2-sha256";
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_DERIVED_BYTES = 32;

const textEncoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(
    bytes,
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
}

function hexToBytes(value: string): Uint8Array | null {
  if (
    value.length % 2 !== 0
    || !/^[0-9a-f]+$/i.test(value)
  ) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(
      value.slice(index, index + 2),
      16,
    );
  }

  return bytes;
}

function constantTimeEqual(
  left: Uint8Array,
  right: Uint8Array,
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    material,
    PASSWORD_DERIVED_BYTES * 8,
  );

  return new Uint8Array(bits);
}

async function deriveScrypt(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_DERIVED_BYTES,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEMORY },
      (error, derived) => {
        if (error) reject(error);
        else resolve(new Uint8Array(derived));
      });
  });
}

export class PasswordHasher {
  async hash(password: string): Promise<string> {
    if (password.length === 0) {
      throw new Error("password_required");
    }

    const salt = crypto.getRandomValues(
      new Uint8Array(PASSWORD_SALT_BYTES),
    );

    const derived = await deriveScrypt(password, salt);

    return [
      "scrypt",
      SCRYPT_N.toString(),
      SCRYPT_R.toString(),
      SCRYPT_P.toString(),
      bytesToHex(salt),
      bytesToHex(derived),
    ].join("$");
  }

  async verify(
    password: string,
    encodedHash: string,
  ): Promise<boolean> {
    if (password.length === 0 || encodedHash.length > 512) {
      return false;
    }

    const parts = encodedHash.split("$");

    if (parts[0] === "scrypt") {
      if (parts.length !== 6 || parts[1] !== String(SCRYPT_N)
        || parts[2] !== String(SCRYPT_R) || parts[3] !== String(SCRYPT_P)) return false;
      const salt = hexToBytes(parts[4]);
      const expected = hexToBytes(parts[5]);
      if (!salt || salt.length !== PASSWORD_SALT_BYTES
        || !expected || expected.length !== PASSWORD_DERIVED_BYTES) return false;
      return constantTimeEqual(await deriveScrypt(password, salt), expected);
    }

    // Retain existing PBKDF2 hashes where the runtime supports their work factor.

    if (parts.length !== 4) {
      return false;
    }

    const [
      algorithm,
      iterationsRaw,
      saltHex,
      expectedHex,
    ] = parts;

    if (algorithm !== PASSWORD_ALGORITHM) {
      return false;
    }

    if (!/^[1-9][0-9]{0,6}$/.test(iterationsRaw)) return false;
    const iterations = Number(iterationsRaw);
    if (
      !Number.isSafeInteger(iterations)
      || iterations <= 0
      || iterations > 2_000_000
    ) {
      return false;
    }

    const salt = hexToBytes(saltHex);
    const expected = hexToBytes(expectedHex);

    if (
      !salt
      || salt.length < 16
      || !expected
      || expected.length !== PASSWORD_DERIVED_BYTES
    ) {
      return false;
    }

    const actual = await derivePassword(
      password,
      salt,
      iterations,
    );

    return constantTimeEqual(actual, expected);
  }
}
