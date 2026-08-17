import * as React from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";

import { fetchIndex, fetchIndexLayer } from "../api";
import { entityLabels, entityPathToType } from "../entityTypes";
import type { CatalogIndex, EntityPath } from "../types";
import { EntityList } from "../components/lists/EntityList";
import { PageHeader } from "../components/layout/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { useCatalog } from "../context/CatalogContext";
import { mergeCatalogIndexLayer } from "../layeredIndex";
import { parseQuery } from "../utils/searchQuery";

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
  const [descriptionLayerLoaded, setDescriptionLayerLoaded] = React.useState(false);
  const [descriptionLayerLoading, setDescriptionLayerLoading] = React.useState(false);
  const [descriptionLayerError, setDescriptionLayerError] = React.useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const descriptionSearchRequested = parseQuery(query).qualifiers.some(
    (qualifier) => qualifier.key === "description",
  );

  React.useEffect(() => {
    setIndex(null);
    setError(null);
    setDescriptionLayerLoaded(false);
    setDescriptionLayerLoading(false);
    setDescriptionLayerError(null);
    let cancelled = false;

    fetchIndex(setKey)
      .then((nextIndex) => {
        if (cancelled) return;
        setIndex(nextIndex);

        void fetchIndexLayer("display", setKey)
          .then((layer) => {
            if (!cancelled && layer) {
              setIndex((current) => (current ? mergeCatalogIndexLayer(current, layer) : current));
            }
          })
          .catch(() => {
            // Core index data is enough to keep the list usable if optional display data is unavailable.
          });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [setKey]);

  React.useEffect(() => {
    if (
      !index ||
      !descriptionSearchRequested ||
      descriptionLayerLoaded ||
      descriptionLayerLoading
    ) {
      return;
    }

    let cancelled = false;
    setDescriptionLayerLoading(true);
    setDescriptionLayerError(null);
    fetchIndexLayer("descriptions", setKey)
      .then((layer) => {
        if (cancelled) return;
        if (layer) {
          setIndex((current) => (current ? mergeCatalogIndexLayer(current, layer) : current));
        }
        setDescriptionLayerLoaded(true);
        setDescriptionLayerLoading(false);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setDescriptionLayerError(err.message);
          setDescriptionLayerLoaded(true);
          setDescriptionLayerLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [descriptionLayerLoaded, descriptionLayerLoading, descriptionSearchRequested, index, setKey]);

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
        descriptionSearchReady={!descriptionSearchRequested || descriptionLayerLoaded}
        descriptionSearchError={descriptionLayerError}
      />
    </div>
  );
}
