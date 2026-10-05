import { describe, expect, it } from "vitest";
import { signReportToken, verifyReportToken, reportClientHash, signEnquiryToken, enquiryClientHash, type ReportClaims } from "../src";
const secret="b".repeat(64),now=1800000000;
const claims:ReportClaims={v:1,purpose:"report",slug:"northstar",catalogueId:"cat_"+"a".repeat(32),publicationId:"pub_"+"b".repeat(32),nonce:"c".repeat(32),issuedAt:now-10,expiresAt:now+800};
describe("purpose-isolated report tokens",()=>{
 it("round-trips a bounded signed form",async()=>expect(await verifyReportToken(await signReportToken(claims,secret,now),secret,now)).toEqual(claims));
 it.each([{purpose:"form"},{expiresAt:now+901},{issuedAt:now+31},{nonce:"bad"},{catalogueId:"usr_"+"a".repeat(32)},{slug:"Bad Slug"},{v:2},{extra:true}])("rejects claims %j",async overrides=>{
  await expect(signReportToken({...claims,...overrides} as ReportClaims,secret,now)).rejects.toThrow();
 });
 it("rejects wrong keys, expired tokens, malformed signatures and oversized input",async()=>{
  const token=await signReportToken(claims,secret,now);
  for(const value of [token.slice(0,-1)+"!",token+".extra","x".repeat(1201)])expect(await verifyReportToken(value,secret,now)).toBeNull();
  expect(await verifyReportToken(token,"a".repeat(64),now)).toBeNull();
  expect(await verifyReportToken(token,undefined,now)).toBeNull();
  expect(await verifyReportToken(token,secret,claims.expiresAt)).toBeNull();
 });
 it("rejects an otherwise valid enquiry token",async()=>{
  const token=await signEnquiryToken({...claims,purpose:"form",itemId:null},secret,now);expect(await verifyReportToken(token,secret,now)).toBeNull();
 });
 it("hashes rate-limit addresses with a separate purpose and key",async()=>{
  const a=await reportClientHash("203.0.113.1",secret);expect(a).toMatch(/^[a-f0-9]{64}$/);
  expect(a).toBe(await reportClientHash("203.0.113.1",secret));expect(a).not.toBe(await enquiryClientHash("203.0.113.1",secret));
  expect(a).not.toBe(await reportClientHash("203.0.113.2",secret));expect(a).not.toBe(await reportClientHash("203.0.113.1","a".repeat(64)));
 });
});
