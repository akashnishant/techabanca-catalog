# Techabanca Catalogue

Standalone catalogue SaaS for business products and services.

## Current development state

Authentication/tenancy, resumable onboarding, catalogue authoring, typed item
specifications, and image/PDF media authoring are implemented. Milestone 6 adds
the server-rendered public catalogue with Professional and Modern themes,
search/filter/pagination, item details and direct contact actions.

The Public Worker reads activated immutable snapshots. Source items marked
published are not automatically public-live. The M7 publication builder and
activation workflow provide signed private previews, immutable snapshots,
atomic republishing, revision history and take-offline controls in Website.

Catalogue stays separate from Techabanca Billing: repository, database, storage
and deployment. No remote Catalogue resources have been provisioned.

M8 adds isolated staging configuration, host boundaries, a PowerShell deployment
workflow, release validation and routing/TLS checks. Live staging provisioning
and rollout await the separate remote-resource decision; see [staging](docs/staging.md).
Production resources and routing remain M17 and M18.

M9 adds signed public enquiry forms, published item context, an authenticated
business inbox, status changes, team notes, permanent deletion and a 365-day
availability default with daily retention cleanup. See [enquiries](docs/enquiries.md).


M10 adds a single-use 14-day trial, subscription usage/access checks and a gated
provider test lifecycle. No commercial prices or live payment credentials are
activated. See [subscriptions](docs/subscriptions.md).

M11 adds privacy-conscious catalogue analytics, daily UTC aggregates, trends,
top items, bot/prefetch filtering and privacy opt-outs. See [analytics](docs/analytics.md).

M12 adds canonical catalogue/item links, local QR generation with PNG/SVG downloads,
clipboard copy and prepared WhatsApp messages. See [sharing](docs/sharing.md).

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

Run the combined local workspace and public catalogue from one terminal:

~~~powershell
npm.cmd run dev:local
~~~

Stop any separate app/public development processes first. The combined command
runs both Workers in one local runtime so concurrent analytics reads and public
writes share a single D1 owner. It retains the same ports and local data.

Management: http://127.0.0.1:5173/
Public health: http://127.0.0.1:5174/health

Local D1/R2 state is retained under the project's ignored `.wrangler` directory.
Register a local account and complete onboarding to enter the authoring workspace.
For local preview and publishing configuration, including the shared signing secret,
see [publishing](docs/publishing.md). Use the combined local command for full application testing.

## Verification and contracts

`npm.cmd run verify` runs workspace typechecks, tests and production builds.

See [item and website media](docs/item-media.md) for attachment limits, optimistic
revisions, editor save semantics, private previews and file retention.
See [public rendering](docs/public-renderer.md) for routes, snapshot and tenant
boundaries, media responses, themes and local preview configuration.

See [publishing](docs/publishing.md) for signed previews, publication readiness,
atomic activation, entitlement enforcement and take-offline behavior.
