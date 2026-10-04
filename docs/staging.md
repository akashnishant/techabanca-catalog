# M8: staging wildcard

M8 is isolated staging deployment and wildcard routing. Production resources and
production wildcard routing remain M17 and M18 in the original milestone plan.

The implementation is ready for local verification and a deployment dry-run.
Remote provisioning, DNS, TLS and deployment require the separate explicit
decision retained in the project handoff. A successful local build is not a
completed remote staging rollout.

## Exact staging plan

The non-secret deployment plan is in `deployment/staging-plan.json`.

| Target | Value |
| --- | --- |
| Cloudflare account | 00e59d5fe6cfdd53bdc0b8594b5dc8fa |
| Zone | techabanca.com |
| Management Worker | techabanca-catalogue-app-staging |
| Public Worker | techabanca-catalogue-public-staging |
| D1 | techabanca-catalogue-staging |
| Private R2 bucket | techabanca-catalogue-staging-assets |
| Management Custom Domain | catalogue-preview.techabanca.com |
| Public Worker route | *.catalogue-preview.techabanca.com/* |
| Public DNS record | Proxied A record for *.catalogue-preview.techabanca.com, 192.0.2.1 |
| Required public certificate coverage | *.catalogue-preview.techabanca.com |

The reserved documentation IP is an origin placeholder for the public Worker
route. The Worker serves responses directly and never fetches that origin.
The management Custom Domain is provisioned by Wrangler during its deployment.
Wildcard Custom Domains are unsupported, so the Public Worker uses a wildcard
route and proxied DNS.

Billing's `billdesk`, `billdesk-db`, `billdesk-files` and `taxlume` resources,
the company Pages project and existing production hosts remain protected.
No production route or resource is part of this plan.

## Environment boundaries

Both Wrangler files have an explicit `staging` environment. D1/R2 bindings and
variables are repeated rather than inherited from local configuration.
The staging D1 ID is a non-deployable placeholder until provisioning returns
the actual ID. Both Workers bind the same isolated staging database and bucket.

`DEPLOYMENT_ENVIRONMENT=staging` restricts the management Worker to its exact
management host and the Public Worker to one catalogue slug under the staging
suffix. Unknown, nested, production and local hosts are refused, including
utility endpoints and media. Forwarded hostname headers cannot select a
workspace or catalogue. Nonstandard ports are refused. HTTP redirects to HTTPS.

The App uses a separate `STATIC_ASSETS` binding for its SPA; the existing
`ASSETS` binding remains private R2 storage. Worker-first routing checks the
host before static content and ensures unknown API endpoints remain 404 rather
than returning the SPA. HTML uses no-store. Management pages, staging public
pages and files exclude crawlers. Staging public canonical URLs retain the
planned production URL.

Both `LOCAL_PREVIEW` and `ALLOW_UNSUBSCRIBED_PUBLISHING` remain false in staging.
Publishing still requires an explicit entitlement. Use synthetic businesses and
an explicit staging test entitlement for publishing QA; never route staging to
Billing or commercial subscription data.

`workers_dev` and version `preview_urls` are disabled. Local development keeps
its own D1/R2 persistence and explicit local preview opt-in.

## PowerShell workflow

The PowerShell entry point works with Windows PowerShell 5.1 and Node/npm:

~~~powershell
.\scripts\Invoke-CatalogueStaging.ps1 -Action Plan
.\scripts\Invoke-CatalogueStaging.ps1 -Action Verify
~~~

`Plan` has no network or mutation. `Verify` runs all type checks, automated
tests, normal production-format builds, separate staging builds and Wrangler
deployment dry-runs. It does not create remote resources or deploy Workers.

The environment is selected by `CLOUDFLARE_ENV=staging` at Vite build time,
and outputs go to each app's `dist-staging`. The deployment script uses those
generated configuration files explicitly. Selecting the environment only when
running `wrangler deploy` cannot change an already-built Vite artifact.

The Node orchestration script is `scripts/staging.mjs`. Root npm commands
`staging:plan`, `staging:build`, `staging:verify`, `staging:provision`,
`staging:deploy` and `staging:smoke` provide the same actions.

## Provision and deploy after the remote decision

1. Run `Provision`. It creates or reuses only the exact staging D1 and R2 names,
   records the actual UUID in ignored `.wrangler/staging/resources.json`,
   and checks their names and account again. It does not migrate data or deploy.
2. Configure the exact proxied wildcard DNS record and valid certificate coverage.
   Use a normal Cloudflare dashboard or CLI sign-in. The CLI workflow never reads
   or exports Wrangler's stored authentication credentials.
3. Run `Verify` again with the real staging bindings. This seals the verified
   source hash and release artifact hashes in an ignored build manifest.
4. Run `Deploy`. It checks the remote resource identity, source hash, artifact
   hashes, Worker names, routes, flags and binding whitelist. A random staging
   hostname must resolve and complete a verified TLS connection before any
   migration or Worker deployment.
5. Deploy applies additive migrations to the isolated staging D1, deploys both
   Workers, installs the signing secrets using Wrangler's standard secret-bulk
   command via stdin, and runs HTTPS/routing/API/crawler smoke checks.
6. Complete authenticated browser QA against the deployed management host and
   a synthetic published catalogue before declaring M8 complete.

No action merges a branch, deletes a resource, modifies Billing, changes a
production route or purchases a certificate product. The default action is Plan.

## TLS prerequisite

Cloudflare Universal SSL covers the zone apex and first-level subdomains.
It does not cover `<slug>.catalogue-preview.techabanca.com` on a full setup zone.
A valid wildcard certificate for `*.catalogue-preview.techabanca.com` must be
confirmed or separately configured. Advanced Certificate Manager or an existing
suitable certificate can supply this coverage; any paid change needs its own
concrete decision. Do not disable certificate verification or change the planned
hostname model to conceal missing wildcard TLS.

Cloudflare Workers Custom Domains create certificates for exact hostnames,
including deeper names, but they do not provide wildcard matching.

## Signing secrets and release integrity

The staging builder creates independent cryptographic signing keys in ignored
`.dev.vars.staging` files for local staging validation. Both Workers share the
preview signing key; only the App receives the upload signing key. Existing
partial or mismatched staging configuration is rejected rather than overwritten.
Local generic `.dev.vars` values cannot enable staging flags.

Generated local secret copies are removed from staging release outputs.
Remote secrets are installed through Wrangler stdin, not process arguments.
The script does not read Cloudflare login credential files.

A recorded release requires unchanged source and artifact bytes. Placeholder
database IDs, Billing IDs/names, foreign accounts, production routes, unexpected
bindings or flags, path traversal and unverified builds fail closed. If source
or artifacts change, run Verify again. If provisioning was not completed, a
local verified build remains explicitly non-deployable.

## Operational checks and recovery

`Smoke` checks verified HTTPS on a random wildcard hostname, management HTML,
health, same-origin auth refusal, unknown API refusal, management robots,
Public Worker health, unknown-catalogue 404 and crawler headers. It requires
deployed staging; failure is not reported as success.

The two Worker deployments are separate operations. If the second deployment
or a secret update fails, the script stops and records no successful deployment.
Inspect the staging Worker versions through Wrangler, restore the prior staging
version if needed, and rerun the verified release. Do not reverse additive D1
migrations or delete staging storage as a deployment rollback.

Cloudflare DNS/TLS changes and browser publishing QA remain explicit rollout
checks, even when local tests and artifact dry-runs pass.

## Primary references

- https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/
- https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- https://developers.cloudflare.com/workers/configuration/routing/routes/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/
