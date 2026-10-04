# Techabanca Catalogue

Standalone catalogue SaaS for business products and services.

## Current development state

Authentication/tenancy, resumable onboarding, catalogue authoring, typed item
specifications, and local asset/media authoring are implemented. Milestone 5 uses
verified image/PDF uploads, item attachments, reusable uploads, and business
logo/hero settings.

Public catalogue rendering and publishing are the next milestones. The Public
Worker currently serves its foundation page and health endpoint. Source items
marked published are not automatically public-live.

Catalogue stays separate from Techabanca Billing: repository, database, storage
and deployment. No remote Catalogue resources have been provisioned.

## Workspaces

- `apps/catalogue-app`: React/TypeScript management SPA and same-origin Hono Worker API
- `apps/catalogue-public`: Hono/TypeScript public Worker, reserved for immutable published read models
- `packages/domain`: shared types, policies and validation helpers
- `database/migrations`: additive D1 migrations
- `docs`: asset HTTP and media-authoring contracts

## Local development (Windows PowerShell)

Use npm and a supported Node.js release (the tested local environment is Node
24.16.0). Install dependencies from the repository root with `npm.cmd install`.

Set a cryptographically random, 64-hex-character
`ASSET_UPLOAD_SIGNING_SECRET` in the App's ignored `.dev.vars`; never commit it.
See [asset upload documentation](docs/asset-uploads.md).

From the repository root:

~~~powershell
npm.cmd run db:migrate:local
npm.cmd run verify
~~~

Run each service from its own terminal:

~~~powershell
Set-Location apps/catalogue-app
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
~~~

~~~powershell
Set-Location apps/catalogue-public
npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort
~~~

Management: http://127.0.0.1:5173/
Public foundation: http://127.0.0.1:5174/

Local D1/R2 state is retained under the project's ignored `.wrangler` directory.
Register a local account and complete onboarding to enter the authoring workspace.

## Verification and media contracts

`npm.cmd run verify` runs workspace typechecks, tests and production builds.
Focused media tests are in `apps/catalogue-app/test/media-http.spec.ts`.

See [item and website media](docs/item-media.md) for attachment limits, optimistic
revisions, editor save semantics, private previews and file retention.
