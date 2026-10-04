# Techabanca Catalogue

Standalone catalogue SaaS for business products and services.

## Current development state

Authentication/tenancy, resumable onboarding, catalogue authoring, typed item
specifications, and image/PDF media authoring are implemented. Milestone 6 adds
the server-rendered public catalogue with Professional and Modern themes,
search/filter/pagination, item details and direct contact actions.

The Public Worker reads activated immutable snapshots. Source items marked
published are not automatically public-live. The publication builder and
activation workflow are the next milestone.

Catalogue stays separate from Techabanca Billing: repository, database, storage
and deployment. No remote Catalogue resources have been provisioned.

## Workspaces

- `apps/catalogue-app`: React/TypeScript management SPA and same-origin Hono Worker API
- `apps/catalogue-public`: Hono/TypeScript public Worker for immutable published read models
- `packages/domain`: shared types, policies and validation helpers
- `packages/themes`: controlled public styles and locked master brand rules
- `database/migrations`: additive D1 migrations
- `docs`: asset HTTP, media authoring and public rendering contracts

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
npm.cmd run dev --workspace @techabanca/catalogue-app -- --host 127.0.0.1 --port 5173 --strictPort
~~~

~~~powershell
npm.cmd run dev --workspace @techabanca/catalogue-public -- --host 127.0.0.1 --port 5174 --strictPort
~~~

Management: http://127.0.0.1:5173/
Public health: http://127.0.0.1:5174/health

Local D1/R2 state is retained under the project's ignored `.wrangler` directory.
Register a local account and complete onboarding to enter the authoring workspace.
Public local previews require an activated test snapshot and the ignored
`LOCAL_PREVIEW=true` switch; see [public rendering](docs/public-renderer.md).

## Verification and contracts

`npm.cmd run verify` runs workspace typechecks, tests and production builds.

See [item and website media](docs/item-media.md) for attachment limits, optimistic
revisions, editor save semantics, private previews and file retention.
See [public rendering](docs/public-renderer.md) for routes, snapshot and tenant
boundaries, media responses, themes and local preview configuration.
