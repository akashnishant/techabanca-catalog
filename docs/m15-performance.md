# M15: Performance

## Scope and baseline

Continue from verified M14 commit `8b98646e22be472532eee12e27752ea5c0999a3d` on the local Windows workflow. M15 covers bounded public reads, browser transfer reuse, management code loading and enforceable build budgets. M16 remains the separate SEO milestone.

Baseline management initial JavaScript: 492,387 bytes, 130,237 bytes gzip. The initial built graph after section splitting is 274,346 bytes, 81,354 bytes gzip, including its statically imported runtime: about 44% less raw JavaScript and 38% less compressed JavaScript. All management JavaScript is 520,655 bytes; deferred code is still available when its section is opened.

## Changes

- Lazy-load the authoring shell and platform console. Catalogue, categories, enquiries, website, analytics, sharing and subscription sections load on first use. Stable module-level lazy components retain normal state behavior. A shared accessible loader and error boundary preserve navigation and provide reload recovery.
- Add migration `0025_public_read_performance.sql`. Ordered publication indexes match catalogue, type, featured and category list ordering, including deterministic tie breakers. Query plans use these indexes without temporary ORDER BY trees.
- Fetch home category and featured collections concurrently. Featured reads have a fixed limit of six and do not compute a discarded total. About, contact, reporting, robots and unavailable pages do not read the category collection. Disabled home sections do not query their collections.
- Schedule optional page/WhatsApp analytics through the Worker execution context. Direct callers without an execution context still await the write. Persistence rechecks the current publication, organization, catalogue status and subscription; previews and privacy opt-outs schedule no work. Enquiry acceptance and its atomic analytics remain awaited.
- Bundle stylesheet/favicon responses have content-derived SHA-256 ETags and shared-cache revalidation. Theme variants are normalized to two supported themes, so the version map is bounded to three tenant-independent assets.
- Published media can be stored only in the browser and must revalidate on every reuse. Each request resolves current tenant/publication access before R2 metadata or a 304 response. HTML, forms, redirects, errors and signed previews retain no-store. Preview media ignores matching validators.

## Cache contract

| Content | Cache-Control | Access policy |
| --- | --- | --- |
| Tenant HTML, forms and redirects | no-store | Fresh visibility and subscription checks |
| Private preview pages and files | no-store | Fresh signed expiry, seal and revocation checks; no validator shortcut |
| Published images/PDFs | private, no-cache, must-revalidate | Fresh publication/access check before conditional response |
| Bundled CSS/favicon | public, max-age=0, must-revalidate | Tenant-independent; content-derived ETag |
| Unavailable/error responses | no-store | No old tenant asset validator |

There is no shared tenant HTML/media cache, stale-serving grace period, Cache API insertion, public R2 bucket or signed-preview cache. Already downloaded files or historical browser snapshots cannot be recalled by the server. Normal new media requests must revalidate.

## Verification

Run from the repository root in PowerShell:

```powershell
npm.cmd run staging:verify
```

This includes typechecks, all domain/management/public suites, deployment guards, performance-tool tests, normal builds, build budgets, staging builds, both deployment dry runs and staging build budgets. It performs no remote provisioning or deployment.

The build budget tool measures the initial static import graph and HTML module preloads, not just the entry filename. Dynamic imports are excluded from the initial graph but included in the total JavaScript budget. Tests exercise transitive imports, cycles, deferred imports, preloads, escaping paths and an oversized static dependency.

| Metric | Maximum bytes |
| --- | ---: |
| Initial JavaScript | 300,000 |
| Initial JavaScript gzip | 90,000 |
| All JavaScript | 650,000 |
| All JavaScript gzip | 180,000 |
| All CSS | 65,000 |
| All CSS gzip | 14,000 |

Public tests cover a 1,003-item snapshot with bounded 24-item pagination, literal search, item types and featured results; index plans; removal of unused queries; nonblocking analytics; revocation while an analytics write is deferred; HTTP GET/HEAD validators; cache policy; staged host/crawler boundaries; and preview file revocation.

Browser review uses the actual built management client on a temporary loopback-only static server with GET/HEAD API forwarding to the one existing local Worker/D1 owner. It checks every desktop section, mobile sections and resolved API data, anonymous code loading, delayed/failed section loading and recovery. Public-page review checks mobile/desktop layout, script-free HTML, actual network 304 responses and layout stability. The temporary static server is QA-only and does not validate hosted Worker configuration.

Evidence is stored in the task's `techabanca-catalogue-qa-20261005-m15` temporary directory. Initial one-pass local public samples measured home TTFB 225 ms and catalogue TTFB 184 ms after the changes; the previous local samples were 260 ms and 399 ms. These single local samples are diagnostic, not a production latency promise. Repeated CSS requests transferred about 300 bytes instead of 14,956 bytes; browser network events confirmed 304 responses. The five measured public pages had zero observed layout shift. The baseline `/items/precision-pump` URL was an unavailable fixture path and is excluded from before/after performance comparisons; the live item-detail path was read from the catalogue UI.

## Limits and next milestone

Hosted performance, geographically distributed latency, field Core Web Vitals and real challenge-provider validation remain unmeasured while staging provisioning is blocked. Large uploaded images retain the existing upload limits and original-byte serving; a managed transformation pipeline would require separate hosted resources and validation. Additional indexes increase snapshot insertion/storage cost; no snapshot data or publication pointer is changed by the migration.

Do not retry or bypass the existing M8 staging approval block. Do not mutate remote Cloudflare/DNS/payment resources, Billing resources, commercial offers, main or production. Master Techabanca branding and public subdomain policy remain unchanged. Next: M16 SEO, while preserving the M14 security and M15 cache/revocation regression suites.

Primary references: [React lazy](https://react.dev/reference/react/lazy), [Cloudflare execution context](https://developers.cloudflare.com/workers/runtime-apis/context/), [HTTP Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control).
