import { createServer, request } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// One Vite/Miniflare instance owns the shared local D1/R2 state. This proxy
// preserves public URLs on 5174 without starting a second storage runtime.
const root = fileURLToPath(new URL("../", import.meta.url));
const env = { ...process.env, CATALOGUE_LOCAL_SHARED_WORKERS: "true" };
delete env.CLOUDFLARE_ENV;
const vite = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)),
  "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
  cwd: fileURLToPath(new URL("../apps/catalogue-app/", import.meta.url)), env, stdio: "inherit",
});
const proxy = createServer((incoming, outgoing) => {
  const host = incoming.headers.host ?? "";
  if (!incoming.url?.startsWith("/") || incoming.url.startsWith("//") || !/^(?:[a-z0-9-]+\.localhost|127\.0\.0\.1|localhost):5174$/i.test(host)) {
    outgoing.writeHead(400, { "Content-Type": "text/plain", "Cache-Control": "no-store" }); outgoing.end("Use a local catalogue address."); return;
  }
  const headers = { ...incoming.headers, host: host.endsWith(".localhost:5174") ? host : "public.localhost:5174" };
  delete headers["proxy-authorization"];
  const upstream = request({ hostname: "127.0.0.1", port: 5173, method: incoming.method, path: incoming.url, headers }, response => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers); response.pipe(outgoing);
  });
  upstream.setTimeout(30000, () => upstream.destroy(new Error("local_worker_timeout")));
  upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(503, { "Content-Type": "text/plain", "Cache-Control": "no-store" }); outgoing.end("The local catalogue is starting. Try again shortly."); });
  incoming.on("aborted", () => upstream.destroy()); incoming.pipe(upstream);
});
let stopping = false;
function stop(code = 0) {
  if (stopping) return; stopping = true;
  proxy.close(); vite.kill();
  const timer = setTimeout(() => process.exit(code), 2000); timer.unref();
  vite.once("exit", () => process.exit(code));
}
vite.on("error", () => { console.error("Local Vite could not start. Run npm install in " + root); stop(1); });
vite.on("exit", code => { if (!stopping) { proxy.close(); process.exit(code ?? 1); } });
proxy.on("error", () => { console.error("Port 5174 is unavailable. Stop the separate public dev server before running dev:local."); stop(1); });
proxy.listen(5174, "127.0.0.1", () => console.log("Local Catalogue: workspace http://127.0.0.1:5173 · public catalogues http://<slug>.localhost:5174"));
process.on("SIGINT", () => stop()); process.on("SIGTERM", () => stop());
