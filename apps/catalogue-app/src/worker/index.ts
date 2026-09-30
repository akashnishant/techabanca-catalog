import { Hono } from "hono";

const app = new Hono();

app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    service: "techabanca-catalogue-app",
  }),
);

export default app;