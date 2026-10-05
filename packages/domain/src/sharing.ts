import { isValidCatalogueSlug, isValidItemSlug } from "./slug";
import type { CatalogueDeployment } from "./deployment";

export type ShareTarget = { url: string; whatsappUrl: string; filename: string };
export type SharingView = {
  deployment: CatalogueDeployment;
  publication: null | { id: string; revision: number; publishedAt: string; businessName: string; target: ShareTarget };
  items: Array<{ id: string; name: string; type: "product" | "service"; target: ShareTarget }>;
  total: number; page: number; pageSize: number;
};

// Fixed canonical host and validated path components. Request hosts and preview tokens never enter a share target.
export function catalogueShareTarget(slug: string, businessName: string, item?: { slug: string; name: string }): ShareTarget {
  if (!isValidCatalogueSlug(slug) || /^(draft|deleted)-/.test(slug) || (item && !isValidItemSlug(item.slug))) throw new Error("invalid_share_target");
  const url = "https://" + slug + ".techabanca.com/" + (item ? "items/" + item.slug : "");
  const text = (item ? item.name + " — " : "") + businessName + "\n" + url;
  return { url, whatsappUrl: "https://wa.me/?text=" + encodeURIComponent(text),
    filename: "techabanca-" + slug + (item ? "-" + item.slug : "-catalogue") + "-qr" };
}
