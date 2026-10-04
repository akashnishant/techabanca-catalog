export type CatalogueDeployment = "local" | "staging" | "production";
export function readCatalogueDeployment(value?: string): CatalogueDeployment | null {
  if (value === undefined || value === "local") return "local";
  return value === "staging" || value === "production" ? value : null;
}
export function isManagementHost(url: URL, deployment: CatalogueDeployment): boolean {
  if (deployment === "local") return true;
  return url.port === "" && url.hostname === (deployment === "staging"
    ? "catalogue-preview.techabanca.com" : "catalogue.techabanca.com");
}
export function cataloguePublicOrigin(slug: string, configuration: {
  DEPLOYMENT_ENVIRONMENT?: string; LOCAL_PREVIEW?: string;
}, requestUrl: string): string {
  const deployment = readCatalogueDeployment(configuration.DEPLOYMENT_ENVIRONMENT);
  if (deployment === null) throw new Error("invalid_deployment_environment");
  const url = new URL(requestUrl);
  if (deployment === "local" && configuration.LOCAL_PREVIEW === "true"
    && ["localhost", "127.0.0.1"].includes(url.hostname)) return "http://" + slug + ".localhost:5174";
  const staging = deployment === "staging"
    || (deployment === "local" && url.hostname === "catalogue-preview.techabanca.com");
  return "https://" + slug + (staging ? ".catalogue-preview.techabanca.com" : ".techabanca.com");
}
