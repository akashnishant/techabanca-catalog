import { env } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import app from "../src/worker";

it("dispatches local catalogue hosts through the auxiliary worker with the original request", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("public catalogue", { headers: { "Content-Security-Policy": "script-src 'none'" } }));
  const request = new Request("http://demo.localhost:5174/catalogue?q=example");
  const response = await app.fetch(request, { ...env, DEPLOYMENT_ENVIRONMENT: "local", LOCAL_PUBLIC_WORKER: { fetch: fetcher } as unknown as Fetcher });
  expect(response.status).toBe(200); expect(await response.text()).toBe("public catalogue");
  expect(fetcher.mock.calls[0][0].url).toBe(request.url); expect(response.headers.get("Content-Security-Policy")).toBe("script-src 'none'");
});
it("never forwards management hosts or nonlocal deployments to the local worker binding", async () => {
  const fetcher = vi.fn(); const binding = { fetch: fetcher } as unknown as Fetcher;
  expect((await app.fetch(new Request("http://127.0.0.1:5173/api/health"), { ...env, DEPLOYMENT_ENVIRONMENT: "local", LOCAL_PUBLIC_WORKER: binding })).status).toBe(200);
  for (const deployment of ["staging", "production"] as const)
    expect((await app.fetch(new Request("https://demo.localhost/catalogue"), { ...env, DEPLOYMENT_ENVIRONMENT: deployment, LOCAL_PUBLIC_WORKER: binding })).status).toBe(404);
  expect(fetcher).not.toHaveBeenCalled();
});
