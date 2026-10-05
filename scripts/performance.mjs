import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
export const budgets = { initialJsBytes: 300000, initialJsGzip: 90000, totalJsBytes: 650000, totalJsGzip: 180000, cssBytes: 65000, cssGzip: 14000 };
function files(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]); }
function inside(root, url, parent = root) {
  assert.ok(url.startsWith("/") || url.startsWith("./") || url.startsWith("../"), "Assets must use local build paths.");
  const target = path.resolve(url.startsWith("/") ? root : parent, url.startsWith("/") ? "." + url : url);
  const relative = path.relative(root, target);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Asset escapes the build directory.");
  return target;
}
export function measureBuild(directory) {
  const root = path.resolve(directory), html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const entries = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/g)].map(match => inside(root, match[1]));
  assert.ok(entries.length, "No JavaScript entry in built HTML.");
  for (const match of html.matchAll(/<link\b[^>]*>/g)) {
    if (/\brel="modulepreload"/.test(match[0])) {
      const href = /\bhref="([^"]+\.js)"/.exec(match[0]);
      assert.ok(href, "Module preload must reference local JavaScript.");
      entries.push(inside(root, href[1]));
    }
  }

  const initial = new Set();
  function visit(file) {
    if (initial.has(file)) return;
    initial.add(file);
    const body = fs.readFileSync(file, "utf8");
    const imports = [...body.matchAll(/\b(?:import|export)\s*(?:[^"'();]*?\s*from\s*)?["']([^"']+\.js)["']/g)];
    for (const match of imports) visit(inside(root, match[1], path.dirname(file)));
  }
  entries.forEach(visit);
  const metric = paths => paths.reduce((total, file) => { const data = fs.readFileSync(file); total.bytes += data.length; total.gzip += gzipSync(data).length; return total; }, { bytes: 0, gzip: 0 });
  const built = files(root), js = metric(built.filter(file => file.endsWith(".js"))), css = metric(built.filter(file => file.endsWith(".css")));
  const entry = metric([...initial]);
  return { initialJsBytes: entry.bytes, initialJsGzip: entry.gzip, totalJsBytes: js.bytes, totalJsGzip: js.gzip, cssBytes: css.bytes, cssGzip: css.gzip,
    initialFiles: [...initial].map(file => path.relative(root, file).replaceAll("\\", "/")) };
}
export function checkBudgets(report) {
  for (const [name, maximum] of Object.entries(budgets)) assert.ok(Number.isSafeInteger(report[name]) && report[name] <= maximum, name + " exceeds its budget (" + report[name] + " > " + maximum + ").");
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const directory = process.argv.includes("--staging") ? "dist-staging" : "dist";
  const report = checkBudgets(measureBuild(path.join(root, "apps/catalogue-app", directory, "client")));
  console.log("PERFORMANCE_BUDGETS_PASSED " + JSON.stringify({ ...report, budgets }));
}
