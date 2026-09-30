const CATALOGUE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeCatalogueSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

export function isValidCatalogueSlug(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= 63 &&
    CATALOGUE_SLUG_PATTERN.test(value)
  );
}
