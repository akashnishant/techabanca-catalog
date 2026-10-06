import type { PublicHost } from "./routing";

// Escape all interpolated text/attributes. Microdata keeps the public CSP script-free.
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
export function metadataText(value: string | null | undefined, fallback: string, limit = 300): string {
  return (value?.trim() || fallback).replace(/\s+/g, " ").slice(0, limit);
}
export function structured(host: PublicHost): boolean { return !host.preview && !host.privatePreview; }
export function breadcrumbs(host: PublicHost, crumbs: Array<[string, string]>, enabled = true): string {
  const schema = enabled && structured(host);
  return '<ol class="crumbs" aria-label="Breadcrumb"' + (schema ? ' itemscope itemtype="https://schema.org/BreadcrumbList"' : '') + '>'
    + crumbs.map(([path, name], index) => '<li' + (schema ? ' itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem"' : '') + '>'
      + (index < crumbs.length - 1
        ? '<a' + (schema ? ' itemprop="item"' : '') + ' href="' + escapeHtml(schema ? host.canonicalOrigin + path : path) + '">'
          + (schema ? '<span itemprop="name">' : '') + escapeHtml(name) + (schema ? '</span>' : '') + '</a>'
        : (schema ? '<span itemprop="name">' : '') + escapeHtml(name) + (schema ? '</span>' : ''))
      + (schema ? '<meta itemprop="position" content="' + (index + 1) + '">' : '') + '</li>').join("") + '</ol>';
}
