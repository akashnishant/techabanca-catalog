export const PUBLIC_ID_PREFIXES = [
  "usr",
  "ses",
  "org",
  "mem",
] as const;

export type PublicIdPrefix = (typeof PUBLIC_ID_PREFIXES)[number];

declare const publicIdBrand: unique symbol;

export type PublicId<TPrefix extends PublicIdPrefix = PublicIdPrefix> =
  `${TPrefix}_${string}` & {
    readonly [publicIdBrand]: TPrefix;
  };

const PUBLIC_ID_PATTERN = /^(usr|ses|org|mem)_[0-9a-f]{32}$/;

export function createPublicId<TPrefix extends PublicIdPrefix>(
  prefix: TPrefix,
): PublicId<TPrefix> {
  const randomPart = crypto.randomUUID().replaceAll("-", "").toLowerCase();
  return `${prefix}_${randomPart}` as PublicId<TPrefix>;
}

export function isPublicId(value: string): value is PublicId {
  return PUBLIC_ID_PATTERN.test(value);
}

export function hasPublicIdPrefix<TPrefix extends PublicIdPrefix>(
  value: string,
  prefix: TPrefix,
): value is PublicId<TPrefix> {
  return value.startsWith(`${prefix}_`) && isPublicId(value);
}
