export const SYSTEM_THEME_CODES = ["professional"] as const;

export type SystemThemeCode = (typeof SYSTEM_THEME_CODES)[number];

export function isSystemThemeCode(
  value: string,
): value is SystemThemeCode {
  return (SYSTEM_THEME_CODES as readonly string[]).includes(value);
}
