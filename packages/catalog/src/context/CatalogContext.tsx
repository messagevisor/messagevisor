import * as React from "react";

import { fetchManifest } from "../api";
import type { CatalogManifest } from "../types";

interface CatalogContextValue {
  manifest: CatalogManifest;
}

const CatalogContext = React.createContext<CatalogContextValue | null>(null);

export function CatalogProvider(props: {
  children: React.ReactNode;
  initialManifest?: CatalogManifest;
}) {
  const [manifest, setManifest] = React.useState<CatalogManifest | null>(
    props.initialManifest || null,
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (props.initialManifest) {
      return;
    }

    fetchManifest()
      .then(setManifest)
      .catch((err: Error) => setError(err.message));
  }, [props.initialManifest]);

  if (error) {
    return <div className="p-8 text-danger">{error}</div>;
  }

  if (!manifest) {
    return <div className="p-8 text-muted">Loading catalog...</div>;
  }

  return <CatalogContext.Provider value={{ manifest }}>{props.children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = React.useContext(CatalogContext);

  if (!context) {
    throw new Error("useCatalog must be used inside CatalogProvider.");
  }

  return context;
}
