import { describe, expect, it } from "vitest";
import { entryTitle, isWorkspaceRoute } from "../src/client/entry-route";
describe("marketing and workspace entry routes", () => {
  it.each(["", "#top", "#product", "#workflow", "#features", "#pricing", "#faq", "#main-content", "#unknown"])("keeps %s on the public landing page", hash => { expect(isWorkspaceRoute(hash)).toBe(false); });
  it.each(["#signin", "#signup", "#admin", "#setup", "#workspace/home", "#workspace/catalogue", "#workspace/website"])("retains application entry at %s", hash => { expect(isWorkspaceRoute(hash)).toBe(true); });
  it("does not treat similarly named marketing anchors as authentication routes", () => { expect(isWorkspaceRoute("#signup-offer")).toBe(false); expect(isWorkspaceRoute("#administrator")).toBe(false); });
  it("provides distinct account and product page titles", () => { expect(entryTitle("#signup")).toContain("Create your workspace"); expect(entryTitle("#signin")).toContain("Sign in"); expect(entryTitle("#workspace/catalogue")).toContain("Workspace"); expect(entryTitle("#product")).toContain("better showcase"); });
});
