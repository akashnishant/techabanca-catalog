import { describe, expect, it } from "vitest";
import { filterUrl, readFilters, resolveHost } from "../src/routing";
describe("public host routing", () => {
  it("resolves the production business hostname", () => expect(resolveHost(new URL("https://acme-supply.techabanca.com/catalogue"))).toEqual({ slug: "acme-supply", preview: false, local: false, canonicalOrigin: "https://acme-supply.techabanca.com" }));
  it("resolves staging business hosts without indexing", () => expect(resolveHost(new URL("https://acme-supply.catalogue-preview.techabanca.com"))).toMatchObject({ slug: "acme-supply", preview: true, local: false }));
  it("permits local hosts only with the explicit local switch", () => {
    expect(resolveHost(new URL("http://acme-supply.localhost:5174"))).toBeNull();
    expect(resolveHost(new URL("http://acme-supply.localhost:5174"), true)).toMatchObject({ slug: "acme-supply", preview: true, local: true });
  });
  it.each(["techabanca.com", "catalogue.techabanca.com", "catalogue-preview.techabanca.com", "www.techabanca.com", "billing.techabanca.com", "billing-api.techabanca.com", "api.techabanca.com", "draft-acme.techabanca.com", "deleted-acme.techabanca.com", "a.techabanca.com", "two.labels.techabanca.com", "acme.techabanca.com.evil.test", "acme.eviltechabanca.com", "acme.workers.dev"])("rejects non-business hostname %s", hostname => expect(resolveHost(new URL("https://" + hostname))).toBeNull());
});
describe("search inputs and links", () => {
  it("normalizes supported filters", () => expect(readFilters(new URL("https://acme.techabanca.com/catalogue?q= Pump &type=product&category=hardware&page=2"))).toEqual({ query: "Pump", type: "product", category: "hardware", page: 2 }));
  it.each(["page=0", "page=-1", "page=1.5", "page=10000", "type=cart", "q=" + "x".repeat(101), "category=" + "x".repeat(81)])("rejects invalid filters %s", query => expect(() => readFilters(new URL("https://acme.techabanca.com/catalogue?" + query))).toThrow());
  it("preserves search and filters across pages", () => expect(filterUrl("/catalogue", { query: "Pump & valve", type: "product", category: "hardware", page: 1 }, 2)).toBe("/catalogue?q=Pump+%26+valve&type=product&category=hardware&page=2"));
  it("preserves the fixed category path without duplicating its query parameter", () => expect(filterUrl("/categories/hardware", { query: "Pump", type: "all", category: "hardware", page: 1 }, 1)).toBe("/categories/hardware?q=Pump"));
});
