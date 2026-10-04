import type {
  AuthenticatedSessionRecord,
  ResolvedTenantAccess,
} from "./repositories";

export type CatalogueAppEnv = {
  Bindings: Omit<Env, "ASSET_UPLOAD_SIGNING_SECRET"> & {
    ASSET_UPLOAD_SIGNING_SECRET?: string;
  };
  Variables: {
    authSession: AuthenticatedSessionRecord;
    tenantAccess: ResolvedTenantAccess;
    requestId: string;
  };
};
