import type { ModerationStatus } from "./operations";
export const MODERATION_REASONS = ["spam", "prohibited_content", "impersonation", "abuse", "security", "legal", "other"] as const;
export type ModerationReason = typeof MODERATION_REASONS[number];
export type AdminOverview = {
 counts: { users: number; organizations: number; catalogues: number; suspended: number; subscriptions: number; storageBytes: number; openCases: number };
 activity: Array<{ action: string; entityType: string; entityId: string | null; actor: string | null; createdAt: string }>;
};
export type AdminCatalogue = {
 id: string; name: string; businessName: string; slug: string; status: string; version: number;
 routeStatus: string | null; revision: number | null; publicationId: string | null;
 blocked: boolean; moderationVersion: number; blockingCaseId: string | null;
 items: number; storageBytes: number; subscriptionStatus: string | null;
};
export type AdminCase = {
 id: string; catalogueId: string; catalogueName: string; slug: string; source: "admin" | "public_report";
 status: ModerationStatus; reason: ModerationReason; summary: string; resolutionNote: string | null;
 version: number; openedAt: string; updatedAt: string;
};
export type AdminCatalogueDetail = {
 catalogue: AdminCatalogue;
 items: Array<{ id: string; name: string; type: string; status: string; description: string | null }>;
 itemPage: number; itemTotal: number;
 assets: Array<{ id: string; name: string; kind: string; mime: string | null; bytes: number; status: string; reviewable: boolean }>;
 assetPage: number; assetTotal: number; cases: AdminCase[];
 subscriptions: Array<{id:string;plan:string;status:string;trialEndsAt:string|null;periodEndsAt:string|null}>;
};
export type AdminCaseDetail = {
 record: AdminCase; catalogue: AdminCatalogue;
 events: Array<{ type: string; from: string | null; to: string | null; note: string | null; actor: string | null; createdAt: string }>;
};
export type AdminPage<T> = { rows: T[]; total: number; page: number; pageSize: number };
export type AdminUser = { id: string; name: string; email: string; status: string; businesses: number; platformAdmin: boolean; createdAt: string };
export type AdminReservedSlug = { slug: string; reason: string; managed: boolean };
