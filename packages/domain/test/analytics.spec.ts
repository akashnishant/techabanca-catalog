import { describe, expect, it } from "vitest";
import { analyticsEligible, analyticsWindow, emptyAnalyticsCounts } from "../src/analytics";
const excludedHeaders: Array<Record<string, string>> = [{ DNT: "1" }, { "Sec-GPC": "1" }, { Purpose: "prefetch" }, { "Sec-Purpose": "prefetch;prerender" }, { "Sec-Fetch-Mode": "cors" }, { "Sec-Fetch-Dest": "image" }];
const human = "Mozilla/5.0 Chrome/145.0 Safari/537.36";
describe("privacy-preserving analytics rules", () => {
  it("uses inclusive UTC ranges and equal nonoverlapping previous periods", () => {
    expect(analyticsWindow(7, new Date("2026-03-01T00:10:00Z"))).toEqual({ days: 7, start: "2026-02-23", end: "2026-03-01", previousStart: "2026-02-16", previousEnd: "2026-02-22" });
    expect(analyticsWindow(30, new Date("2028-03-01T23:59:59Z")).start).toBe("2028-02-01");
    expect(() => analyticsWindow(0)).toThrow(); expect(() => analyticsWindow(7, new Date("invalid"))).toThrow();
  });
  it("creates independent zeroed counts for six allowed metrics", () => {
    const a = emptyAnalyticsCounts(), b = emptyAnalyticsCounts(); a.search = 1;
    expect(b.search).toBe(0); expect(Object.keys(b)).toHaveLength(6);
  });
  it.each(["Googlebot", "HeadlessChrome", "facebookexternalhit", "WhatsApp/2", "curl/8", "TelegramBot", "uptime-monitor", ""])("excludes automated agent %s", agent => {
    expect(analyticsEligible(new Request("https://example.test", { headers: { "User-Agent": agent } }))).toBe(false);
  });
  it.each(excludedHeaders)("respects privacy and speculative headers %j", headers => {
    expect(analyticsEligible(new Request("https://example.test", { headers: { "User-Agent": human, ...headers } }))).toBe(false);
  });
  it("accepts human navigation, excludes HEAD and private previews, and requires explicit validated submission mode", () => {
    const request = new Request("https://example.test", { headers: { "User-Agent": human, "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" } });
    expect(analyticsEligible(request)).toBe(true); expect(analyticsEligible(request, true)).toBe(false);
    expect(analyticsEligible(new Request(request, { method: "HEAD" }))).toBe(false);
    const post = new Request(request, { method: "POST" }); expect(analyticsEligible(post)).toBe(false); expect(analyticsEligible(post, false, true)).toBe(true);
  });
});
