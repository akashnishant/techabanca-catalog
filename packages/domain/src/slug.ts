const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeSlug(value: string, maxLength: number): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

export function normalizeCatalogueSlug(value: string): string {
  return normalizeSlug(value, 63);
}

export function isValidCatalogueSlug(value: string): boolean {
  return value.length >= 3 && value.length <= 63 && SLUG_PATTERN.test(value);
}

export function normalizeItemSlug(value: string): string {
  return normalizeSlug(value, 80);
}

export function isValidItemSlug(value: string): boolean {
  return value.length >= 1 && value.length <= 80 && SLUG_PATTERN.test(value);
}
