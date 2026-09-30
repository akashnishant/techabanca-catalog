const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(
    bytes,
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
}

export function generateSessionToken(): string {
  return bytesToHex(
    crypto.getRandomValues(
      new Uint8Array(SESSION_TOKEN_BYTES),
    ),
  );
}

export function isSessionToken(value: string): boolean {
  return SESSION_TOKEN_PATTERN.test(value);
}

export async function hashSessionToken(
  token: string,
): Promise<string> {
  if (!isSessionToken(token)) {
    throw new Error("invalid_session_token");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );

  return bytesToHex(new Uint8Array(digest));
}
