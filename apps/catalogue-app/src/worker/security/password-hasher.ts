const PASSWORD_ALGORITHM = "pbkdf2-sha256";
const PASSWORD_ITERATIONS = 600_000;
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

export class PasswordHasher {
  async hash(password: string): Promise<string> {
    if (password.length === 0) {
      throw new Error("password_required");
    }

    const salt = crypto.getRandomValues(
      new Uint8Array(PASSWORD_SALT_BYTES),
    );

    const derived = await derivePassword(
      password,
      salt,
      PASSWORD_ITERATIONS,
    );

    return [
      PASSWORD_ALGORITHM,
      PASSWORD_ITERATIONS.toString(),
      bytesToHex(salt),
      bytesToHex(derived),
    ].join("$");
  }

  async verify(
    password: string,
    encodedHash: string,
  ): Promise<boolean> {
    if (password.length === 0) {
      return false;
    }

    const parts = encodedHash.split("$");

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

    const iterations = Number.parseInt(iterationsRaw, 10);
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
