export const ENQUIRY_STATUSES = [
  "new",
  "contacted",
  "closed",
] as const;

export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export function isEnquiryStatus(
  value: string,
): value is EnquiryStatus {
  return (ENQUIRY_STATUSES as readonly string[]).includes(value);
}

export function canTransitionEnquiryStatus(
  from: EnquiryStatus,
  to: EnquiryStatus,
): boolean {
  if (from === to) {
    return true;
  }

  if (from === "new") {
    return to === "contacted" || to === "closed";
  }

  if (from === "contacted") {
    return to === "closed";
  }

  return false;
}
