import { expect, it, vi } from "vitest";
import { createSubscriptionApi } from "../src/client/subscription-api";
it("scopes subscriptions, sends strict mutations and aborts a stale read", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"data":{"trialAvailable":true}}', { headers: { "Content-Type": "application/json" } }));
  const api = createSubscriptionApi(fetcher), controller = new AbortController(); await api.summary("org_qa", controller.signal);
  expect(fetcher.mock.calls[0][0]).toBe("/api/v1/catalogue/subscription"); expect(new Headers(fetcher.mock.calls[0][1]!.headers).get("X-Techabanca-Organization")).toBe("org_qa");
  expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store", signal: controller.signal });
  fetcher.mockImplementation(async () => new Response('{"data":{}}')); await api.cancel("org_qa", "sub_qa", 2);
  expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({ id: "sub_qa", version: 2 });
  await api.checkout("org_qa", "off_qa", "chk_qa"); expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string)).toEqual({ offerId: "off_qa", requestId: "chk_qa" });
});
it("preserves actionable server errors and rejects malformed success", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"error":{"code":"subscription_changed","message":"Refresh before trying again."}}', { status: 409 }));
  await expect(createSubscriptionApi(fetcher).trial("org_qa")).rejects.toMatchObject({ status: 409, code: "subscription_changed" });
  fetcher.mockResolvedValue(new Response("{}")); await expect(createSubscriptionApi(fetcher).summary("org_qa")).rejects.toMatchObject({ code: "invalid_response" });
});
