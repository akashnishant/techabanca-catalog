import { describe, expect, it } from "vitest";
import { parseStrictJson } from "../src";
describe("unambiguous JSON request values", () => {
  it.each(['{"role":"editor","role":"owner"}','{"nested":{"id":1,"id":2}}','[{"x":1,"\\u0078":2}]','{"a":[{"b":false,"b":true}]}'])("rejects repeated members: %s", text => expect(() => parseStrictJson(text)).toThrow("duplicate_json_member"));
  it.each(['{"a":1,"b":2}', '[{"a":1},{"a":2}]', '{"a":{"key":1},"b":{"key":2}}', '{"message":"escaped \\"key\\": value, {}[]","items":[]}'])("preserves valid values: %s", text => expect(parseStrictJson(text)).toEqual(JSON.parse(text)));
  it("rejects more than 32 nested containers", () => expect(() => parseStrictJson("[".repeat(33) + "0" + "]".repeat(33))).toThrow("json_nesting_exceeded"));
  it("accepts the maximum depth", () => expect(parseStrictJson("[".repeat(32) + "0" + "]".repeat(32))).toEqual(JSON.parse("[".repeat(32) + "0" + "]".repeat(32))));
  it.each(['{"x":}', '{"x":1} trailing', '{"x":"unterminated}', '{"x":NaN}'])("rejects malformed JSON: %s", text => expect(() => parseStrictJson(text)).toThrow());
});
