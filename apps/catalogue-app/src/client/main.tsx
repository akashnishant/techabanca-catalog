import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LandingPage } from "./LandingPage";
import { entryTitle, isWorkspaceRoute } from "./entry-route";
import "./brand.css";
const App = lazy(() => import("./App").then(module => ({ default: module.App })));
function Entry() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const change = () => setHash(window.location.hash);
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => { document.title = entryTitle(hash); }, [hash]);
  return isWorkspaceRoute(hash)
    ? <Suspense fallback={<main className="entry-loading" role="status">Opening your Catalogue workspace…</main>}><App /></Suspense>
    : <LandingPage />;
}
const root = document.getElementById("root");
if (!root) throw new Error("Root element was not found.");
createRoot(root).render(<StrictMode><Entry /></StrictMode>);
