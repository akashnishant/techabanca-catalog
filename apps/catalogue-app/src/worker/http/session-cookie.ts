import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import {
  DEFAULT_SESSION_TTL_SECONDS,
} from "../services/auth-session-service";

export const SESSION_COOKIE_NAME =
  "techabanca_catalogue_session";

export function readSessionCookie(
  c: Context,
): string | null {
  return getCookie(c, SESSION_COOKIE_NAME) ?? null;
}

function isHttpsRequest(c: Context): boolean {
  return new URL(c.req.url).protocol === "https:";
}

export function writeSessionCookie(
  c: Context,
  token: string,
): void {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttpsRequest(c),
    sameSite: "Lax",
    path: "/",
    maxAge: DEFAULT_SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(
  c: Context,
): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isHttpsRequest(c),
    sameSite: "Lax",
    path: "/",
  });
}
