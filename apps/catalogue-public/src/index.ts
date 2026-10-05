import { Hono } from "hono";
import { hasPublicIdPrefix, isValidItemSlug, verifyPreview, signEnquiryToken, verifyEnquiryToken, validateEnquiry, type EnquiryInput, analyticsEligible } from "@techabanca/domain";
import { publicThemeCss } from "@techabanca/themes";
import type { Item, PublicBindings } from "./model";
import { PublicRepository } from "./repository";
import { FilterError, readFilters, resolveHost } from "./routing";
import { about, catalogue, contact, home, itemDetail, unavailable, contactLinks } from "./render";
import { serveMedia } from "./media";
import { faviconSvg } from "./brand";
import { captureEnquiry, EnquiryCaptureError, enquiryInput, readEnquiryForm, validateFormToken } from "./enquiry-capture";

import { recordAnalytics, emitAnalytics, type AnalyticsPoint } from "./analytics";

import { signReportToken } from "@techabanca/domain";
import { captureReport, readReportForm, reportClaims, ReportError } from "./report-capture";
import { reportPage } from "./report-render";
const app = new Hono<{ Bindings: PublicBindings; Variables: { previewPrefix: string; previewRevision: number } }>();
app.use("*", async (c, next) => {
  const deployment = c.env.DEPLOYMENT_ENVIRONMENT ?? "local";
  const url = new URL(c.req.url);
  if (deployment !== "local") {
    if (deployment !== "production") c.header("X-Robots-Tag", "noindex, nofollow");
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    if (!resolveHost(url, false, deployment)) return html(c.req.raw, unavailable(), 404);
    if (url.protocol !== "https:") { url.protocol = "https:"; return c.redirect(url.toString(), 308); }
  }
  c.header("X-Techabanca-Environment", deployment);
  await next();
  c.header("X-Techabanca-Environment", deployment);
  if (deployment === "staging") c.header("X-Robots-Tag", "noindex, nofollow");
  const privatePreview = new URL(c.req.url).pathname.startsWith("/preview/");
  const prefix = c.get("previewPrefix");
  if (prefix && c.req.method !== "HEAD" && c.res.headers.get("Content-Type")?.startsWith("text/html")) {
    const body = (await c.res.text()).replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex, nofollow">')
      .replace(/<meta property="og:image" content="[^"]*">/, "")
      .replace(/(href|src|action)="\/(?!\/)/g, '$1="' + prefix + '/')
      .replace('<main id="main">', '<main id="main"><div class="wrap notice" role="status">Private preview · Revision ' + c.get("previewRevision")
        + '. This link is temporary. Changes remain private until you publish this revision.</div>');
    c.res = new Response(body, { status: c.res.status, headers: c.res.headers });
  }
  if (privatePreview) c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", privatePreview || url.pathname === "/go/whatsapp" ? "no-referrer" : "strict-origin-when-cross-origin");
  c.header("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'self'; script-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Cache-Control", "no-store");
});
app.get("/health", c => c.json({ status: "ok", service: "techabanca-catalogue-public" }));
app.get("/favicon.svg", c => {
  c.header("Content-Type", "image/svg+xml; charset=utf-8");
  return c.body(faviconSvg);
});
app.get("/theme.css", c => {
  c.header("Content-Type", "text/css; charset=utf-8");
  return c.body(publicThemeCss(c.req.query("theme") ?? "professional"));
});
function html(request: Request, body: string, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(request.method === "HEAD" ? null : body, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...extraHeaders, ...(status === 405 ? { Allow: "GET, HEAD" } : {}) } });
}
app.all("*", async c => {
  const request = c.req.raw;
  if (request.method !== "GET" && request.method !== "HEAD" && !(request.method === "POST" && ["/contact","/report"].includes(new URL(request.url).pathname))) {
    c.header("Allow", "GET, HEAD");
    return html(request, unavailable("Method not allowed", "Use a catalogue page link to continue."), 405);
  }
  const url = new URL(request.url);
  let host = resolveHost(url, c.env.LOCAL_PREVIEW === "true", c.env.DEPLOYMENT_ENVIRONMENT);
  if (!host) return html(request, unavailable(), 404);
  if (!host.local && url.protocol !== "https:") {
    url.protocol = "https:"; url.port = "";
    return c.redirect(url.toString(), 308);
  }
  const repository = new PublicRepository(c.env.DB, c.env.DEPLOYMENT_ENVIRONMENT === "local");
  let site;
  let path = url.pathname;
  const preview = /^\/preview\/([^/]+)(\/.*)?$/.exec(path);
  if (preview) {
    const claims = await verifyPreview(preview[1], c.env.PUBLICATION_PREVIEW_SECRET);
    if (!claims || claims.slug !== host.slug) return html(request, unavailable(), 404);
    site = await repository.previewSite(host.slug, claims.publicationId, new Date(claims.expiresAt * 1000).toISOString(), new Date().toISOString());
    if (!site) return html(request, unavailable(), 404);
    const prefix = "/preview/" + preview[1];
    c.set("previewPrefix", prefix); c.set("previewRevision", site.revision_number);
    host = { ...host, preview: true, privatePreview: true };
    if (!preview[2]) return c.redirect(prefix + "/", 308);
    path = preview[2];
  } else site = await repository.site(host.slug);
  if (!site) return html(request, unavailable(), 404);
  if (path.length > 1 && path.endsWith("/")) return c.redirect((c.get("previewPrefix") ?? "") + path.slice(0, -1) + url.search, 308);
  if (preview && path === "/theme.css") return new Response(publicThemeCss(c.req.query("theme") ?? "professional"), { headers: { "Content-Type": "text/css; charset=utf-8" } });
  if (preview && path === "/favicon.svg") return new Response(faviconSvg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8" } });

  const mediaMatch = /^\/media\/(pub_[a-f0-9]{32})\/(ast_[a-f0-9]{32})$/.exec(path);
  if (mediaMatch) {
    if (mediaMatch[1] !== site.publication_public_id || !hasPublicIdPrefix(mediaMatch[2], "ast")) return html(request, unavailable(), 404);
    const media = await repository.media(site, mediaMatch[2]);
    if (!media) return html(request, unavailable(), 404);
    return serveMedia(request, c.env.ASSETS, media);
  }
  if (path === "/robots.txt") {
    c.header("Content-Type", "text/plain; charset=utf-8");
    return new Response(request.method === "HEAD" ? null : "User-agent: *\n" + (host.preview ? "Disallow: /\n" : "Allow: /\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (path === "/report") {
    if (preview) return html(request, unavailable(), 404);
    const now=Math.floor(Date.now()/1000),secret=c.env.PUBLICATION_PREVIEW_SECRET;
    const token=async()=>secret?signReportToken({v:1,purpose:"report",slug:site.slug,catalogueId:site.catalogue_public_id,
      publicationId:site.publication_public_id,nonce:crypto.randomUUID().replace(/-/g,""),issuedAt:now,expiresAt:now+900},secret,now):undefined;
    if(request.method==="POST"){
      if(request.headers.get("Origin")!==url.origin||["cross-site","same-site"].includes(request.headers.get("Sec-Fetch-Site")??""))
        return html(request,reportPage(site,host,{notice:"Use the report form on this catalogue."}),403);
      let fields:Record<string,string>|undefined;
      try{
        fields=await readReportForm(request);
        const claims=await reportClaims(fields,c.env,site,now);
        if(!fields.companyWebsite)await captureReport(c.env,site,claims,fields,request.headers.get("CF-Connecting-IP")??"local");
        return html(request,reportPage(site,host,{sent:true}));
      }catch(error){
        if(!(error instanceof ReportError))throw error;
        return html(request,reportPage(site,host,{token:await token(),notice:error.message,reason:fields?.reason,summary:fields?.summary}),
          error.status,error.status===429?{"Retry-After":String(error.retryAfter??3600)}:{});
      }
    }
    return html(request,reportPage(site,host,{token:await token()}),secret?200:503);
  }
  const track = (points: AnalyticsPoint[]) => recordAnalytics(c.env, site, request, !!preview, points);
  if (path === "/go/whatsapp" && !preview) {
    if ([...url.searchParams.keys()].some(key => key !== "item") || url.searchParams.getAll("item").length > 1) return html(request, unavailable(), 400);
    const slug = url.searchParams.get("item");
    const detail = slug && isValidItemSlug(slug) ? await repository.detail(site, slug) : null;
    if (slug && !detail) return html(request, unavailable("Item not found"), 404);
    const target = contactLinks(site, host, detail?.item).whatsapp;
    if (!target) return html(request, unavailable("WhatsApp unavailable"), 404);
    await track([{ event: "whatsapp_click", itemId: detail?.item.item_public_id }]);
    return new Response(null, { status: 302, headers: { Location: target, "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
  }
  const categories = await repository.categories(site);
  if (path === "/") {
    const featured = site.show_featured_items === 1 ? await repository.items(site, { query: "", type: "all", category: "", page: 1, featured: true }, null, 6) : { items: [] };
    await track([{ event: "catalogue_view" }]);
    return html(request, home(site, host, categories, featured.items));
  }
  if (path === "/about" && site.show_about === 1) { await track([{ event: "catalogue_view" }]); return html(request, about(site, host)); }
  if (path === "/contact" && site.show_contact === 1) {
    const itemSlug = url.searchParams.get("item");
    if (itemSlug && !isValidItemSlug(itemSlug)) return html(request, unavailable("Item not found", "This item is not available in this catalogue.", site, host, path), 404);
    const detail = itemSlug ? await repository.detail(site, itemSlug) : null;
    if (itemSlug && !detail) return html(request, unavailable("Item not found", "This item is not available in this catalogue.", site, host, path), 404);
    const now = Math.floor(Date.now() / 1000), secret = c.env.PUBLICATION_PREVIEW_SECRET;
    const token = async (item: Item | null = detail?.item ?? null) => {
      if (preview || !secret) return undefined;
      return signEnquiryToken({ v: 1, purpose: "form", slug: site.slug, catalogueId: site.catalogue_public_id,
        publicationId: site.publication_public_id, itemId: item?.item_public_id ?? null,
        nonce: crypto.randomUUID().replace(/-/g, ""), issuedAt: now, expiresAt: now + 1800 }, secret, now);
    };
    const cookieName = url.protocol === "https:" ? "__Host-techabanca_enquiry_receipt" : "techabanca_enquiry_receipt";
    if (request.method === "POST") {
      if (preview || request.headers.get("Origin") !== url.origin
        || ["cross-site", "same-site"].includes(request.headers.get("Sec-Fetch-Site") ?? ""))
        return html(request, unavailable("Enquiry not sent", "Use the enquiry form on the published catalogue.", site, host, path), 403);
      let values: EnquiryInput | undefined, topic: Item | null = detail?.item ?? null;
      try {
        const fields = await readEnquiryForm(request);
        values = enquiryInput(fields);
        const claims = await validateFormToken(fields, c.env, site, now);
        topic = null;
        if (claims.itemId) {
          topic = await c.env.DB.prepare("SELECT * FROM published_items WHERE publication_id = ? AND item_public_id = ?")
            .bind(site.publication_id, claims.itemId).first<Item>();
          if (!topic) throw new EnquiryCaptureError(404, "This item is no longer accepting enquiries.");
        }
        if (now - claims.issuedAt < 2) throw new EnquiryCaptureError(429, "Please wait a moment before sending your enquiry.");
        if (!fields.companyWebsite) {
          const checked = validateEnquiry(values); values = checked.data;
          if (Object.keys(checked.errors).length) return html(request, contact(site, host, topic ?? undefined,
            { formToken: await token(topic), values, errors: checked.errors }), 422);
          const result = await captureEnquiry(c.env, site, claims, values, topic,
            request.headers.get("CF-Connecting-IP") ?? "local", new Date(), analyticsEligible(request, false, true));
          if (result.created) emitAnalytics(c.env, site, { event: "enquiry_submitted", itemId: topic?.item_public_id });
          if (!result.accepted) {
            return html(request, contact(site, host, topic ?? undefined, { formToken: await token(topic), values,
              notice: "Too many enquiries were sent recently. Please wait a few minutes before trying again." }), 429, { "Retry-After": String(result.retryAfter) });
          }
        }
        const receipt = await signEnquiryToken({ ...claims, purpose: "receipt", issuedAt: now, expiresAt: now + 300 }, secret!, now);
        c.header("Set-Cookie", cookieName + "=" + receipt + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=300"
          + (url.protocol === "https:" ? "; Secure" : ""));
        return c.redirect("/contact?sent=1#enquiry", 303);
      } catch (error) {
        if (!(error instanceof EnquiryCaptureError)) throw error;
        return html(request, contact(site, host, topic ?? undefined, { formToken: await token(topic), values, notice: error.message }), error.status, error.status === 429 ? { "Retry-After": "2" } : {});
      }
    }
    const cookie = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim()).find(value => value.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
    const receipt = cookie && url.searchParams.get("sent") === "1" ? await verifyEnquiryToken(cookie, secret, now) : null;
    const sent = !!receipt && receipt.purpose === "receipt" && receipt.slug === site.slug && receipt.catalogueId === site.catalogue_public_id;
    const formToken = sent ? undefined : await token();
    await track([{ event: "catalogue_view" }, ...(formToken ? [{ event: "enquiry_started" as const, itemId: detail?.item.item_public_id }] : [])]);
    return html(request, contact(site, host, detail?.item, { formToken, preview: !!preview, sent }));
  }
  const itemMatch = /^\/items\/([^/]+)$/.exec(path);
  if (itemMatch) {
    let slug: string;
    try { slug = decodeURIComponent(itemMatch[1]); } catch { slug = ""; }
    const detail = isValidItemSlug(slug) ? await repository.detail(site, slug) : null;
    if (!detail) return html(request, unavailable("Item not found", "This item is not available in this catalogue.", site, host, path), 404);
    await track([{ event: "catalogue_view" }, { event: "item_view", itemId: detail.item.item_public_id }]);
    return html(request, itemDetail(site, host, categories, detail));
  }
  const categoryMatch = /^\/categories\/([^/]+)$/.exec(path);
  if (path === "/catalogue" || (categoryMatch && site.show_categories === 1)) {
    try {
      const filters = readFilters(url);
      if (categoryMatch) { try { filters.category = decodeURIComponent(categoryMatch[1]); } catch { throw new FilterError("Check the category address and try again."); } }
      if (filters.category && site.show_categories !== 1) throw new FilterError("Category filtering is unavailable.");
      const category = filters.category ? categories.find(category => category.slug === filters.category) : undefined;
      if (filters.category && !category) return html(request, unavailable("Category not found", "This category is not available in this catalogue.", site, host, path), 404);
      const page = await repository.items(site, filters, category?.category_public_id);
      if (filters.page > Math.max(1, Math.ceil(page.total / page.pageSize))) return html(request, unavailable("Page not found", "Choose a page from the catalogue results.", site, host, path), 404);
      await track([{ event: "catalogue_view" }, ...(filters.query && filters.page === 1 ? [{ event: "search" as const }] : [])]);
      return html(request, catalogue(site, host, categories, page, filters, categoryMatch ? category : undefined));
    } catch (error) {
      if (error instanceof FilterError) return html(request, unavailable("Check your search", error.message, site, host, path), 400);
      throw error;
    }
  }
  return html(request, unavailable("Page not found", "The page you requested could not be found. Browse the catalogue to continue.", site, host, path), 404);
});
app.onError((_error, c) => html(c.req.raw, unavailable("Catalogue temporarily unavailable", "Please try again in a little while."), 503));
export default app;
