export const PUBLICATION_STATES = [
  "building",
  "active",
  "retired",
  "failed",
] as const;

export type PublicationState = (typeof PUBLICATION_STATES)[number];

export function isPublicationState(
  value: string,
): value is PublicationState {
  return (PUBLICATION_STATES as readonly string[]).includes(value);
}
