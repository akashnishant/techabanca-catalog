import type {
  AuthenticatedSessionRecord,
  ResolvedTenantAccess,
} from "./repositories";

export type CatalogueAppEnv = {
  Bindings: Omit<Env, "ASSET_UPLOAD_SIGNING_SECRET" | "PUBLICATION_PREVIEW_SECRET" | "ALLOW_UNSUBSCRIBED_PUBLISHING" | "LOCAL_PREVIEW" | "DEPLOYMENT_ENVIRONMENT" | "STATIC_ASSETS"> & {
    PUBLICATION_PREVIEW_SECRET?: string;
    ALLOW_UNSUBSCRIBED_PUBLISHING?: string;
    LOCAL_PREVIEW?: string;
    DEPLOYMENT_ENVIRONMENT?: string;
    STATIC_ASSETS?: Fetcher;
    ASSET_UPLOAD_SIGNING_SECRET?: string;
  };
  Variables: {
    authSession: AuthenticatedSessionRecord;
    tenantAccess: ResolvedTenantAccess;
    requestId: string;
  };
};
