# Catalogue landing page

The anonymous homepage at https://catalogue.techabanca.com introduces Catalogue before visitors enter their workspace. It follows the Techabanca Billing site's dark, lime and pale-green visual direction, using the existing Catalogue master brand and actual application screenshots.

## Account and workspace entry

- `#signin`: existing sign-in form.
- `#signup`: registration form opened directly.
- `#workspace/<section>`, `#admin` and `#setup`: existing authenticated application entry.
- Marketing anchors such as `#product`, `#workflow`, `#features`, `#pricing` and `#faq` stay on the landing page.
- Account creation does not publish a website or activate a subscription. Public website activation is still a separate launch requirement.

The application and its Tailwind stylesheet load only when a workspace route is requested. Returning to the landing page retains the normal session cookie. Authentication form mode follows browser history and clears entered fields when changing modes.

## Product images

The five JPEGs in `apps/catalogue-app/public/marketing/catalogue` are captures of the actual locally running Catalogue application with synthetic **Forma Studio** records. They contain no real customer data. Desktop images are 1440 × 960; mobile is 390 × 844. Captions identify the images as illustrative demo records. The Website capture deliberately shows the local publication workflow; it is not evidence of an activated customer domain.

When replacing a capture, wait for the specific data and media panels to finish loading before taking the screenshot. Keep images optimized and preserve their dimensions and meaningful alternative text. Do not stage browser profiles, account passwords, session cookies or preview tokens.

## Pricing and current availability

The Pricing section describes workspace setup at ₹0, separately from subscription access. It does not advertise a free perpetual publishing plan. Eligible owners/admins explicitly start the existing 14-day trial from Subscription; registration itself does not start it, and there is no card requirement or automatic paid conversion. Public website activation remains a separate launch requirement.

Paid prices are intentionally marked **To be announced**. Production rejects payment-provider configuration, and the current offer schema supports isolated test offers only. No provisional amounts, paid-plan features, commercial quotas, checkout controls or payment configuration were added. Before replacing this availability copy with live prices, complete a separate approved commercial/payment release.

Pricing links in the header and footer stay on the public landing page. Verify the direct `#pricing` URL, mobile menu, signup/sign-in CTAs and pricing layout at the existing viewport sizes.

## Validation

Run the complete release gate through the existing local PowerShell workflow:

```powershell
.\scripts\Invoke-CatalogueProduction.ps1 -Action Verify
```

Route tests cover public anchors, direct account entry and existing workspace deep links. Performance checks retain the JavaScript limits and separately cap initial landing CSS at 20 KB (6 KB gzip), all application CSS at 80 KB (17 KB gzip), and built raster image payload at 800 KB. The total CSS allowance includes the separately loaded workspace stylesheet and the new marketing page.

Browser acceptance covers all product-tour panels and image loads; arrow/Home/End tab navigation; FAQ keyboard behavior; mobile-menu open/close/Escape; anchor destinations; layout at 320, 390, 768, 1024 and 1440 pixels; registration/sign-in navigation and browser history; deep-link reload; and return to marketing after loading workspace CSS. Verify the real production Turnstile widget on account entry after deployment.

Keep all release evidence in the production checkpoint. Deploy only the existing Catalogue management Worker with its sealed production artifact and preserved secret bindings.
