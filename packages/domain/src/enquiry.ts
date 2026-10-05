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

export const ENQUIRY_RETENTION_DAYS = 365;
export const ENQUIRY_CONSENT_VERSION = "enquiry-v1";
export type EnquiryInput = { contactName: string; companyName: string; email: string; phone: string; message: string; consent: boolean };
export type EnquiryErrors = Partial<Record<keyof EnquiryInput, string>>;
export function validateEnquiry(input: EnquiryInput): { data: EnquiryInput; errors: EnquiryErrors } {
  const data = { ...input, contactName: input.contactName.trim(), companyName: input.companyName.trim(),
    email: input.email.trim(), phone: input.phone.trim(), message: input.message.trim() };
  const errors: EnquiryErrors = {};
  const bad = (value: string) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
  if (!data.contactName || data.contactName.length > 120 || bad(data.contactName) || /[\r\n]/.test(data.contactName))
    errors.contactName = "Enter your name, using up to 120 characters.";
  if (data.companyName.length > 160 || bad(data.companyName) || /[\r\n]/.test(data.companyName))
    errors.companyName = "Use up to 160 characters for your company.";
  if (data.email && (data.email.length > 254 || !/^[^\s@<>"'\`]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(data.email)))
    errors.email = "Enter a valid email address.";
  const number = data.phone.replace(/[ ().-]/g, "");
  if (data.phone && (data.phone.length > 40 || !/^\+?[0-9 () .-]+$/.test(data.phone) || !/^\+?[0-9]{7,15}$/.test(number)))
    errors.phone = "Enter a phone number with 7 to 15 digits.";
  if (!data.email && !data.phone) errors.email = "Enter an email address or phone number so the business can reply.";
  if (!data.message || data.message.length > 5000 || bad(data.message))
    errors.message = "Enter your enquiry, using up to 5,000 characters.";
  if (!data.consent) errors.consent = "Confirm that you agree to share these details for this enquiry.";
  return { data, errors };
}
export type EnquirySummary = {
  id: string; contactName: string; companyName: string | null; email: string | null; phone: string | null;
  status: EnquiryStatus; source: "catalogue" | "item" | "contact"; itemName: string | null;
  createdAt: string; updatedAt: string; expiresAt: string; version: number;
};
export type EnquiryActivity = { type: "created" | "status_changed" | "note"; fromStatus: EnquiryStatus | null;
  toStatus: EnquiryStatus | null; note: string | null; actor: string | null; createdAt: string };
export type EnquiryDetail = EnquirySummary & { message: string; contactedAt: string | null; closedAt: string | null;
  publicationId: string | null; publicationRevision: number | null; consentAt: string | null; consentVersion: string | null;
  activity: EnquiryActivity[] };
export type EnquiryList = { enquiries: EnquirySummary[]; nextCursor: string | null; counts: Record<EnquiryStatus, number>; retentionDays: number };
