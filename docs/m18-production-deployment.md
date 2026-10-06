# M18 — production-only management deployment

The user approved production deployment on 6 October 2026 at https://catalogue.techabanca.com. The release workflow is local development and regression testing, followed by a limited production pilot. Hosted staging is optional and is not a prerequisite for this approved release.

## Scope and isolation

- Management Worker: techabanca-catalogue-app, exact custom domain catalogue.techabanca.com.
- Public Worker: techabanca-catalogue-public, with the exact approved pilot custom domain example-industries.techabanca.com and no workers.dev exposure. Other business hosts and wildcard routing remain separate pending steps.
- D1: techabanca-catalogue-production.
- R2: techabanca-catalogue-production-assets, with r2.dev disabled and no public custom domains.
- Preserve Billing's database, bucket, Worker, DNS and payment configuration. Preserve the company site and other existing applications.
- Do not activate a broad *.techabanca.com route until existing host/route ownership and exclusions have been verified.
- Do not enable unsubscribed publishing or reuse Billing security bindings.

## Local PowerShell workflow

Run from the repository root:

~~~powershell
.\scripts\Invoke-CatalogueProduction.ps1 -Action Provision
.\scripts\Invoke-CatalogueProduction.ps1 -Action Verify
.\scripts\Invoke-CatalogueProduction.ps1 -Action Check
~~~

Provision refuses unrecorded resource name collisions. Resource identifiers are recorded in ignored .wrangler/production/resources.json. Source Wrangler production configs retain placeholder IDs. The verified build substitutes only the recorded isolated database ID into the generated production configs and seals the complete files, migrations and performance evidence.

Verify runs the normal local type checks, application, public Worker, domain, deployment and performance tests, then builds and dry-runs both production Workers. It does not require a hosted staging environment and does not mutate Cloudflare.

## Security and activation

A dedicated Cloudflare Turnstile widget must allow catalogue.techabanca.com. Use managed mode with pre-clearance disabled. The application verifies the token against the exact hostname, action and challenge timestamp.

Store the site key and secret locally without putting the secret in chat or Git:

~~~powershell
.\scripts\Invoke-CatalogueProduction.ps1 -Action ConfigureSecurity
.\scripts\Invoke-CatalogueProduction.ps1 -Action Deploy
.\scripts\Invoke-CatalogueProduction.ps1 -Action Smoke
~~~

ConfigureSecurity prompts for the secret as a secure string. Production signing keys are generated once and kept in ignored .wrangler/production/security.json. Never delete this file after deploying; losing it must not silently regenerate keys. Upload files are short-lived, Git-ignored and removed after each Worker deploy. Wrangler deploy --secrets-file installs the bindings with the Worker version.

If the widget cannot yet be configured, the explicitly named Bootstrap action deploys a closed pilot: the management URL, static application, health endpoint and isolated migrated resources are live, while registration and login return 503. This is a partial deployment, not completed authentication acceptance. Bootstrap refuses a locally recorded active deployment and a configured widget. It must never relax the application's fail-closed authentication.

~~~powershell
.\scripts\Invoke-CatalogueProduction.ps1 -Action Bootstrap
.\scripts\Invoke-CatalogueProduction.ps1 -Action Smoke
~~~

Deploy requires all dedicated production security bindings before remote migrations or Worker upload. Both deployment actions require unchanged, locally verified artifacts and remotely verified database ownership and bucket privacy. No destructive cleanup action is exposed.

## Existing Turnstile widget

Follow the guarded existing-widget flow at https://developers.cloudflare.com/turnstile/spin/prompt.md. Use a user-approved canonical Wrangler executable outside this repository, require version 4.109 or later, pin its exact version and the Catalogue account, and disable disk/debug logs before a secret-bearing command. Confirm the existing production Worker with secret list using the same configuration and environment as each secret write. Do not combine --name with --env when that would append an extra suffix; the approved production configuration already resolves the exact Worker name.

Validate the widget site key, allowed hostnames and clearance level before retrieving its secret. Keep the secret in memory, validate it against Siteverify, and pass it through standard input to the existing ignored production secret store and the canonical Wrangler secret put command. Never print widget JSON, put secrets in arguments or exported environment variables, or use project package resolution for credential-bearing commands. Existing-widget recovery does not require temporary upload files.

Catalogue uses TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY. Production accepts only the exact request hostname catalogue.techabanca.com and the expected auth_login or auth_register action, including a current challenge timestamp. Localhost permissions on the widget do not relax the production backend. Preserve the widget mode and clearance level, existing hostnames, and the three unrelated production signing keys.

The frontend retains each widget ID and calls turnstile.reset after a submission completes while the form remains active. Retries stay disabled until a fresh callback supplies a token. Changing authentication mode removes the old widget, and callbacks from the removed widget cannot unlock the new form.

For an already-deployed Worker, canonical secret put activates the bindings. A subsequent code-only deploy of the verified production artifact preserves these installed secrets; do not retrieve or re-upload them just to deploy frontend changes. Acceptance requires a fresh real token through the protected backend, a successful request, and replay rejection. A dummy secret probe and binding-name checks alone are not end-to-end acceptance.

## Acceptance and remaining release steps

Record the Worker version IDs and source seal, DNS/TLS result, management UI checks, expected anonymous API responses, private storage checks and protected-host observations. Smoke distinguishes configured authentication from pending Turnstile and records this in ignored deployment evidence.

Complete real registration/login and authenticated production pilot checks only after the dedicated Turnstile widget is active. Test public publishing only after safe business-host routing is configured. Commercial offers remain inactive; no Billing entitlement or payment changes are part of this deployment.

Historical M17 offline acceptance remains recorded in docs/m17-production-resources.md. This M18 approval supersedes its pending production authorization and mandatory hosted staging prerequisite for the scope above.

The Siteverify request uses the Workers-supported `manual` redirect mode and rejects every non-success HTTP status, including redirects. Its tests construct a native Worker request to check runtime options as well as the provider response.

Production authentication uses native scrypt (N=16384, r=8, p=5; 16 MiB working memory with a 32 MiB allocation cap), one of the [OWASP password storage settings](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). Hosted Workers limits PBKDF2 iterations below the previous 600000 setting. New accounts receive scrypt hashes; existing local PBKDF2 hashes retain verification support where their work factor is permitted. No production account or signing key is migrated or reset. Native interoperability and a simulated hosted PBKDF2 ceiling are release tests.

## Example Industries production pilot

On 6 October 2026 the user explicitly requested publication of the supplied Example Industries account at its reserved example-industries.techabanca.com address. Production configuration now permits this exact Public Worker custom domain alongside the existing management domain. The route allowlist rejects every other business host, protected application host, wildcard, nested host, and path route. No Billing or company-site routing is part of this pilot.

Use the account’s existing owner publishing flow and an eligible explicitly started 14-day trial. Prepare and review the private snapshot before activation; do not change source items, invent account data, grant unsubscribed publishing, or activate paid plans. The pilot’s availability remains subject to its subscription entitlement.

Code-only canonical Wrangler deployment preserves installed secret bindings. Record both Worker versions, route/DNS/TLS and anonymous/public-page acceptance, the immutable published revision, screenshot hashes, and protected-host comparisons. Do not save credentials, browser profiles, session cookies, or signed preview links in release evidence or Git.
