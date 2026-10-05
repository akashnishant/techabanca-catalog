import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import {
  DEFAULT_SESSION_TTL_SECONDS,
} from "../services/auth-session-service";

export const SECURE_SESSION_COOKIE_NAME =
  "__Host-techabanca_catalogue_session";

export const DEVELOPMENT_SESSION_COOKIE_NAME =
  "techabanca_catalogue_session";

function isHttpsRequest(c: Context): boolean {
  return new URL(c.req.url).protocol === "https:";
}

export function sessionCookieNameForRequest(
  c: Context,
): string {
  return isHttpsRequest(c)
    ? SECURE_SESSION_COOKIE_NAME
    : DEVELOPMENT_SESSION_COOKIE_NAME;
}

export function readSessionCookie(
  c: Context,
): string | null {
  const name = sessionCookieNameForRequest(c);
  const matches = (c.req.header("Cookie") ?? "").split(";").filter(pair => pair.trim().split("=", 1)[0] === name);
  if (matches.length !== 1) return null;
  return getCookie(
    c,
    sessionCookieNameForRequest(c),
  ) ?? null;
}

export function writeSessionCookie(
  c: Context,
  token: string,
): void {
  const secure = isHttpsRequest(c);

  setCookie(
    c,
    sessionCookieNameForRequest(c),
    token,
    {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAge: DEFAULT_SESSION_TTL_SECONDS,
    },
  );
}

export function clearSessionCookie(
  c: Context,
): void {
  const secure = isHttpsRequest(c);

  deleteCookie(
    c,
    sessionCookieNameForRequest(c),
    {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
    },
  );
}
