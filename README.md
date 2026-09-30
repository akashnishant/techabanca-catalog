# Techabanca Catalogue

Standalone Techabanca catalogue SaaS.

## Milestone 0

This repository currently contains only the engineering foundation:

- `apps/catalogue-app` â€” React + TypeScript management SPA with a Cloudflare Worker API
- `apps/catalogue-public` â€” Hono + TypeScript public catalogue Worker
- shared workspace package placeholders
- TypeScript, Vite, Tailwind CSS, Wrangler, and Cloudflare Workers test infrastructure

No database, authentication, payment, DNS, production resources, or product business logic are created in Milestone 0.

## Requirements

Use a current supported Node.js release. The scaffold enforces Node 20.19+, Node 22.12+, or a newer supported major.

## Commands

```powershell
npm install
npm run typecheck
npm run test
npm run build
npm run dev:app
npm run dev:public
```

## Git

Initial development branch:

`feature/catalogue-foundation`