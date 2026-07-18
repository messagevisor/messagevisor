import * as React from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import type { TranslationShard } from "../../api";
import { fetchTranslationShard } from "../../api";
import type { EntitySummary, EntityType } from "../../types";
import { entityLabels, getEntityRoute } from "../../entityTypes";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { EntityKey } from "../ui/EntityKey";
import { LabelValueBadge } from "../ui/LabelValueBadge";
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

function sortValues(values?: string[]) {
  return Array.from(new Set(values || [])).sort((left, right) => left.localeCompare(right));
}

export function getTargetTooltipLabel(targets?: string[]) {
  const sortedTargets = sortValues(targets);

  if (sortedTargets.length === 0) {
    return "";
  }

  return `Targets: ${sortedTargets.join(", ")}`;
}

function HoverTooltip(props: { label: string; children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = React.useState<{
    left: number;
    top: number;
  } | null>(null);

  function showTooltip() {
    const rect = ref.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    setTooltipPosition({
      left: rect.left + rect.width / 2,
      top: rect.top,
    });
  }

  function hideTooltip() {
    setTooltipPosition(null);
  }

  return (
    <span
      ref={ref}
      className={`relative inline-flex ${props.className || ""}`}
      aria-label={props.label}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {props.children}
      {tooltipPosition &&
        createPortal(
          <span
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-header px-2 py-1 text-xs font-semibold text-header-text shadow-lg"
            style={{
              left: tooltipPosition.left,
              top: tooltipPosition.top - 8,
            }}
          >
            {props.label}
          </span>,
          document.body,
        )}
    </span>
  );
}

function TargetMessageCountBadge(props: { entity: EntitySummary; type: EntityType }) {
  if (props.type !== "target") {
    return null;
  }

  return (
    <Badge>
      {props.entity.messageCount || 0} {props.entity.messageCount === 1 ? "message" : "messages"}
    </Badge>
  );
}

export function hasMessageOverrides(type: EntityType, entity: EntitySummary) {
  if (type !== "message") {
    return false;
  }

  return (entity.overrideCount ?? entity.overrideLocales?.length ?? 0) > 0;
}

function MessageOverridesIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.53 1.53 0 0 1-2.29.95c-1.37-.84-2.94.73-2.1 2.1.5.8.07 1.86-.95 2.29-1.56.38-1.56 2.6 0 2.98 1.02.25 1.45 1.49.95 2.29-.84 1.37.73 2.94 2.1 2.1.8-.5 2.04-.07 2.29.95.38 1.56 2.6 1.56 2.98 0 .25-1.02 1.49-1.45 2.29-.95 1.37.84 2.94-.73 2.1-2.1-.5-.8-.07-2.04.95-2.29 1.56-.38 1.56-2.6 0-2.98-1.02-.25-1.45-1.49-.95-2.29.84-1.37-.73-2.94-2.1-2.1-.8.5-2.04.07-2.29-.95ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function MessageOverridesIndicator(props: {
  entity: EntitySummary;
  type: EntityType;
  setKey?: string;
}) {
  const navigate = useNavigate();

  if (!hasMessageOverrides(props.type, props.entity)) {
    return null;
  }

  const overridesRoute = `${getEntityRoute("message", props.entity.key, props.setKey)}/overrides`;

  return (
    <HoverTooltip label="Has overrides">
      <button
        type="button"
        aria-label="Has overrides"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-transparent text-faint outline-none transition-colors hover:border-border hover:bg-elevated/60 hover:text-muted focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          navigate(overridesRoute);
        }}
      >
        <MessageOverridesIcon />
      </button>
    </HoverTooltip>
  );
}

export function getRelationshipSummaryLabels(type: EntityType, entity: EntitySummary) {
  const labels: Array<{ label: string; value: string; tooltip?: string }> = [];
  const targetCount = type === "target" ? 0 : sortValues(entity.targets).length;

  if (targetCount > 0) {
    labels.push({
      label: "Targets",
      value: String(targetCount),
      tooltip: getTargetTooltipLabel(entity.targets),
    });
  }

  if (type === "segment" && (entity.usedInMessageCount ?? 0) > 0) {
    labels.push({
      label: "Used in",
      value: `${entity.usedInMessageCount} ${entity.usedInMessageCount === 1 ? "message" : "messages"}`,
    });
  }

  if (type === "attribute") {
    if ((entity.usedInSegmentCount ?? 0) > 0) {
      labels.push({
        label: "Used in",
        value: `${entity.usedInSegmentCount} ${entity.usedInSegmentCount === 1 ? "segment" : "segments"}`,
      });
    }

    if ((entity.usedInMessageCount ?? 0) > 0) {
      labels.push({
        label: "Used in",
        value: `${entity.usedInMessageCount} ${entity.usedInMessageCount === 1 ? "message" : "messages"}`,
      });
    }
  }

  return labels;
}

function RelationshipSummaryBadges(props: { entity: EntitySummary; type: EntityType }) {
  const labels = getRelationshipSummaryLabels(props.type, props.entity);

  if (labels.length === 0) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {labels.map((item) => {
        const badge = <LabelValueBadge label={item.label} value={item.value} compact />;

        return item.tooltip ? (
          <HoverTooltip key={`${item.label}:${item.value}`} label={item.tooltip}>
            {badge}
          </HoverTooltip>
        ) : (
          <React.Fragment key={`${item.label}:${item.value}`}>{badge}</React.Fragment>
        );
      })}
    </div>
  );
}

function RowTrailingMeta(props: { entity: EntitySummary; type: EntityType; setKey?: string }) {
  return (
    <>
      {getStatusBadges(props.entity)}
      <TargetMessageCountBadge entity={props.entity} type={props.type} />
      <MessageOverridesIndicator entity={props.entity} type={props.type} setKey={props.setKey} />
      <RelationshipSummaryBadges entity={props.entity} type={props.type} />
    </>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const showHints = searchParams.get("hints") === "1";
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
      const requestIdleCallback = (
        window as Window & { requestIdleCallback?: Window["requestIdleCallback"] }
      ).requestIdleCallback;
      if (typeof requestIdleCallback === "function") {
        idleRef.current = requestIdleCallback(
          () => {
            idleRef.current = null;
            onQueryCommit(value);
          },
          { timeout: 700 },
        );
        return;
      }

      animationFrameRef.current = requestAnimationFrame(() => {
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
            onClick={() =>
              setSearchParams(setSearchParam(searchParams, "hints", showHints ? undefined : "1"), {
                replace: true,
              })
            }
            aria-label={showHints ? "Hide advanced search hints" : "Show advanced search hints"}
            aria-pressed={showHints}
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
            <div className="grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] gap-x-3 gap-y-1">
              <div className="col-start-1 row-start-1 flex min-h-6 min-w-0 items-center">
                <EntityKey
                  value={entity.key}
                  className="text-sm font-semibold text-primary"
                  highlightQuery={highlightTerms.key}
                />
              </div>
              <div className="col-start-2 row-start-1 flex min-h-6 w-full items-center justify-end gap-2">
                <RowTrailingMeta entity={entity} type={props.type} setKey={props.setKey} />
              </div>
              <div className="col-start-1 row-start-2 flex min-h-5 min-w-0 items-center overflow-hidden">
                <span className="min-w-0 truncate text-sm text-muted">
                  <SearchHighlight
                    text={entity.description || "No description"}
                    query={highlightTerms.description}
                  />
                </span>
              </div>
              <div className="col-start-2 row-start-2 flex min-h-5 w-full items-center justify-end">
                <span className="whitespace-nowrap text-right text-[11px] text-faint">
                  <LastModified entity={entity} highlightQuery={highlightTerms.lastModified} />
                </span>
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
