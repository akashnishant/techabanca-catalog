export const MODERATION_STATUSES = [
  "open",
  "reviewing",
  "resolved",
  "dismissed",
] as const;

export type ModerationStatus =
  (typeof MODERATION_STATUSES)[number];

export function isModerationStatus(
  value: string,
): value is ModerationStatus {
  return (MODERATION_STATUSES as readonly string[]).includes(value);
}

export function canTransitionModerationStatus(
  from: ModerationStatus,
  to: ModerationStatus,
): boolean {
  if (from === to) {
    return true;
  }

  if (from === "open") {
    return (
      to === "reviewing"
      || to === "resolved"
      || to === "dismissed"
    );
  }

  if (from === "reviewing") {
    return to === "resolved" || to === "dismissed";
  }

  return false;
}
