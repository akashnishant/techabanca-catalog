const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export function normalizeCurrencyCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidCurrencyCode(value: string): boolean {
  return CURRENCY_CODE_PATTERN.test(value);
}