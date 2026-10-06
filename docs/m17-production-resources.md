# M17: production resource preparation

M16 is complete at 450a3a1. M17 prepares an isolated production D1 database,
private R2 storage, explicit Worker bindings and verifiable release artifacts.
This implementation completes the offline portion. Hosted M17 acceptance is
pending; the earlier M8 automatic approval rejection remains in force.

## Proposed resources

| Target | Exact value |
| --- | --- |
| Account | 00e59d5fe6cfdd53bdc0b8594b5dc8fa |
| D1 | techabanca-catalogue-production |
| Private R2 | techabanca-catalogue-production-assets |
| App Worker | techabanca-catalogue-app |
| Public Worker | techabanca-catalogue-public |
| Management host, reserved for M18 | catalogue.techabanca.com |
| Public suffix, reserved for M18 | techabanca.com |
| App retention schedule | 03:00 UTC daily, 365-day enquiry retention |

These are proposed production identities, not discovered/provisioned resources.
Both Workers must use the same new production DB and bucket, separate from local
and staging state. The guard refuses Billing's DB UUID (case-insensitively),
placeholder/malformed IDs, foreign accounts, staging names, public buckets,
unexpected fields and a supplied staging database UUID. Offline identity checks
cannot establish remote ownership or actual bucket privacy.

Billing's billdesk, billdesk-db, billdesk-files, taxlume, the company Pages
project and existing hosts remain protected. No data, credentials, entitlements
or commercial offers are copied from Billing or the local QA database.

## Windows PowerShell workflow

~~~powershell
.\scripts\Invoke-CatalogueProduction.ps1 -Action Plan
.\scripts\Invoke-CatalogueProduction.ps1 -Action Verify
.\scripts\Invoke-CatalogueProduction.ps1 -Action Check
~~~

The default is Plan. Equivalent npm commands are production:plan,
production:build, production:verify and production:check. These are local actions.
The CLI rejects provision, deploy, migrate, smoke, destroy, unknown actions and
additional flags before running a command. There is no remote mutation action.

Verify runs the existing full staging verification (typechecks, all automated
suites, normal/staging builds, performance budgets and two staging dry runs),
then separate production builds, two production dry runs and artifact checks.
The outer staging verification timeout is fifteen minutes; existing inner
command limits remain unchanged.

CLOUDFLARE_ENV=production is selected at Vite build time. Outputs are confined to
each app's ignored dist-production directory. Changing the environment only
when deploying cannot turn a previously built local/staging bundle into a
production bundle.

Both Wrangler files explicitly repeat production vars, D1/R2 bindings, access
flags, routes and triggers. DEPLOYMENT_ENVIRONMENT=production,
LOCAL_PREVIEW=false and ALLOW_UNSUBSCRIBED_PUBLISHING=false preserve production
host gates and entitlement enforcement. workers.dev and version previews are
disabled. Public has no SPA or cron. App retains Worker-first SPA routing and
the existing enquiry cleanup cron.

M17 has **no routes**: no management Custom Domain and no wildcard route.
Routing/DNS/TLS remains M18. Offline production configs retain the zero DB UUID.
They are deliberately non-deployable even after all local checks pass.

## Release evidence and secret handling

The ignored .wrangler/production/build-manifest.json records source SHA-256,
complete artifact inventories/digests, the ordered SQL migration inventory,
performance metrics and explicit deployable=false/remoteMutations=false flags.
A Build without Verify has no verified source hash; Check rejects it.

Check rejects source/migration changes, modified/missing/additional files,
duplicates, traversal/absolute/noncanonical paths, symlinks, ambiguous configs,
missing/out-of-bounds Worker entries or SPA assets, unexpected bindings/vars,
copied .dev.vars/.env files and budget overruns. Generated configs are inspected
again even if their file hashes were resealed. Verification is tied to source
and artifact bytes, not simply to the Git commit label.

The Vite plugin may copy local .dev.vars files into build output for preview.
Production preparation removes only these generated copies and verifies the
remaining inventory. Original local signing files are not read, changed or
printed by this script. No production signing keys are generated or installed.

Production security configuration must eventually contain distinct, production-only
upload signing and auth rate-limit keys, a preview signing key shared only by
the production Workers, and a real Turnstile site/secret key scoped to the
production management host. App needs all five names listed in the plan;
Public receives only PUBLICATION_PREVIEW_SECRET. Secrets must remain outside
plain Wrangler vars, process arguments, logs, Git and release artifacts. Existing
hosted authentication fail-closed behavior remains covered by M14 tests.

The resource plan and local manifest are review material; neither authorizes
hosted rollout. No migration is introduced or applied by M17 preparation.

## Hosted acceptance after the separate decision

1. Resolve the existing remote-resource approval boundary and complete actual
   hosted staging acceptance. Record the reviewed commit and exact resource scope.
2. Confirm the account and exact production names through the normal Cloudflare
   session. Inspect existing named resources before creation/reuse. Record the
   new D1 UUID and the staging UUID; validate isolation and remote ownership.
3. Create/reuse only the reviewed production D1 and private R2 targets. Confirm
   R2 public development URLs and custom domains are disabled. Record privacy
   evidence. Do not seed local QA data or copy Billing data.
4. Review the sealed migration inventory and apply only those additive migrations
   to the new production D1. Record migration history and health/schema checks.
   Establish D1 recovery and R2 backup/recovery procedures before customer data.
5. Configure the production-only security bindings through standard secure
   Cloudflare secret tooling. Verify the challenge hostname and fresh-key
   separation without exporting credentials or printing secret values.
6. Produce a separately reviewed, verified release bound to real resource IDs.
   This requires later rollout tooling; the M17 offline CLI intentionally cannot
   create such a deployable release.
7. Carry routing/DNS/TLS into M18. Review wildcard precedence and all protected
   existing hosts before activation. Record actual Worker versions and hosted
   authenticated/public acceptance before M19 pilot traffic.

Database/storage creation, migration, secret installation, Worker deployment,
DNS/TLS changes and hosted testing are **not** completed by this milestone's
offline implementation. No paid certificate or payment action is included.

Recovery must preserve additive schema changes and stored customer data.
A code rollback cannot reverse migrations, restore R2 objects or substitute
local fixtures for hosted acceptance. No automatic deletion or schema rollback
is provided.

## Primary references

- https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/
- https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/
- https://developers.cloudflare.com/workers/wrangler/configuration/
