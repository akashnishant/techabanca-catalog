import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "techabanca-catalogue-public",
  }),
);

app.get("/", (c) =>
  c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Techabanca Catalogue</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; background: #eef4f1; color: #081014; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      section { width: min(760px, 100%); background: white; border: 1px solid rgba(8,16,20,.1); border-radius: 28px; padding: 36px; box-sizing: border-box; }
      span { display: inline-block; border-radius: 999px; background: #081014; color: #baf16d; padding: 6px 11px; font-size: 12px; font-weight: 700; letter-spacing: .05em; }
      h1 { margin: 22px 0 12px; font-size: clamp(36px, 7vw, 64px); line-height: 1; letter-spacing: -.04em; }
      p { max-width: 620px; color: rgba(8,16,20,.65); line-height: 1.7; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <span>TECHABANCA CATALOGUE</span>
        <h1>Public catalogue foundation is running.</h1>
        <p>This Worker will later resolve business subdomains and server-render published catalogues. No customer catalogue logic exists in Milestone 0.</p>
      </section>
    </main>
  </body>
</html>`),
);

export default app;