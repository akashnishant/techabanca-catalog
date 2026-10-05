// Parse once with the native JSON parser, then reject ambiguous member names
// and excessive nesting before any request values reach services.
export function parseStrictJson(text: string): unknown {
  const value: unknown = JSON.parse(text);
  const tokens = text.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]/g) ?? [];
  const stack: Array<Set<string> | null> = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "{" || token === "[") {
      stack.push(token === "{" ? new Set<string>() : null);
      if (stack.length > 32) throw new Error("json_nesting_exceeded");
    } else if (token === "}" || token === "]") stack.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ":") {
      const names = stack[stack.length - 1], name: string = JSON.parse(token);
      if (!names || names.has(name)) throw new Error("duplicate_json_member");
      names.add(name);
    }
  }
  return value;
}
