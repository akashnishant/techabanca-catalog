import type {
  AuthenticatedSessionRecord,
  ResolvedTenantAccess,
} from "./repositories";

export type CatalogueAppEnv = {
  Bindings: Env;
  Variables: {
    authSession: AuthenticatedSessionRecord;
    tenantAccess: ResolvedTenantAccess;
    requestId: string;
  };
};
