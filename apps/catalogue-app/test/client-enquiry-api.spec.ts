import { describe, expect, it, vi } from "vitest";
import { createEnquiryApi } from "../src/client/enquiry-api";
import { AuthoringApiError } from "../src/client/authoring-api";
describe("enquiry client API",()=>{
 it("scopes and encodes filters with cancellation and no cached personal data",async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({data:{enquiries:[]}})),api=createEnquiryApi(fetcher),signal=new AbortController().signal;
  await api.list("org_demo",{q:"A&B",status:"new",after:"cursor"},signal);
  const [url,init]=fetcher.mock.calls[0]; expect(url).toBe("/api/v1/catalogue/enquiries?q=A%26B&status=new&after=cursor");
  expect(new Headers(init!.headers).get("X-Techabanca-Organization")).toBe("org_demo"); expect(init!.cache).toBe("no-store"); expect(init!.signal).toBe(signal);
 });
 it("sends optimistic versions on writes and handles permanent deletion",async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:{version:2}})).mockResolvedValueOnce(new Response(null,{status:204})),api=createEnquiryApi(fetcher);
  await api.note("org_demo","enq_demo",1,"Hello"); await api.remove("org_demo","enq_demo",2);
  expect(fetcher.mock.calls[0][0]).toBe("/api/v1/catalogue/enquiries/enq_demo/notes"); expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({version:1,note:"Hello"});
  expect(fetcher.mock.calls[1][1]!.method).toBe("DELETE");
 });
 it("keeps HTTP conflict messages and rejects invalid responses",async()=>{
  const api=createEnquiryApi(vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:{code:"enquiry_version_conflict",message:"Changed"}},{status:409})));
  await expect(api.status("org_demo","enq_demo",1,"closed")).rejects.toMatchObject({status:409,code:"enquiry_version_conflict",message:"Changed"});
  await expect(createEnquiryApi(vi.fn<typeof fetch>().mockResolvedValue(Response.json({wrong:true}))).detail("org_demo","enq_demo")).rejects.toBeInstanceOf(AuthoringApiError);
 });
});
