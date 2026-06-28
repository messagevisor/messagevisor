import * as React from "react";
import { Link } from "react-router-dom";

import { fetchHistoryPage } from "../../api";
import { entityLabels, getEntityRoute } from "../../entityTypes";
import type { HistoryEntry } from "../../types";
import { formatCatalogTimestamp } from "../../utils/formatCatalogTimestamp";
import { CATALOG_HISTORY_VISIBLE_ENTITY_LIMIT } from "../../config";
import { Button } from "../ui/Button";
import { EntityKey } from "../ui/EntityKey";
import { EmptyState } from "../ui/EmptyState";

function HistoryEntryCard(props: { entry: HistoryEntry; setKey?: string; commitUrl?: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const hasMore = props.entry.entities.length > CATALOG_HISTORY_VISIBLE_ENTITY_LIMIT;
  const visibleEntities = expanded
    ? props.entry.entities
    : props.entry.entities.slice(0, CATALOG_HISTORY_VISIBLE_ENTITY_LIMIT);

  return (
    <li
      key={`${props.entry.commit}-${props.entry.timestamp}`}
      className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm ring-1 ring-black/5"
    >
      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-baseline">
        <div className="text-sm font-semibold text-text">{props.entry.author}</div>
        <a
          className="font-mono text-xs text-primary hover:underline"
          href={
            props.commitUrl?.replace("{{hash}}", props.entry.commit) || `#${props.entry.commit}`
          }
          target="_blank"
          rel="noreferrer"
        >
          {formatCatalogTimestamp(props.entry.timestamp)}
        </a>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {visibleEntities.map((entity) => (
          <span
            key={`${entity.type}-${entity.key}`}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-pill px-2.5 py-0.5 text-xs text-muted"
          >
            <span className="shrink-0 text-faint">
              {entity.type !== "test" ? entityLabels[entity.type].singular : "Test"}
            </span>
            {entity.type !== "test" ? (
              <Link
                className="min-w-0 font-medium text-primary hover:underline"
                to={getEntityRoute(entity.type, entity.key, entity.set || props.setKey)}
              >
                <EntityKey value={entity.key} className="font-medium" />
              </Link>
            ) : (
              <EntityKey value={entity.key} className="font-medium" />
            )}
          </span>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-3 text-sm font-semibold text-primary hover:underline"
        >
          {expanded
            ? "See less"
            : `See more (${props.entry.entities.length - CATALOG_HISTORY_VISIBLE_ENTITY_LIMIT} more)`}
        </button>
      )}
    </li>
  );
}

export function HistoryTimeline(props: { path: string; setKey?: string; commitUrl?: string }) {
  const [entries, setEntries] = React.useState<HistoryEntry[]>([]);
  const [page, setPage] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [error, setError] = React.useState<string | null>(null);

  async function loadPage(nextPage: number) {
    try {
      const response = await fetchHistoryPage(props.path, nextPage);
      setEntries((current) => [...current, ...response.entries]);
      setPage(response.page);
      setTotalPages(response.totalPages);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  React.useEffect(() => {
    setEntries([]);
    setPage(0);
    setTotalPages(1);
    setError(null);
    loadPage(1);
  }, [props.path]);

  if (error) {
    return <EmptyState title="History unavailable" description={error} />;
  }

  if (entries.length === 0 && page > 0) {
    return <EmptyState title="No history found" />;
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {entries.map((entry) => (
          <HistoryEntryCard
            key={`${entry.commit}-${entry.timestamp}`}
            entry={entry}
            setKey={props.setKey}
            commitUrl={props.commitUrl}
          />
        ))}
      </ol>

      {page < totalPages && (
        <Button onClick={() => loadPage(page + 1)} className="w-full">
          Load more
        </Button>
      )}
    </div>
  );
}
