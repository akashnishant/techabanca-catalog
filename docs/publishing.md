# Publication workflow and private previews (M7)

Source edits stay private until an owner or admin reviews and activates an immutable
publication. Setting an item to Published source selects it for the next snapshot;
it does not expose the current draft on the public website.

## Website workflow

1. Save item, category, specification, contact and website image changes.
2. Open Website and refresh publishing status. Resolve readiness issues.
3. Prepare private preview. The server verifies attached files and freezes the
   selected source revision in a single D1 transaction.
4. Open the private link and review the website. Tick the review checkbox and
   publish that revision. Source changes, expiry, permission changes and a changed
   live revision prevent stale activation.
5. Subsequent edits leave the current public revision intact. Prepare and review
   another revision to replace it. Take catalogue offline removes the public route
   and closes private previews while retaining source data and snapshot history.

Editors can read status and history but cannot prepare, publish, discard or unpublish.
The UI blocks preparation and activation while website images are loading, uploading,
saving or have unsaved changes. Other screens save through their existing APIs.

## Snapshot boundaries

Only nondeleted items marked `published` in visible categories are selected.
A hidden parent category excludes its children and their items. Uncategorized items
are allowed. Draft and hidden items, hidden specifications and hidden documents
are excluded. Disabled About/contact fields, hidden price amounts/currencies, and
disabled category navigation data are omitted from the snapshot.

Readiness requires a business name, active business type and theme, public slug,
at least one eligible item, applicable required specifications and valid image
selection. Attachments must have verified same-organization metadata and allowed
size/type. R2 existence, size, content type, ETag and SHA-256 are checked before
preparation and activation. Missing contact channels produce a warning and do not
force intentionally hidden contact sections to be enabled.

M7 bounds one revision to 1,000 eligible items and 100 distinct files. Snapshot
inserts are set-based. Authoring revisions increment through database triggers
for item/category/profile/media/website changes and relevant preset changes.
Publication status changes do not themselves mark source content dirty.

Completed setup is tracked separately from draft publishing readiness. A published
catalogue remains accessible in the workspace after a new sign-in, including
when source items have subsequently been removed. An expired management session
clears private preview controls and asks the owner to sign in again. Temporary
authentication storage failures return 503 without erasing a valid session cookie;
a retry can recover once storage is available.

D1 change counts can include authoring-revision trigger writes. Guarded authoring
updates therefore treat any positive change count as success; their version
predicates continue to reject stale updates.

Each candidate is sealed before its preview is returned. INSERT, UPDATE and DELETE
are forbidden on all six sealed snapshot tables, even while the publication is
building. Source uploads referenced by any snapshot remain protected from deletion.
Retained history does not imply a supported restore action or public access.

## Signed private links

The App and Public Workers share `PUBLICATION_PREVIEW_SECRET`, a cryptographically
random 64-hex-character secret stored in ignored local configuration or platform
secrets. Generate it with Node's `crypto.randomBytes(32).toString("hex")` and write
it directly into the configuration; never log or commit the generated value.

Links use `/preview/<signed-token>/` and expire after 15 minutes. HMAC-SHA256 binds
the publication ID, catalogue hostname and exact persisted expiry. Links can be
opened without a management session; anyone holding a valid link can view that
candidate. Do not share a link outside its intended reviewers. Tokens are not
stored in localStorage or returned by history/status endpoints.

A new preparation supersedes older private previews. Activation, discard,
unpublish, organization suspension and expiry close preview access, including
media. Only sealed, unrevoked building revisions are eligible. Preview navigation,
GET forms, styles and media stay beneath the signed path. Pages and files use
no-store and no-referrer; crawler headers and HTML use noindex/nofollow. Canonical
URLs refer to the public website and do not contain tokens. Public requests
without a signed path resolve only the active route.

## Atomic activation and authorization

A guarded D1 batch claims a unique catalogue write token only when the exact
authoring revision, baseline live route, candidate expiry, organization state,
current membership and publishing policy still match. Retirement of the old
revision, activation of the new one, route change, catalogue metadata and audit
event are conditional on that claim and commit together. Any statement failure
rolls the whole batch back. A losing claim cannot modify the winner.

Repeated activation of the already-active revision is idempotent. Duplicate
successful requests create one activation audit event. Discard is idempotent.
Unpublishing requires the exact current live publication and source revision.
An expired publishing entitlement does not prevent an owner/admin from taking
their catalogue offline or discarding a preview. Moderation suspension remains
protected.

API endpoints below require authentication and an explicit
`X-Techabanca-Organization` header. Mutations also require the existing same-origin
request boundary. JSON input is strictly shaped and limited to 2 KiB.

| Method | Route under `/api/v1/catalogue/publications` | Input |
| --- | --- | --- |
| GET | base route | None |
| POST | `/prepare` | `{sourceRevision}` |
| POST | `/activate` | `{publicationId, sourceRevision}` |
| DELETE | `/:publicationId` | None |
| POST | `/unpublish` | `{publicationId, sourceRevision}` |

Errors use sanitized messages; storage keys and SQL failures are not exposed.
Audit events retain actor, organization, action and public publication ID.

## Entitlements and local setup

Publishing requires an active plan and an explicit boolean `catalogue.publish`
grant on an active or trialing subscription, with a nonexpired trial/period when
those dates are configured. Past-due, canceled, expired and false grants fail
closed. Subscription checkout and commercial plan configuration remain M10.

The committed `ALLOW_UNSUBSCRIBED_PUBLISHING` default is false. Local QA opts into
true in the App's ignored `.dev.vars` only for organizations with no subscription
history. Existing invalid subscriptions never use this fallback. Keep this flag
false for production paid-plan enforcement.

Set the same preview signing secret in both Workers' ignored `.dev.vars`.
Set `LOCAL_PREVIEW=true` in both for local hostname URLs:
management at `http://127.0.0.1:5173/`, catalogue at
`http://<slug>.localhost:5174/`. Both flags have committed false defaults and
automated tests override local configuration explicitly.

Apply migration 0019 from the repository root with `npm.cmd run db:migrate:local`.
Run `npm.cmd run verify`; start the App and Public workspaces on ports 5173/5174
as documented in the README. Local publishing modifies local D1/R2 state only.
Production resource provisioning, deployment and wildcard hostname routing are
M8. Stored visitor enquiries are M9. Techabanca Billing remains separate.

## Verification

Automated tests cover signed claims and encoding, tenant/session/role boundaries,
policy changes during verification, source counters, hidden-data exclusion,
sealed snapshot writes, R2 integrity, stale and expired previews, concurrent
activation/preparation, forced rollback, suspension and unpublishing. Public
tests exercise signed navigation, native filters, media ranges, canonical/error
routes and long literal searches. Browser QA complements these with owner/editor
controls, review gating, published-draft isolation, retries, mobile layouts,
PDF downloads and the complete preview/publish/republish/offline cycle.
