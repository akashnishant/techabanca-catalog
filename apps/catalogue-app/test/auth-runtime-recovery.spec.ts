import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/worker";
import { id, previewConfig, publicationFixture } from "./publication-fixtures";

const ROOT = "https://catalogue.test";
describe("authentication recovery during publishing", () => {
  it.each(["/api/v1/auth/session", "/api/v1/onboarding/state"])(
    "preserves a valid cookie and recovers after a storage outage at %s",
    async (route) => {
      const f = await publicationFixture();
      const cookie = await f.session();
      const makeRequest = () => new Request(ROOT + route, {
        headers: { cookie, "X-Techabanca-Organization": id("org", f.n) },
      });
      const unavailable = {
        prepare() { throw new Error("storage outage with private SQL details"); },
      } as unknown as D1Database;
      const failed = await app.fetch(makeRequest(), { ...env, ...previewConfig, DB: unavailable });
      expect(failed.status).toBe(503);
      expect(failed.headers.get("set-cookie")).toBeNull();
      const body = await failed.text();
      expect(body).toContain("authentication_unavailable");
      expect(body).not.toContain("private SQL");
      const recovered = await app.fetch(makeRequest(), { ...env, ...previewConfig });
      expect(recovered.status).toBe(200);
    },
  );
  it.each(["/api/v1/auth/session", "/api/v1/onboarding/state"])(
    "still clears an invalid session at %s",
    async (route) => {
      const response = await app.fetch(new Request(ROOT + route, {
        headers: { cookie: "__Host-techabanca_catalogue_session=" + "a".repeat(64) },
      }), { ...env, ...previewConfig });
      expect(response.status).toBe(401);
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    },
  );
});
