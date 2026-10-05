import { ENQUIRY_RETENTION_DAYS, type EnquiryInput, type EnquiryErrors } from "@techabanca/domain";
import type { Category, Detail, Filters, Item, ItemPage, Site } from "./model";
import { filterUrl, mediaUrl, type PublicHost } from "./routing";

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
const e = escapeHtml;
import { masterBrandHtml as brand } from "./brand";
function footer(site?: Site): string {
  return '<footer class="footer"><div class="wrap footer-row"><div><div class="footer-name">' + e(site?.business_name || "Techabanca Catalogue")
    + '</div><p>Products, services and conversations that move business forward.</p></div><div class="powered"><span>Powered by</span>' + brand + "</div></div></footer>";
}
function button(href: string, label: string, variant = ""): string {
  return '<a class="button ' + e(variant) + '" href="' + e(href) + '">' + e(label) + "</a>";
}
function phone(value: string | null): string | null {
  if (!value || !/^\+?[0-9 () .-]+$/.test(value.trim())) return null;
  const number = value.trim().replace(/[ () .-]/g, "");
  return /^\+?[0-9]{7,15}$/.test(number) ? number : null;
}
function email(value: string | null): string | null {
  return value && /^[^\s@<>?&#]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value) ? value : null;
}
export function contactLinks(site: Site, host: PublicHost, item?: Item) {
  if (site.show_contact !== 1) return { whatsapp: null, call: null, email: null };
  const number = site.show_whatsapp === 1 ? phone(site.whatsapp_number) : null;
  const call = site.show_phone === 1 ? phone(site.contact_phone) : null;
  const address = site.show_email === 1 ? email(site.contact_email) : null;
  const subject = item ? "Request a quote: " + item.name : "Enquiry: " + site.business_name;
  const message = "Hello " + site.business_name + ",\n\n" + (item ? "I would like more information and a quote for " + item.name + ".\n\n" : "I would like more information about your products and services.\n\n")
    + host.canonicalOrigin + (item ? "/items/" + encodeURIComponent(item.slug) : "/catalogue");
  return {
    whatsapp: number ? "https://wa.me/" + number.replace(/^\+/, "") + "?text=" + encodeURIComponent(message) : null,
    call: call ? "tel:" + call : null,
    email: address ? "mailto:" + encodeURIComponent(address) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(message) : null,
  };
}
function trackedContactLinks(site: Site, host: PublicHost, item?: Item) {
  const links = contactLinks(site, host, item);
  return { ...links, whatsapp: links.whatsapp && !host.privatePreview ? "/go/whatsapp" + (item ? "?item=" + encodeURIComponent(item.slug) : "") : links.whatsapp };
}
function price(item: Item): string {
  if (item.show_price !== 1 || item.price_minor_units === null || !item.currency_code || !/^[A-Z]{3}$/.test(item.currency_code)) return "Request a quote";
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: item.currency_code, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.price_minor_units / 100); }
  catch { return item.currency_code + " " + (item.price_minor_units / 100).toFixed(2); }
}
function header(site: Site, path: string): string {
  const links = [["/", "Home"], ["/catalogue", "Catalogue"]];
  if (site.show_about === 1) links.push(["/about", "About"]);
  if (site.show_contact === 1) links.push(["/contact", "Contact"]);
  const logo = site.logo_asset_public_id && site.logo_object_key
    ? '<img class="business-logo" src="' + e(mediaUrl(site, site.logo_asset_public_id)) + '" width="48" height="48" alt="">' : "";
  return '<header class="site-header"><div class="wrap header-row"><a class="business-brand" href="/">' + logo + '<span><span class="business-name">'
    + e(site.business_name) + '</span><span class="business-kind">' + (site.mode === "both" ? "Products &amp; services" : site.mode === "services" ? "Service catalogue" : "Product catalogue")
    + '</span></span></a><nav class="site-nav" aria-label="Main navigation">' + links.map(([href, label]) => '<a href="' + href + '"' + ((path === href || (href === "/catalogue" && /^\/(items|categories)\//.test(path))) ? ' aria-current="page"' : "") + ">" + label + "</a>").join("") + "</nav></div></header>";
}
export function document(site: Site | undefined, host: PublicHost | undefined, path: string, title: string, body: string, options: { description?: string; noindex?: boolean; image?: string } = {}): string {
  const canonical = host ? host.canonicalOrigin + path : "";
  const description = options.description ?? site?.seo_description ?? site?.hero_subtitle ?? "Explore products and services, view useful details and contact the business.";
  const theme = site?.theme_code === "modern" ? "modern" : "professional";
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="' + (!site || host?.preview || options.noindex ? "noindex,follow" : "index,follow") + '"><title>' + e(title) + '</title><meta name="description" content="' + e(description.slice(0, 300)) + '">'
    + (canonical ? '<link rel="canonical" href="' + e(canonical) + '"><meta property="og:url" content="' + e(canonical) + '">' : "")
    + '<meta property="og:type" content="website"><meta property="og:title" content="' + e(title) + '"><meta property="og:description" content="' + e(description.slice(0, 300)) + '">'
    + (options.image && host ? '<meta property="og:image" content="' + e(host.canonicalOrigin + options.image) + '">' : "")
    + '<meta name="theme-color" content="#0b1519"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/theme.css?theme=' + theme + '"></head><body><a class="skip" href="#main">Skip to content</a>'
    + (site ? header(site, path) : "") + '<main id="main">' + body + "</main>" + footer(site) + "</body></html>";
}
export function unavailable(title = "Catalogue unavailable", message = "This catalogue is not available right now. Please check the address or try again later.", site?: Site, host?: PublicHost, path = "/"): string {
  return document(site, host, path, title, '<section class="wrap unavailable"><div><span class="eyebrow">Techabanca Catalogue</span><h1>' + e(title)
    + "</h1><p>" + e(message) + "</p>" + (site ? button("/catalogue", "Browse catalogue") : button("https://techabanca.com", "Visit Techabanca")) + "</div></section>", { noindex: true, description: message });
}
function card(site: Site, item: Item): string {
  const picture = item.cover_asset_public_id ? '<img class="card-picture" src="' + e(mediaUrl(site, item.cover_asset_public_id))
    + '" alt="" width="640" height="400" loading="lazy" decoding="async">' : '<div class="card-picture picture-empty" aria-hidden="true">' + (item.item_type === "service" ? "Service" : "Product") + "</div>";
  return '<article class="card"><a class="card-link" href="/items/' + encodeURIComponent(item.slug) + '">' + picture + '<div class="card-body"><span class="eyebrow">' + (item.item_type === "service" ? "Service" : "Product")
    + '</span><h3>' + e(item.name) + "</h3>" + (item.short_description ? '<p class="card-summary">' + e(item.short_description) + "</p>" : "")
    + '<div class="card-bottom"><span class="price">' + e(price(item)) + '</span><span class="detail-link">View details &rarr;</span></div></div></a></article>';
}
function categoryCard(category: Category): string {
  return '<a class="category-card" href="/categories/' + encodeURIComponent(category.slug) + '"><span class="eyebrow">Category</span><h3>' + e(category.name) + "</h3>"
    + (category.description ? "<p>" + e(category.description) + "</p>" : "") + "</a>";
}
export function home(site: Site, host: PublicHost, categories: Category[], featured: Item[]): string {
  const links = trackedContactLinks(site, host);
  const target = site.hero_cta_target === "whatsapp" && links.whatsapp ? links.whatsapp : site.hero_cta_target === "contact" && site.show_contact === 1 ? "/contact" : "/catalogue";
  const hero = site.hero_asset_public_id && site.hero_object_key
    ? '<img class="hero-picture" src="' + e(mediaUrl(site, site.hero_asset_public_id)) + '" alt="' + e(site.business_name) + '" width="800" height="600" fetchpriority="high">'
    : '<div class="hero-empty" aria-hidden="true"><span>Made for<br>your business.</span><p>Explore our catalogue and find your next conversation.</p></div>';
  let body = '<section class="hero"><div class="wrap hero-grid"><div><span class="eyebrow">' + e(site.business_name) + "</span><h1>" + e(site.hero_title || "Explore our products and services.")
    + "</h1><p>" + e(site.hero_subtitle || "Find useful details, compare your options and talk to us about what you need.") + '</p><div class="actions">' + button(target, site.hero_cta_label || "Explore catalogue")
    + (site.show_contact === 1 && target !== "/contact" ? button("/contact", "Get in touch", "secondary") : "") + "</div></div>" + hero + "</div></section>";
  if (site.show_featured_items === 1 && featured.length) body += '<section class="wrap section"><div class="section-heading"><div><span class="eyebrow">Selected for you</span><h2>Featured products &amp; services</h2><p>A closer look at what we offer.</p></div><a class="text-link" href="/catalogue">Browse all &rarr;</a></div><div class="cards">' + featured.map(item => card(site, item)).join("") + "</div></section>";
  if (site.show_categories === 1 && categories.length) body += '<section class="section soft"><div class="wrap"><div class="section-heading"><div><span class="eyebrow">Find your fit</span><h2>Explore by category</h2></div></div><div class="category-grid">' + categories.map(categoryCard).join("") + "</div></div></section>";
  if (site.show_about === 1 && site.about_text) body += '<section class="wrap section"><div class="section-heading"><div><span class="eyebrow">Our business</span><h2>About ' + e(site.business_name) + '</h2></div><a class="text-link" href="/about">Learn more &rarr;</a></div><p class="prose">' + e(site.about_text.slice(0, 600)) + "</p></section>";
  if (site.show_contact === 1) body += '<section class="section soft"><div class="wrap section-heading"><div><span class="eyebrow">Let us help</span><h2>Have something in mind?</h2><p>Talk to us about availability, requirements or a quote.</p></div>' + button("/contact", "Contact us") + "</div></section>";
  return document(site, host, "/", site.seo_title || site.business_name + " | " + site.name, body, { image: site.hero_asset_public_id ? mediaUrl(site, site.hero_asset_public_id) : undefined });
}
function searchForm(site: Site, categories: Category[], filters: Filters, path: string, fixedCategory?: Category): string {
  const categoriesField = site.show_categories === 1 && !fixedCategory ? '<div class="filter-field"><label for="category">Category</label><select id="category" name="category"><option value="">All categories</option>'
    + categories.map(category => '<option value="' + e(category.slug) + '"' + (filters.category === category.slug ? " selected" : "") + ">" + e((category.parent_category_public_id ? "— " : "") + category.name) + "</option>").join("") + "</select></div>" : "";
  return '<form class="search-panel" role="search" action="' + e(path) + '" method="get"><div class="search-field"><label for="q">Search catalogue</label><input id="q" name="q" type="search" value="' + e(filters.query) + '" maxlength="100" placeholder="Search name, SKU or description"></div><div class="filter-field"><label for="type">Type</label><select id="type" name="type">'
    + [["all", "Products and services"], ["product", "Products"], ["service", "Services"]].map(([value, label]) => '<option value="' + value + '"' + (filters.type === value ? " selected" : "") + ">" + label + "</option>").join("")
    + "</select></div>" + categoriesField + '<button class="button" type="submit">Search</button></form>';
}
export function catalogue(site: Site, host: PublicHost, categories: Category[], page: ItemPage, filters: Filters, category?: Category): string {
  const path = category ? "/categories/" + encodeURIComponent(category.slug) : "/catalogue";
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const title = category?.name || "Catalogue";
  let body = '<section class="wrap page-top"><ol class="crumbs"><li><a href="/">Home</a></li>' + (category ? '<li><a href="/catalogue">Catalogue</a></li>' : "") + "<li>" + e(title) + "</li></ol><span class=\"eyebrow\">Products &amp; services</span><h1>"
    + e(title) + "</h1><p>" + e(category?.description || "Explore our products and services, then get in touch for availability or a quote.") + "</p></section><section class=\"wrap section\">" + searchForm(site, categories, filters, path, category)
    + '<p class="result-count" role="status">' + page.total + (page.total === 1 ? " result" : " results") + (filters.query ? " for “" + e(filters.query) + "”" : "") + (page.total ? " · Showing " + ((page.page - 1) * page.pageSize + 1) + "–" + Math.min(page.page * page.pageSize, page.total) : "") + "</p>";
  if (page.items.length) body += '<div class="cards">' + page.items.map(item => card(site, item)).join("") + "</div>";
  else body += '<div class="empty"><h2>No matching products or services</h2><p>Try another search or clear your filters.</p>' + button(path, "Clear filters", "secondary") + "</div>";
  if (pages > 1) body += '<nav class="pagination" aria-label="Catalogue pages">' + (page.page > 1 ? button(filterUrl(path, filters, page.page - 1), "Previous", "secondary") : "")
    + "<span>Page " + page.page + " of " + pages + "</span>" + (page.page < pages ? button(filterUrl(path, filters, page.page + 1), "Next", "secondary") : "") + "</nav>";
  body += "</section>";
  return document(site, host, path, title + " | " + site.business_name, body, { noindex: !!filters.query || filters.type !== "all" || !!filters.category || filters.page > 1 });
}
export function itemDetail(site: Site, host: PublicHost, categories: Category[], detail: Detail): string {
  const item = detail.item;
  const category = site.show_categories === 1 ? categories.find(category => category.category_public_id === item.category_public_id) : undefined;
  const path = "/items/" + encodeURIComponent(item.slug);
  const links = trackedContactLinks(site, host, item);
  const quote = site.show_contact === 1 ? "/contact?item=" + encodeURIComponent(item.slug) + "#enquiry" : links.whatsapp;
  const gallery = detail.images.length ? '<div class="gallery" aria-label="Product images">' + detail.images.map(image => '<a href="' + e(mediaUrl(site, image.asset_public_id)) + '" target="_blank" rel="noopener" aria-label="Open image: ' + e(image.alt_text || item.name) + '"><img src="' + e(mediaUrl(site, image.asset_public_id)) + '" alt="' + e(image.alt_text || item.name) + '" width="640" height="480"' + (image === detail.images[0] ? ' fetchpriority="high"' : ' loading="lazy"') + "></a>").join("") + "</div>"
    : '<div class="hero-empty" aria-hidden="true"><span>' + (item.item_type === "service" ? "Service" : "Product") + "</span><p>" + e(item.name) + "</p></div>";
  let body = '<section class="wrap page-top"><ol class="crumbs"><li><a href="/">Home</a></li><li><a href="/catalogue">Catalogue</a></li>' + (category ? '<li><a href="/categories/' + encodeURIComponent(category.slug) + '">' + e(category.name) + "</a></li>" : "") + "<li>" + e(item.name) + "</li></ol></section>"
    + '<section class="wrap section"><div class="detail-grid">' + gallery + '<div><span class="eyebrow">' + (item.item_type === "service" ? "Service" : "Product") + '</span><h1 class="detail-title">' + e(item.name) + "</h1>"
    + (item.sku ? '<p class="sku">SKU ' + e(item.sku) + "</p>" : "") + '<p class="detail-price">' + e(price(item)) + "</p>"
    + (item.short_description ? '<p class="detail-description">' + e(item.short_description) + "</p>" : "") + '<div class="actions">'
    + (quote ? button(quote, "Request a quote") : "") + (links.whatsapp ? button(links.whatsapp, "WhatsApp", "secondary") : "") + (links.call ? button(links.call, "Call", "secondary") : "") + "</div></div></div></section>";
  if (item.long_description) body += '<section class="wrap section"><h2>Details</h2><p class="prose">' + e(item.long_description) + "</p></section>";
  if (detail.attributes.length) body += '<section class="wrap section"><table class="specifications"><caption>Specifications</caption><tbody>' + detail.attributes.map(attribute => "<tr><th scope=\"row\">" + e(attribute.label) + "</th><td>" + e(attribute.value_text) + (attribute.unit_hint ? " " + e(attribute.unit_hint) : "") + "</td></tr>").join("") + "</tbody></table></section>";
  if (detail.documents.length) body += '<section class="wrap section"><h2>Documents</h2><ul class="documents">' + detail.documents.map(doc => '<li><a class="document-link" download href="' + e(mediaUrl(site, doc.asset_public_id)) + '"><span>' + e(doc.label || "Product document") + "</span><span>PDF · Download &darr;</span></a></li>").join("") + "</ul></section>";
  return document(site, host, path, item.name + " | " + site.business_name, body, { description: item.short_description || undefined, image: item.cover_asset_public_id ? mediaUrl(site, item.cover_asset_public_id) : undefined });
}
export function about(site: Site, host: PublicHost): string {
  const body = '<section class="wrap page-top"><span class="eyebrow">Our business</span><h1>About ' + e(site.business_name) + "</h1></section><section class=\"wrap section\"><p class=\"prose\">" + e(site.about_text || "Explore our catalogue to learn more about the products and services we offer.")
    + '</p><div class="actions">' + button("/catalogue", "Explore catalogue") + (site.show_contact === 1 ? button("/contact", "Get in touch", "secondary") : "") + "</div></section>";
  return document(site, host, "/about", "About | " + site.business_name, body);
}
type ContactForm = { formToken?: string; values?: EnquiryInput; errors?: EnquiryErrors; notice?: string; preview?: boolean; sent?: boolean };
function enquiryForm(site: Site, options: ContactForm, item?: Item): string {
  if (options.sent) return '<div class="enquiry-success" role="status"><h3>Enquiry sent</h3><p>Your enquiry is in ' + e(site.business_name)
    + '&rsquo;s inbox. The business can reply using the contact details you provided.</p>' + button("/contact#enquiry", "Send another enquiry", "secondary") + "</div>";
  if (options.preview) return '<p class="contact-note">Enquiry forms are available on the published catalogue.</p>';
  if (!options.formToken) return '<p class="contact-note">The enquiry form is temporarily unavailable. Please use a contact option above.</p>';
  const value = options.values ?? { contactName: "", companyName: "", email: "", phone: "", message: "", consent: false };
  const errors = options.errors ?? {};
  const field = (name: "contactName" | "companyName" | "email" | "phone", label: string, type: string, max: number, required = false) =>
    '<div class="enquiry-field"><label for="enquiry-' + name + '">' + e(label) + (required ? " *" : "") + '</label><input id="enquiry-' + name
    + '" name="' + name + '" type="' + type + '" maxlength="' + max + '" value="' + e(value[name]) + '"'
    + (required ? " required" : "") + ' autocomplete="' + ({ contactName: "name", companyName: "organization", email: "email", phone: "tel" })[name] + '"'
    + (errors[name] ? ' aria-invalid="true" aria-describedby="error-' + name + '"' : "") + ">"
    + (errors[name] ? '<p class="field-error" id="error-' + name + '">' + e(errors[name]) + "</p>" : "") + "</div>";
  return (options.notice ? '<p class="form-notice" role="alert">' + e(options.notice) + "</p>" : "")
    + (Object.keys(errors).length ? '<div class="form-notice" role="alert"><strong>Check your enquiry</strong><ul>'
      + Object.entries(errors).map(([name, message]) => '<li><a href="#enquiry-' + name + '">' + e(message) + "</a></li>").join("") + "</ul></div>" : "")
    + '<form class="enquiry-form" action="' + e(item ? "/contact?item=" + encodeURIComponent(item.slug) : "/contact") + '" method="post" aria-label="Send an enquiry">'
    + '<input type="hidden" name="formToken" value="' + e(options.formToken) + '">'
    + '<div class="enquiry-trap" aria-hidden="true"><label for="enquiry-website">Leave this field empty</label><input id="enquiry-website" name="companyWebsite" autocomplete="off" tabindex="-1"></div>'
    + '<div class="enquiry-fields">' + field("contactName", "Your name", "text", 120, true) + field("companyName", "Company (optional)", "text", 160)
    + field("email", "Email address", "email", 254) + field("phone", "Phone number", "tel", 40) + "</div>"
    + '<p class="contact-note">Provide an email address or phone number so the business can reply.</p>'
    + '<div class="enquiry-field"><label for="enquiry-message">Your enquiry *</label><textarea id="enquiry-message" name="message" rows="6" maxlength="5000" required'
    + (errors.message ? ' aria-invalid="true" aria-describedby="error-message"' : "") + ">" + e(value.message) + "</textarea>"
    + (errors.message ? '<p class="field-error" id="error-message">' + e(errors.message) + "</p>" : "") + "</div>"
    + '<label class="enquiry-consent"><input id="enquiry-consent" type="checkbox" name="consent" value="yes" required'
    + (value.consent ? " checked" : "") + (errors.consent ? ' aria-invalid="true" aria-describedby="error-consent"' : "")
    + '><span>I agree to share these details with ' + e(site.business_name) + " so they can respond to this enquiry.</span></label>"
    + (errors.consent ? '<p class="field-error" id="error-consent">' + e(errors.consent) + "</p>" : "")
    + '<p class="contact-note">Enquiries expire after ' + ENQUIRY_RETENTION_DAYS + ' days from submission and are removed by daily cleanup.</p>'
    + '<button class="button" type="submit">Send enquiry</button></form>';
}

export function contact(site: Site, host: PublicHost, item?: Item, options: ContactForm = {}): string {
  const links = trackedContactLinks(site, host, item);
  const body = '<section class="wrap page-top"><span class="eyebrow">Let us help</span><h1>Get in touch</h1><p>Contact ' + e(site.business_name) + " for availability, product details or a quote.</p></section>"
    + '<section class="wrap section contact-grid"><div class="contact-card"><h2>Contact details</h2><dl>'
    + (links.call ? '<div class="contact-row"><dt>Phone</dt><dd><a href="' + e(links.call) + '">' + e(site.contact_phone) + "</a></dd></div>" : "")
    + (links.email ? '<div class="contact-row"><dt>Email</dt><dd><a href="' + e(links.email) + '">' + e(site.contact_email) + "</a></dd></div>" : "")
    + (site.address_text ? '<div class="contact-row"><dt>Address</dt><dd>' + e(site.address_text) + "</dd></div>" : "") + "</dl>"
    + (!links.call && !links.email && !site.address_text ? "<p>Contact details are currently unavailable. Please check back soon.</p>" : "")
    + '</div><div class="contact-card" id="enquiry"><span class="eyebrow">Start a conversation</span><h2>' + (item ? "Request a quote" : "Ask us a question") + "</h2>"
    + (item ? '<p>About <strong>' + e(item.name) + "</strong></p>" : "<p>Tell us what you need and we will help you find the right option.</p>") + '<div class="actions">'
    + (links.whatsapp ? button(links.whatsapp, "Enquire on WhatsApp") : "") + (links.email ? button(links.email, "Enquire by email", "secondary") : "") + (links.call ? button(links.call, "Call us", "secondary") : "")
    + (!links.whatsapp && !links.email && !links.call ? "<p>No direct enquiry channel is currently available. Please check back soon.</p>" : "")
    + '</div><p class="contact-note">Choose a contact option above, or send your enquiry here.</p>' + enquiryForm(site, options, item) + '</div></section>';
  return document(site, host, "/contact", "Contact | " + site.business_name, body, { noindex: !!item });
}
