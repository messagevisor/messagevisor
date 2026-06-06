import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { TranslationShard } from "../../api";
import { fetchTranslationShard } from "../../api";
import type { EntitySummary, EntityType } from "../../types";
import { entityLabels, getEntityRoute } from "../../entityTypes";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { EntityKey } from "../ui/EntityKey";
import { SearchHighlight } from "../ui/SearchHighlight";
import { CATALOG_LIST_INITIAL_LIMIT } from "../../config";
import type { ParsedQuery } from "../../utils/searchQuery";
import { parseQuery } from "../../utils/searchQuery";

interface EntityListHighlightTerms {
  key: string[];
  description: string[];
  relationship: string[];
  lastModified: string[];
}

const LIST_SEARCH_QUERY_DEBOUNCE_MS = 450;

function matchesQuery(
  entity: EntitySummary,
  parsed: ParsedQuery,
  translationShard: TranslationShard | null,
  translationSearchEnabled: boolean,
): boolean {
  const { freeText, qualifiers } = parsed;

  // Free text: key only
  if (freeText.length > 0) {
    const key = entity.key.toLowerCase();
    if (!freeText.every((term) => key.includes(term))) return false;
  }

  const hasOverrides = qualifiers.some((q) => q.key === "has" && q.value === "overrides");
  const localeQuals = qualifiers
    .filter((q) => q.key === "locale")
    .map((q) => q.value.toLowerCase());

  for (const q of qualifiers) {
    switch (q.key) {
      case "description": {
        const desc = (entity.description || "").toLowerCase();
        if (!desc.includes(q.value.toLowerCase())) return false;
        break;
      }
      case "target": {
        const targets = (entity.targets || []).map((s) => s.toLowerCase());
        if (!targets.includes(q.value.toLowerCase())) return false;
        break;
      }
      case "is": {
        if (q.value === "deprecated" && !entity.deprecated) return false;
        if (q.value === "archived" && !entity.archived) return false;
        break;
      }
      case "has": {
        if (q.value === "overrides") {
          if (localeQuals.length > 0) {
            // has:overrides locale:X — overrides must cover that locale
            const overrideLocales = (entity.overrideLocales || []).map((l) => l.toLowerCase());
            if (!localeQuals.every((l) => overrideLocales.includes(l))) return false;
          } else {
            if (!entity.overrideLocales?.length) return false;
          }
        }
        break;
      }
      case "locale": {
        // Standalone locale: — direct translations only; handled by has:overrides when combined
        if (!hasOverrides) {
          const locales = (entity.locales || []).map((l) => l.toLowerCase());
          if (!locales.includes(q.value.toLowerCase())) return false;
        }
        break;
      }
      case "translation": {
        if (!translationSearchEnabled) break;
        if (q.value.length < 3) return true; // require 3+ chars; don't filter otherwise
        if (!translationShard) return true; // optimistically include while loading
        const values = translationShard[entity.key];
        if (!values || values.length === 0) return false;
        if (q.value.length === 3) break; // shard presence is sufficient for exact 3-char terms
        const term = q.value.toLowerCase();
        if (!values.some((v) => v.includes(term))) return false; // values are pre-lowercased
        break;
      }
    }
  }

  return true;
}

// ---- Query hints ----

function getQueryHints(
  type: EntityType,
  firstTargetKey: string | undefined,
  firstLocaleKey: string | undefined,
  translationSearchEnabled: boolean,
): string[] | null {
  const target = firstTargetKey;
  const locale = firstLocaleKey;

  if (type === "message") {
    return [
      ...(translationSearchEnabled ? ['translation:"keyword"'] : []),
      ...(target ? [`target:${target}`] : []),
      ...(locale ? [`locale:${locale}`] : []),
      'description:"keyword"',
      "has:overrides",
      ...(locale ? [`has:overrides locale:${locale}`] : ["has:overrides"]),
      "is:deprecated",
      "is:archived",
    ];
  }

  return null;
}

function QueryHints({
  type,
  query,
  firstTargetKey,
  firstLocaleKey,
  translationSearchEnabled,
  onHintClick,
}: {
  type: EntityType;
  query: string;
  firstTargetKey: string | undefined;
  firstLocaleKey: string | undefined;
  translationSearchEnabled: boolean;
  onHintClick: (hint: string) => void;
}) {
  const hints = getQueryHints(type, firstTargetKey, firstLocaleKey, translationSearchEnabled);
  if (!hints) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-2 text-xs text-muted">
      <span className="shrink-0">Try:</span>
      {hints.map((hint) => {
        const isActive = query
          .trim()
          .split(/\s+/)
          .some((t) => t.toLowerCase() === hint.toLowerCase());
        return (
          <button
            key={hint}
            type="button"
            onClick={() => onHintClick(hint)}
            className={[
              "cursor-pointer rounded px-1.5 py-0.5 font-mono transition-colors",
              isActive ? "bg-primary/10 text-primary" : "bg-elevated text-muted hover:text-text",
            ].join(" ")}
          >
            {hint}
          </button>
        );
      })}
    </div>
  );
}

// ---- Helpers ----

function getStatusBadges(entity: EntitySummary) {
  return (
    <div className="flex flex-wrap gap-2">
      {entity.archived && <Badge tone="danger">archived</Badge>}
      {entity.deprecated && <Badge tone="warning">deprecated</Badge>}
    </div>
  );
}

function LastModified(props: { entity: EntitySummary; highlightQuery: string[] }) {
  if (!props.entity.lastModified) {
    return <span>Last modified n/a</span>;
  }

  const date = new Date(props.entity.lastModified.timestamp);
  const formattedDate = Number.isNaN(date.getTime())
    ? props.entity.lastModified.timestamp
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);

  return (
    <span>
      Last modified by{" "}
      <span className="font-semibold">
        <SearchHighlight text={props.entity.lastModified.author} query={props.highlightQuery} />
      </span>{" "}
      on <SearchHighlight text={formattedDate} query={props.highlightQuery} />
    </span>
  );
}

function getRelationshipBadges(type: EntityType, entity: EntitySummary) {
  if (type === "target") {
    return [`${entity.messageCount || 0} ${entity.messageCount === 1 ? "message" : "messages"}`];
  }

  return entity.targets || [];
}

function uniqueTerms(terms: string[]) {
  return Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean)));
}

export function getEntityListHighlightTerms(query: string): EntityListHighlightTerms {
  const parsed = parseQuery(query);
  const freeText = uniqueTerms(parsed.freeText);
  const description = uniqueTerms(
    parsed.qualifiers
      .filter((qualifier) => qualifier.key === "description")
      .map((qualifier) => qualifier.value),
  );
  const relationship = uniqueTerms(
    parsed.qualifiers
      .filter((qualifier) => qualifier.key === "target" || qualifier.key === "locale")
      .map((qualifier) => qualifier.value),
  );

  return {
    key: freeText,
    description,
    relationship,
    lastModified: freeText,
  };
}

function getSortDirection(sortValue: string | null) {
  if (!sortValue || sortValue === "name" || sortValue === "name:asc" || sortValue === "asc") {
    return "asc";
  }

  if (sortValue === "-name" || sortValue === "name:desc" || sortValue === "desc") {
    return "desc";
  }

  return "asc";
}

function setSearchParam(searchParams: URLSearchParams, key: string, value?: string) {
  const next = new URLSearchParams(searchParams);

  if (!value) {
    next.delete(key);
  } else {
    next.set(key, value);
  }

  return next;
}

const EntityListSearchControls = React.memo(function EntityListSearchControls({
  type,
  query,
  firstTargetKey,
  firstLocaleKey,
  translationSearchEnabled,
  onQueryCommit,
  onHintClick,
}: {
  type: EntityType;
  query: string;
  firstTargetKey: string | undefined;
  firstLocaleKey: string | undefined;
  translationSearchEnabled: boolean;
  onQueryCommit: (value: string) => void;
  onHintClick: (hint: string) => void;
}) {
  const [inputValue, setInputValue] = React.useState(query);
  const [showHints, setShowHints] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleRef = React.useRef<number | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  const postPaintTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHintsDefined =
    getQueryHints(type, firstTargetKey, firstLocaleKey, translationSearchEnabled) !== null;

  const clearPendingCommit = React.useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (idleRef.current !== null && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(idleRef.current);
      idleRef.current = null;
    }

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (postPaintTimeoutRef.current) {
      clearTimeout(postPaintTimeoutRef.current);
      postPaintTimeoutRef.current = null;
    }
  }, []);

  const commitAfterBrowserWork = React.useCallback(
    (value: string) => {
      if ("requestIdleCallback" in window) {
        idleRef.current = window.requestIdleCallback(
          () => {
            idleRef.current = null;
            onQueryCommit(value);
          },
          { timeout: 700 },
        );
        return;
      }

      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;
        postPaintTimeoutRef.current = setTimeout(() => {
          postPaintTimeoutRef.current = null;
          onQueryCommit(value);
        }, 0);
      });
    },
    [onQueryCommit],
  );

  const scheduleQueryCommit = React.useCallback(
    (value: string) => {
      clearPendingCommit();
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        commitAfterBrowserWork(value);
      }, LIST_SEARCH_QUERY_DEBOUNCE_MS);
    },
    [clearPendingCommit, commitAfterBrowserWork],
  );

  const flushQueryCommit = React.useCallback(
    (value: string) => {
      clearPendingCommit();
      onQueryCommit(value);
    },
    [clearPendingCommit, onQueryCommit],
  );

  React.useEffect(() => {
    clearPendingCommit();
    setInputValue(query);
  }, [query, clearPendingCommit]);

  React.useEffect(() => {
    return () => {
      clearPendingCommit();
    };
  }, [clearPendingCommit]);

  return (
    <div>
      <div className="relative">
        <Input
          value={inputValue}
          onChange={(event) => {
            const val = event.target.value;
            setInputValue(val);
            scheduleQueryCommit(val);
          }}
          onBlur={(event) => {
            flushQueryCommit(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              flushQueryCommit(event.currentTarget.value);
            }
          }}
          placeholder={`Search ${entityLabels[type].plural.toLowerCase()}...`}
          className={hasHintsDefined ? "pr-10" : ""}
        />
        {hasHintsDefined && (
          <button
            type="button"
            onClick={() => setShowHints((v) => !v)}
            aria-label={showHints ? "Hide advanced search hints" : "Show advanced search hints"}
            className={[
              "absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full border text-xs font-bold transition-colors",
              showHints
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface text-muted hover:border-primary hover:text-primary",
            ].join(" ")}
          >
            ?
          </button>
        )}
      </div>

      {/* Animated slide-down hints panel, aligned to input's inner text area */}
      <div
        className={[
          "grid transition-all duration-200 ease-in-out",
          showHints ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden pl-5">
          <QueryHints
            type={type}
            query={query}
            firstTargetKey={firstTargetKey}
            firstLocaleKey={firstLocaleKey}
            translationSearchEnabled={translationSearchEnabled}
            onHintClick={onHintClick}
          />
        </div>
      </div>
    </div>
  );
});

// ---- Component ----

export function EntityList(props: {
  type: EntityType;
  entities: EntitySummary[];
  setKey?: string;
  allEntities?: Record<EntityType, EntitySummary[]>;
  translationSearchEnabled?: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAll, setShowAll] = React.useState(false);
  const [translationShard, setTranslationShard] = React.useState<TranslationShard | null>(null);
  const [loadedShardKey, setLoadedShardKey] = React.useState<string | null>(null);
  const translationShardDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const query = searchParams.get("q") || "";
  const searchParamsRef = React.useRef(searchParams);

  React.useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const commitSearchQuery = React.useCallback(
    (value: string) => {
      const nextQuery = value.trim() ? value : undefined;
      if ((searchParamsRef.current.get("q") || "") === (nextQuery || "")) return;
      React.startTransition(() => {
        setSearchParams(setSearchParam(searchParamsRef.current, "q", nextQuery));
      });
    },
    [setSearchParams],
  );

  React.useEffect(() => {
    return () => {
      if (translationShardDebounceRef.current) {
        clearTimeout(translationShardDebounceRef.current);
        translationShardDebounceRef.current = null;
      }
    };
  }, []);

  const firstTargetKey = props.allEntities?.target?.find((e) => !e.archived)?.key;
  const firstLocaleKey = props.allEntities?.locale?.find((e) => !e.archived)?.key;
  const translationSearchEnabled = props.translationSearchEnabled === true;

  // Compute the 3-char shard prefix needed for the current query
  const _translationQual = parseQuery(query).qualifiers.find((q) => q.key === "translation");
  const neededShardKey =
    translationSearchEnabled && _translationQual && _translationQual.value.length >= 3
      ? _translationQual.value.slice(0, 3).toLowerCase()
      : null;

  // Debounced fetch: only triggers when the 3-char prefix changes
  React.useEffect(() => {
    if (translationShardDebounceRef.current) {
      clearTimeout(translationShardDebounceRef.current);
    }

    if (!neededShardKey) {
      setTranslationShard(null);
      setLoadedShardKey(null);
      return;
    }

    if (neededShardKey === loadedShardKey) return;

    translationShardDebounceRef.current = setTimeout(() => {
      translationShardDebounceRef.current = null;
      fetchTranslationShard(neededShardKey, props.setKey).then((data) => {
        setTranslationShard(data);
        setLoadedShardKey(neededShardKey);
      });
    }, 300);

    return () => {
      if (translationShardDebounceRef.current) {
        clearTimeout(translationShardDebounceRef.current);
        translationShardDebounceRef.current = null;
      }
    };
  }, [neededShardKey, loadedShardKey, props.setKey]);
  const sortDirection = getSortDirection(searchParams.get("sort"));

  // Pass shard to matchesQuery only when the loaded shard matches what's needed
  const activeShard = loadedShardKey === neededShardKey ? translationShard : null;
  const highlightTerms = React.useMemo(() => getEntityListHighlightTerms(query), [query]);

  const filtered = React.useMemo(() => {
    const parsed = parseQuery(query);
    const hasQuery = query.trim().length > 0;

    const matching = props.entities.filter((entity) => {
      if (!hasQuery) return true;
      return matchesQuery(entity, parsed, activeShard, translationSearchEnabled);
    });

    return matching.slice().sort((left, right) => {
      const result = left.key.localeCompare(left.key === right.key ? "" : right.key);
      return sortDirection === "desc" ? result * -1 : result;
    });
  }, [query, props.entities, sortDirection, activeShard, translationSearchEnabled]);

  const visible = showAll ? filtered : filtered.slice(0, CATALOG_LIST_INITIAL_LIMIT);
  const hasHiddenEntities = filtered.length > CATALOG_LIST_INITIAL_LIMIT && !showAll;

  React.useEffect(() => {
    setShowAll(false);
  }, [query, sortDirection, props.type, props.setKey]);

  function handleHintClick(hint: string) {
    const current = query.trim();
    // Toggle: if the exact hint token is already in the query, remove it; otherwise append
    const tokens = current.split(/\s+/).filter(Boolean);
    const idx = tokens.findIndex((t) => t.toLowerCase() === hint.toLowerCase());
    const next =
      idx !== -1
        ? tokens.filter((_, i) => i !== idx).join(" ")
        : current
          ? `${current} ${hint}`
          : hint;
    setSearchParams(setSearchParam(searchParamsRef.current, "q", next || undefined));
  }

  return (
    <div className="space-y-4">
      <div className="px-6 pt-1">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          {/* Input + slide-down hints, confined to the first column */}
          <EntityListSearchControls
            type={props.type}
            query={query}
            firstTargetKey={firstTargetKey}
            firstLocaleKey={firstLocaleKey}
            translationSearchEnabled={translationSearchEnabled}
            onQueryCommit={commitSearchQuery}
            onHintClick={handleHintClick}
          />

          <button
            type="button"
            className="inline-flex h-[46px] w-fit max-w-full cursor-pointer items-center gap-2 self-start rounded-full border border-border bg-surface px-3 py-2 text-left text-sm font-semibold text-muted outline-none focus-visible:ring-2 focus-visible:ring-ring md:justify-self-end"
            onClick={() =>
              setSearchParams(
                setSearchParam(
                  searchParams,
                  "sort",
                  sortDirection === "desc" ? undefined : "-name",
                ),
              )
            }
            aria-label={
              sortDirection === "desc"
                ? "Sorted Z-A by name. Activate to sort A-Z."
                : "Sorted A-Z by name. Activate to sort Z-A."
            }
          >
            <span>Sort</span>
            <span className="whitespace-nowrap font-bold text-text">
              {sortDirection === "desc" ? "Z-A" : "A-Z"}
            </span>
          </button>
        </div>
      </div>

      {filtered.length === 0 && <EmptyState title="No results found" />}

      <div className="divide-y divide-border bg-surface">
        {visible.map((entity) => (
          <Link
            key={entity.key}
            to={getEntityRoute(props.type, entity.key, props.setKey)}
            className="block px-6 py-3 hover:bg-elevated"
          >
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
                  <div className="min-w-0">
                    <EntityKey
                      value={entity.key}
                      className="text-sm font-semibold text-primary"
                      highlightQuery={highlightTerms.key}
                    />
                    <div className="mt-1 truncate text-sm text-muted">
                      <SearchHighlight
                        text={entity.description || "No description"}
                        query={highlightTerms.description}
                      />
                    </div>
                  </div>
                  <div className="shrink-0">{getStatusBadges(entity)}</div>
                </div>
                <div className="mt-2 flex flex-col gap-2 text-xs text-muted md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {getRelationshipBadges(props.type, entity).map((label) => (
                      <Badge key={label}>
                        <SearchHighlight text={label} query={highlightTerms.relationship} />
                      </Badge>
                    ))}
                  </div>
                  <span className="shrink-0 md:text-right">
                    <LastModified entity={entity} highlightQuery={highlightTerms.lastModified} />
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="space-y-4 px-6 pb-6">
        <p className="text-center text-sm text-muted">
          {visible.length} of {filtered.length} {entityLabels[props.type].plural.toLowerCase()}
          {filtered.length !== props.entities.length ? ` (${props.entities.length} total)` : ""}
        </p>

        {hasHiddenEntities && (
          <div className="flex justify-center">
            <Button onClick={() => setShowAll(true)}>
              Load all {filtered.length} {entityLabels[props.type].plural.toLowerCase()}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
