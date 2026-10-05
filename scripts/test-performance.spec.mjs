import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkBudgets, measureBuild } from "./performance.mjs";
function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalogue-performance-test-")); fs.mkdirSync(path.join(root, "assets"));
  try { fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
test("measures static dependencies once and excludes deferred imports from initial loading", () => fixture(root => {
  fs.writeFileSync(path.join(root, "index.html"), '<script type="module" src="/assets/index.js"></script>');
  fs.writeFileSync(path.join(root, "assets/index.js"), 'import {a} from "./shared.js"; import "./shared.js"; import("./deferred.js");');
  fs.writeFileSync(path.join(root, "assets/shared.js"), "export const a=1;");
  fs.writeFileSync(path.join(root, "assets/deferred.js"), "export const data='" + "a".repeat(100) + "';");
  const report = measureBuild(root);
  assert.deepEqual(report.initialFiles.sort(), ["assets/index.js", "assets/shared.js"]);
  assert.ok(report.totalJsBytes > report.initialJsBytes); checkBudgets(report);
}));
test("includes transitive exports and cycles without double counting", () => fixture(root => {
  fs.writeFileSync(path.join(root, "index.html"), '<script type="module" src="/assets/index.js"></script>');
  fs.writeFileSync(path.join(root, "assets/index.js"), 'export {a} from "./shared.js";');
  fs.writeFileSync(path.join(root, "assets/shared.js"), 'import "./index.js";export const a=1;');
  assert.equal(measureBuild(root).initialFiles.length, 2);
}));
test("fails a misleading small entry when its static dependency exceeds the initial budget", () => fixture(root => {
  fs.writeFileSync(path.join(root, "index.html"), '<script type="module" src="/assets/index.js"></script>');
  fs.writeFileSync(path.join(root, "assets/index.js"), 'import "./shared.js";');
  fs.writeFileSync(path.join(root, "assets/shared.js"), "a".repeat(300001));
  assert.throws(() => checkBudgets(measureBuild(root)), /initialJsBytes exceeds/);
}));
test("rejects absent entries and imports that escape the build directory", () => fixture(root => {
  fs.writeFileSync(path.join(root, "index.html"), "<html></html>");
  assert.throws(() => measureBuild(root), /No JavaScript entry/);
  fs.writeFileSync(path.join(root, "index.html"), '<script src="/assets/index.js"></script>');
  fs.writeFileSync(path.join(root, "assets/index.js"), 'import "../../outside.js";');
  assert.throws(() => measureBuild(root), /escapes/);
}));
test("counts HTML module preloads and their dependencies in the initial graph", () => fixture(root => {
  fs.writeFileSync(path.join(root, "index.html"), '<script src="/assets/index.js"></script><link href="/assets/preload.js" rel="modulepreload">');
  fs.writeFileSync(path.join(root, "assets/index.js"), "export const a=1;");
  fs.writeFileSync(path.join(root, "assets/preload.js"), 'import "./shared.js";');
  fs.writeFileSync(path.join(root, "assets/shared.js"), "export const b=2;");
  assert.equal(measureBuild(root).initialFiles.length, 3);
}));
