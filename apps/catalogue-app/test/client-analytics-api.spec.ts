import { expect, it, vi } from "vitest";
import { createAnalyticsApi } from "../src/client/analytics-api";
it("scopes analytics to an organization and range with an abortable uncached read", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"data":{"daily":[]}}'));
  const signal = new AbortController().signal; await createAnalyticsApi(fetcher).summary("org_qa", 90, signal);
  expect(fetcher.mock.calls[0]).toEqual(["/api/v1/catalogue/analytics?days=90", { signal, cache: "no-store", headers: { Accept: "application/json", "X-Techabanca-Organization": "org_qa" } }]);
});
it("preserves actionable errors and rejects empty or non-JSON successes", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"error":{"code":"analytics_unavailable","message":"Try again."}}', { status: 503 }));
  await expect(createAnalyticsApi(fetcher).summary("org_qa", 7)).rejects.toMatchObject({ status: 503, code: "analytics_unavailable", message: "Try again." });
  for (const body of ["{}", "not-json"]) { fetcher.mockResolvedValue(new Response(body)); await expect(createAnalyticsApi(fetcher).summary("org_qa", 7)).rejects.toMatchObject({ code: "invalid_response" }); }
});
