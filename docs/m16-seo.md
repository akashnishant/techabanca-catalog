# M16: SEO

## Scope

Continue from M15 commit `a22bd5344e8835e964fab115bf6e0477e9c65844` using the local Windows/PowerShell workflow. Public discovery uses the activated immutable snapshot and the existing publication, organization, catalogue and subscription gates.

## Canonical and indexing policy

- Production business pages use the normalized HTTPS business subdomain, ignoring forwarded hosts and tracking parameters.
- Each unfiltered catalogue/category page has its own canonical URL, including `?page=2` and subsequent pages. Page one omits the default parameter. Later pages remain indexable and retain crawlable Previous/Next links.
- Search/type/category-filter variants, empty listings, report pages, item-specific contact views, receipt views and form errors remain noindex. Fixed, populated category pages are indexable.
- Unknown/error pages omit canonical, sharing URLs/images and structured data.
- Staging/local pages remain noindex; crawler exclusion is retained across HTML, static and media responses. Signed preview pages omit canonical, sharing URL/image and structured data, retain no-store/no-referrer and stay inside the signed navigation prefix.

## Metadata and structured data

Descriptions use published home SEO settings and contextual item, category, About and Contact content. Blank values fall back correctly; whitespace is normalized, text is bounded and HTML attributes are escaped. Open Graph and Twitter card metadata use absolute canonical image URLs and image alternatives. Missing images use summary cards.

WebSite and Organization microdata describe the visible business name and canonical URL. Product/Service microdata describes the corresponding published item's visible name, description, SKU (products only) and images. BreadcrumbList microdata follows visible navigation with consecutive positions.

Microdata preserves script-free HTML and `script-src 'none'`. No offers, availability, ratings, reviews, checkout, invented addresses or hidden contact/price data are added. This semantic markup does not promise Product rich-result eligibility; quote catalogues do not necessarily have the offer/review properties required for that feature.

## Sitemaps

Production `/robots.txt` advertises `https://<business>.techabanca.com/sitemap.xml` and excludes preview, report and redirect paths. Private/staging/local robots disallow all crawling and advertise no sitemap.

| Route | Contents |
| --- | --- |
| /sitemap.xml | Index of static-page, item and populated-category shards |
| /sitemap-pages.xml | Home, catalogue and enabled About/Contact pages |
| /sitemap-items-N.xml | At most 1,000 published item URLs, sorted deterministically |
| /sitemap-categories-N.xml | At most 1,000 enabled, populated categories, including parents with populated children |

Every discovery request first resolves current public access. Shards query only the captured active publication ID. There are no editable-source reads, media URLs, filters, forms, signed tokens or building/retired revision URLs in discovery. Indexes are bounded to the sitemap protocol's 50,000-entry limit and fail closed on overflow. Missing/malformed shards return branded noindex 404s. XML is UTF-8 with escaped absolute URLs; GET and HEAD share headers. Tenant discovery responses are no-store and do not honor validators.

No lastmod/changefreq/priority is invented. Snapshot creation time alone is not a reliable signal of a substantive page-content change. Discovery excludes empty categories; the HTML category view remains useful and noindex.

## Verification

Run in PowerShell from the repository root:

```powershell
npm.cmd run staging:verify
npm.cmd run dev:local
```

The full gate includes all management/public/domain tests, deployment checks, performance tooling, typechecks, normal/staging builds, bundle budgets and both deployment dry runs. The aggregate local verify command has a ten-minute allowance for the expanded suite; other command timeouts remain five minutes. This changes no deployment permission or resource guard. The M14 security and M15 cache/revocation/performance suites remain intact. SEO tests cover metadata escaping/fallbacks, canonical pagination and filter policy, visible schema semantics, 1,003-item bounded sitemap coverage, disabled/empty categories, signed/staging/local exclusions, atomic revision switching, HTTP HEAD and immediate publication/access revocation.

Browser review uses the single local D1/Worker owner and task-owned Edge session. The public Worker is additionally compiled from the same source and run with a read-only SQLite adapter over the local published snapshot for isolated production-mode DOM checks. Intercepted browser requests use that Worker for HTML/XML and the existing local Worker for media. This checks parsed microdata, canonical/social tags, XML and mobile/desktop layout without contacting hosted production URLs or starting another persistent D1 owner. The adapter is QA-only; the automated suites exercise actual D1/Worker bindings.

QA evidence: `%TEMP%\techabanca-catalogue-qa-20261006-m16`. Final checkpoint records exact test totals, commit and browser outcomes. There is no schema migration.

## Release boundary

M16 is complete only for local implementation/verification. Hosted Google Rich Results/URL Inspection, Search Console submission, real crawler/indexing behavior, social-card provider fetches, remote resources/DNS/TLS and hosted performance/challenge-provider checks remain pending. No indexing or search-ranking result is promised.

Next roadmap milestone: M17 Production resources, followed by M18 Production wildcard and M19 Pilot. These remain blocked behind the existing M8 staging approval/review boundary. Do not retry or bypass that block, mutate Billing/payment/Cloudflare/DNS resources, merge main or promote production as part of M16.

## Primary references

- [Google pagination guidance](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)
- [Google structured data formats and visibility](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google breadcrumb microdata](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Schema.org Product](https://schema.org/Product) and [Service](https://schema.org/Service)
