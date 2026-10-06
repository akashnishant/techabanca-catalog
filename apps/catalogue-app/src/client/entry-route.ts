export function isWorkspaceRoute(hash: string): boolean {
  return hash === "#signin" || hash === "#signup" || hash === "#admin"
    || hash.startsWith("#workspace/") || hash === "#setup";
}
export function entryTitle(hash: string): string {
  if (hash === "#signup") return "Create your workspace | Techabanca Catalogue";
  if (hash === "#signin") return "Sign in | Techabanca Catalogue";
  if (isWorkspaceRoute(hash)) return "Workspace | Techabanca Catalogue";
  return "Techabanca Catalogue | Give your business a better showcase";
}
