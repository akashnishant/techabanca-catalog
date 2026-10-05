import type {
  AuthenticatedSessionRecord,
  ResolvedTenantAccess,
} from "./repositories";

export type CatalogueAppEnv = {
  Bindings: Omit<Env, "ASSET_UPLOAD_SIGNING_SECRET" | "PUBLICATION_PREVIEW_SECRET" | "ALLOW_UNSUBSCRIBED_PUBLISHING" | "LOCAL_PREVIEW" | "DEPLOYMENT_ENVIRONMENT" | "STATIC_ASSETS"> & {
    PUBLICATION_PREVIEW_SECRET?: string;
    LOCAL_PUBLIC_WORKER?: Fetcher;
    CATALOGUE_PAYMENT_MODE?: string;
    CATALOGUE_RAZORPAY_KEY_ID?: string;
    CATALOGUE_RAZORPAY_KEY_SECRET?: string;
    CATALOGUE_RAZORPAY_ACCOUNT_ID?: string;
    CATALOGUE_RAZORPAY_WEBHOOK_SECRET?: string;
    CATALOGUE_RAZORPAY_PREVIOUS_WEBHOOK_SECRET?: string;
    ALLOW_UNSUBSCRIBED_PUBLISHING?: string;
    LOCAL_PREVIEW?: string;
    DEPLOYMENT_ENVIRONMENT?: string;
    STATIC_ASSETS?: Fetcher;
    ASSET_UPLOAD_SIGNING_SECRET?: string;
    AUTH_RATE_LIMIT_SECRET?: string;
    TURNSTILE_SITE_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
  };
  Variables: {
    authSession: AuthenticatedSessionRecord;
    tenantAccess: ResolvedTenantAccess;
    requestId: string;
  };
};
