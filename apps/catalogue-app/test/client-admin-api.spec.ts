import { describe,expect,it,vi } from "vitest";
import { createAdminApi,AdminApiError } from "../src/client/admin-api";
describe("administration client",()=>{
 it("uses same-origin credentials, bounded query encoding and abort signals",async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({data:{rows:[],total:0,page:1,pageSize:24}}),{headers:{"Content-Type":"application/json"}})),api=createAdminApi(fetcher),controller=new AbortController();
  await api.catalogues("A & B","all",1,controller.signal);
  expect(fetcher.mock.calls[0][0]).toBe("/api/v1/admin/catalogues?q=A+%26+B&state=all&page=1");
  expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:"same-origin",signal:controller.signal});
 });
 it("sends the current source and moderation versions with a public-access decision",async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({data:{}}))),api=createAdminApi(fetcher);
  await api.publicAccess({record:{id:"mod_test"},catalogue:{moderationVersion:3,version:7}} as Parameters<typeof api.publicAccess>[0],true,"Reviewed");
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({blocked:true,note:"Reviewed",moderationVersion:3,catalogueVersion:7});
 });
 it("returns permission, conflict and rate-limit failures as actionable errors",async()=>{
  for(const status of [401,403,409,429,503]){
   const api=createAdminApi(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({error:{message:"Review error"}}),{status})));
   await expect(api.overview()).rejects.toMatchObject({status,message:"Review error"});
  }
 });
 it("rejects unreadable or missing response payloads",async()=>{
  for(const body of ["<html>","{}","null"]){
   const api=createAdminApi(vi.fn<typeof fetch>().mockResolvedValue(new Response(body)));
   await expect(api.overview()).rejects.toBeInstanceOf(AdminApiError);
  }
 });
});
