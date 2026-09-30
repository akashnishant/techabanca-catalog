import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("catalogue-app Worker", () => {
  it("returns a healthy API response", async () => {
    const response = await exports.default.fetch("http://example.com/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "techabanca-catalogue-app",
    });
  });
});