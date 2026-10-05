import { describe, expect, it } from "vitest";
import { catalogueShareTarget } from "../src/sharing";

describe("canonical sharing targets", () => {
  it("uses the permanent HTTPS catalogue address and encodes a reviewed WhatsApp message", () => {
    const target = catalogueShareTarget("northstar-supply", "Northstar & Supply");
    expect(target.url).toBe("https://northstar-supply.techabanca.com/");
    const whatsapp = new URL(target.whatsappUrl);
    expect(whatsapp.origin + whatsapp.pathname).toBe("https://wa.me/");
    expect(whatsapp.searchParams.get("text")).toBe("Northstar & Supply\n" + target.url);
    expect([...whatsapp.searchParams.keys()]).toEqual(["text"]);
    expect(target.filename).toBe("techabanca-northstar-supply-catalogue-qr");
  });
  it("encodes item and business names without changing the URL or adding a recipient", () => {
    const target = catalogueShareTarget("northstar", "供应商 & Co", { slug: "precision-pump", name: "Pump #1? <test> 😀" });
    expect(target.url).toBe("https://northstar.techabanca.com/items/precision-pump");
    expect(new URL(target.whatsappUrl).searchParams.get("text")).toBe("Pump #1? <test> 😀 — 供应商 & Co\n" + target.url);
    expect(target.filename).toBe("techabanca-northstar-precision-pump-qr");
  });
  it.each(["", "ab", "Acorp", "evil.test", "evil/host", "evil?x=1", "a".repeat(64), "draft-business", "deleted-business"])("rejects unsafe catalogue slug %s", slug => {
    expect(() => catalogueShareTarget(slug, "Business")).toThrow("invalid_share_target");
  });
  it.each(["", "../draft", "private?token=secret", "my/item", "Item", "a".repeat(81)])("rejects unsafe item slug %s", slug => {
    expect(() => catalogueShareTarget("northstar", "Business", { slug, name: "Item" })).toThrow("invalid_share_target");
  });
});
