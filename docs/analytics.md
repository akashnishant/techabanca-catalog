# Catalogue analytics (M11)

## Collection and meaning

The public worker records six server-derived events for eligible requests to the active immutable publication. It never reads authoring item text for analytics.

| Event | Meaning |
| --- | --- |
| `catalogue_view` | Successful GET of home, catalogue/category results, item details, about or contact. Includes repeated page requests. |
| `item_view` | Successful GET of a published item detail page; also contributes a page view. |
| `search` | Successful first page of a nonempty catalogue search, including zero results. Search text is never stored. |
| `whatsapp_click` | GET of the published WhatsApp action redirect. Counts an open attempt, not a message or conversation. |
| `enquiry_started` | Successful GET displaying an available enquiry form. This is a form-open proxy, not typing detection. |
| `enquiry_submitted` | New validated, accepted enquiry. Atomic with the enquiry insert; duplicate nonce retries do not increment again. |

Counts are requests/actions, **not unique visitors** or sessions. A refresh can count again. Today is a partial UTC day. Known bots, missing user agents, HEAD, health/asset/robots requests, errors, canonical redirects, prefetch/prerender, non-document/non-navigation fetches and private previews are excluded. Requests with `DNT: 1` or `Sec-GPC: 1` are excluded, including submissions and WhatsApp actions. Bot detection is a heuristic, not an identity guarantee; deliberate replay and unrecognized bots can inflate page/action counts. This data is unsuitable for billing or fraud decisions.

There are no analytics cookies, browser storage identifiers, visitor hashes, tracking scripts or arbitrary client event ingestion endpoint. Analytics stores no IP, user agent, referrer, URL/query/search text, names, emails, phone numbers or enquiry text. The existing short-lived enquiry receipt cookie remains a form-success feature.

## Persistence and privacy

Migration `0022_catalogue_analytics.sql` adds `catalogue_analytics_daily`: catalogue ID, UTC day, allowlisted event, published item public ID (or empty) and count. Atomic upserts prevent lost increments. Each write rechecks route, active publication, organization, subscription publishing access, reserved slug and any published item dimension inside the write. Publication versions remain immutable.

Enquiry aggregates join the existing D1 transaction after its guarded activity insert. A repeated submission nonce, validation failure, rate rejection or honeypot does not create another metric. Privacy opt-outs still permit valid enquiries without analytics. Deleting or expiring an enquiry does not subtract historical aggregate activity. Item labels come only from versions that were actually activated, with a generic fallback if publication metadata has been removed; authoring drafts and sealed private previews cannot supply labels.

Daily aggregates have a technical retention default of **400 UTC days**, including today. The existing daily `0 3 * * *` management-worker schedule deletes older aggregate rows in at most 20 batches of 500, independently of enquiry retention, and reports a backlog as an error. Removing a catalogue cascades its aggregates. No legal or commercial retention policy is asserted by this default.

Page collection fails open if aggregate writes are unavailable. Accepted-enquiry counters are transactional. Optional Analytics Engine emission is best effort after successful D1 persistence, so the two stores can differ if telemetry is unavailable. The dashboard uses D1 directly; no remote query token is needed and no scheduled sampled-data import can double-count it.

## Analytics Engine adapter

The optional public-worker binding is `CATALOGUE_ANALYTICS: AnalyticsEngineDataset`. Schema v1 uses one index (catalogue public ID), four ordered blobs (`v1`, event, publication public ID, item public ID or empty), and one double (`1`). Values are server-derived, with no request/contact fields. Write failures never prevent page access or an already accepted enquiry.

No remote dataset or binding is created or activated by M11. The adapter is tested with synthetic writers. Future approved staging configuration must use a Catalogue-specific dataset and must not reuse Billing resources. Staging/production provisioning remains behind the existing reviewed resource decision. Do not add credentials or broadly authorize Cloudflare resources to make local analytics work.

Cloudflare documents a single sampling index and nonblocking writes; its current raw-event retention is three months. D1 aggregates supply the longer dashboard history. Reference: [write API](https://developers.cloudflare.com/workers/examples/analytics-engine/), [limits and retention](https://developers.cloudflare.com/analytics/analytics-engine/limits/). There is no remote Analytics Engine SQL or GraphQL integration in this milestone.

## Management API and workspace

`GET /api/v1/catalogue/analytics?days=7|30|90` requires a current authenticated member and the selected organization header. It is an uncached, read-only basic dashboard for owner/admin/editor roles. Historical data remains readable after subscription expiry; collection and public access still require the publication policy. No commercial analytics tier has been invented or seeded.

The API rejects unknown/duplicate query parameters. It returns six totals, the preceding equal-length period, zero-filled UTC daily rows, up to ten top items, publication availability and generation time. Tenant scope is resolved from membership rather than a caller-provided catalogue or organization ID. Responses are `no-store` and use safe errors.

The Analytics workspace replaces the placeholder with range selectors, metric cards, comparisons, an interactive metric trend selector, an accessible exact-values table and top items. It supports unpublished/empty/error/loading states and mobile layouts. Requests are abortable and guarded against stale completion during rapid range or organization changes.

## Verification and remaining release work

Automated coverage includes UTC/leap-day ranges, opt-outs and bots, server event boundaries, published item checks, tenant roles/revocation, bounded queries, retention cutoff, minimal Analytics Engine fields, unavailable telemetry/storage, concurrent increments and enquiry nonce retries. Browser verification uses the existing synthetic local catalogue, desktop/mobile dashboard flows and restored QA state.

Before remote release: approve and provision isolated staging resources, configure the separate Analytics Engine dataset, validate real remote delivery/retention and monitoring, and complete security/performance/pilot milestones. These metrics do not prove conversations, sales, unique visitors or production readiness.

## Combined local development

Run `npm run dev:local` from the repository root (or `npm.cmd run dev:local` in PowerShell). Stop separate `dev:app` and `dev:public` processes first. The combined command serves the workspace on `http://127.0.0.1:5173` and public catalogues on `http://<slug>.localhost:5174`, with one Vite/Miniflare instance owning local D1/R2. A loopback-only HTTP proxy preserves public port 5174.

Concurrent browser testing on Windows exposed local D1 contention when two independent development runtimes shared the persistence directory. The combined workflow runs the public worker as a local auxiliary worker and dispatches only `.localhost` catalogue hosts to it. Management hosts retain their normal route checks. The auxiliary worker and service binding exist only for `vite serve` in this explicitly selected local mode; staging/production builds and deployment resource files remain unchanged. Remote bindings are disabled in this development setup.

This follows Cloudflare's [multi-worker development guidance](https://developers.cloudflare.com/workers/local-development/multi-workers/). The regular per-worker dev scripts remain available for independent work, but combined browser/database testing should use `dev:local`. Local migrations use the same existing root `.wrangler/state`. No data is reset or copied.
