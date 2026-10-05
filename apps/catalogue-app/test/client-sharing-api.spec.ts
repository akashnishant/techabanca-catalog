import { expect, it, vi } from "vitest";
import { createSharingApi } from "../src/client/sharing-api";
it("scopes an uncached abortable published item query to the selected tenant", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"data":{"items":[]}}'));
  const signal = new AbortController().signal;
  await createSharingApi(fetcher).view("org_qa", { search: "A&B / 😀", type: "service", page: 2 }, signal);
  const [url, options] = fetcher.mock.calls[0];
  expect(new URL(url as string, "https://catalogue.test").searchParams.get("q")).toBe("A&B / 😀");
  expect(options).toEqual({ signal, cache: "no-store", headers: { Accept: "application/json", "X-Techabanca-Organization": "org_qa" } });
  expect(url).toContain("type=service&page=2");
});
it("preserves useful errors and rejects non-JSON or empty successes", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"error":{"code":"sharing_unavailable","message":"Try again."}}', { status: 503 }));
  const api = createSharingApi(fetcher), filters = { search: "", type: "all" as const, page: 1 };
  await expect(api.view("org_qa", filters)).rejects.toMatchObject({ status: 503, code: "sharing_unavailable", message: "Try again." });
  for (const body of ["{}", "not-json"]) { fetcher.mockResolvedValue(new Response(body)); await expect(api.view("org_qa", filters)).rejects.toMatchObject({ code: "invalid_response" }); }
});
