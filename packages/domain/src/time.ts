declare const utcIsoTimestampBrand: unique symbol;

export type UtcIsoTimestamp = string & {
  readonly [utcIsoTimestampBrand]: true;
};

const UTC_ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function toUtcIsoTimestamp(value: Date): UtcIsoTimestamp {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("Cannot create a UTC timestamp from an invalid Date.");
  }

  return value.toISOString() as UtcIsoTimestamp;
}

export function utcNow(
  clock: () => Date = () => new Date(),
): UtcIsoTimestamp {
  return toUtcIsoTimestamp(clock());
}

export function isUtcIsoTimestamp(value: string): value is UtcIsoTimestamp {
  if (!UTC_ISO_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
