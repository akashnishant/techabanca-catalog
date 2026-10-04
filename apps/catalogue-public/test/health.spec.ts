import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("catalogue-public Worker", () => {
  it("returns a healthy response", async () => {
    const response = await exports.default.fetch("http://example.com/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "techabanca-catalogue-public",
    });
  });

  it("does not resolve an unknown business hostname", async () => {
    const response = await exports.default.fetch("http://example.com/");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Catalogue unavailable");
  });
});