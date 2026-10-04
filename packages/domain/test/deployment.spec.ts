import { describe, expect, it } from "vitest";
import { readCatalogueDeployment, isManagementHost, cataloguePublicOrigin } from "../src/deployment";
describe("deployment host policy", () => {
  it.each([[undefined,"local"],["local","local"],["staging","staging"],["production","production"],["preview",null],["",null]] as const)("validates environment %s", (value,expected) => expect(readCatalogueDeployment(value)).toBe(expected));
  it.each(["catalogue.techabanca.com","billing.techabanca.com","techabanca.com","catalogue-preview.techabanca.com.evil.test","other.catalogue-preview.techabanca.com","127.0.0.1"])("staging rejects management host %s", hostname => expect(isManagementHost(new URL("https://"+hostname),"staging")).toBe(false));
  it("accepts only the staging management hostname and default port",()=>{
    expect(isManagementHost(new URL("https://catalogue-preview.techabanca.com:443"),"staging")).toBe(true);
    expect(isManagementHost(new URL("https://catalogue-preview.techabanca.com:8443"),"staging")).toBe(false);
  });
  it("keeps the production management host separate",()=>{
    expect(isManagementHost(new URL("https://catalogue.techabanca.com"),"production")).toBe(true);
    expect(isManagementHost(new URL("https://catalogue-preview.techabanca.com"),"production")).toBe(false);
  });
  it("staging origins are fixed even with the local switch or another request host",()=>{
    expect(cataloguePublicOrigin("acme",{DEPLOYMENT_ENVIRONMENT:"staging",LOCAL_PREVIEW:"true"},"http://127.0.0.1:5173")).toBe("https://acme.catalogue-preview.techabanca.com");
  });
  it("production origins do not enable local or staging addresses",()=>{
    expect(cataloguePublicOrigin("acme",{DEPLOYMENT_ENVIRONMENT:"production",LOCAL_PREVIEW:"true"},"https://catalogue-preview.techabanca.com")).toBe("https://acme.techabanca.com");
  });
  it("retains explicitly enabled local preview addresses",()=>{
    expect(cataloguePublicOrigin("acme",{DEPLOYMENT_ENVIRONMENT:"local",LOCAL_PREVIEW:"true"},"http://127.0.0.1:5173")).toBe("http://acme.localhost:5174");
  });
  it("retains the staging origin for legacy local test requests",()=>{
    expect(cataloguePublicOrigin("acme",{},"https://catalogue-preview.techabanca.com")).toBe("https://acme.catalogue-preview.techabanca.com");
  });
  it("refuses an unknown deployment when constructing a signed link",()=>expect(()=>cataloguePublicOrigin("acme",{DEPLOYMENT_ENVIRONMENT:"stagin"},"https://catalogue-preview.techabanca.com")).toThrow("invalid_deployment"));
});
