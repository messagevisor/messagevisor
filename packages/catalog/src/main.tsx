import * as React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";

import { fetchManifest, setCatalogRouterMode } from "./api";
import { App } from "./App";
import "./styles.css";

async function render() {
  const manifest = await fetchManifest();
  const Router = manifest.router === "browser" ? BrowserRouter : HashRouter;

  setCatalogRouterMode(manifest.router);

  createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Router>
        <App manifest={manifest} />
      </Router>
    </React.StrictMode>,
  );
}

render().catch((error: Error) => {
  createRoot(document.getElementById("root") as HTMLElement).render(
    <div className="p-8 text-danger">{error.message}</div>,
  );
});
