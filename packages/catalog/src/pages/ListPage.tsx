import * as React from "react";
import { Navigate, useParams } from "react-router-dom";

import { fetchIndex } from "../api";
import { entityLabels, entityPathToType } from "../entityTypes";
import type { CatalogIndex, EntityPath } from "../types";
import { EntityList } from "../components/lists/EntityList";
import { PageHeader } from "../components/layout/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { useCatalog } from "../context/CatalogContext";

function isEntityPath(value: string | undefined): value is EntityPath {
  return (
    value === "locales" ||
    value === "messages" ||
    value === "attributes" ||
    value === "segments" ||
    value === "targets"
  );
}

export function ListPage() {
  const { entityPath, setKey } = useParams();
  const { manifest } = useCatalog();
  const [index, setIndex] = React.useState<CatalogIndex | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setIndex(null);
    setError(null);
    fetchIndex(setKey)
      .then(setIndex)
      .catch((err: Error) => setError(err.message));
  }, [setKey]);

  if (!isEntityPath(entityPath)) {
    return <Navigate to="locales" replace />;
  }

  const type = entityPathToType[entityPath];

  if (error) {
    return <EmptyState title="Unable to load catalog index" description={error} />;
  }

  if (!index) {
    return <div className="text-muted">Loading {entityLabels[type].plural.toLowerCase()}...</div>;
  }

  return (
    <div>
      <PageHeader title={entityLabels[type].plural} />
      <EntityList
        type={type}
        entities={index.entities[type]}
        setKey={setKey}
        allEntities={index.entities}
        translationSearchEnabled={manifest.features?.translationSearch === true}
      />
    </div>
  );
}
