import * as React from "react";
import {
  Link,
  Navigate,
  Outlet,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { fetchEntityDetail, fetchLocaleDuplicates } from "../api";
import {
  encodeRouteSegment,
  entityLabels,
  entityPathToType,
  entityTypeToPath,
  getBasePath,
  getEntityRoute,
} from "../entityTypes";
import type {
  DevEditor,
  DuplicateTranslationValue,
  EntityDetail,
  EntityPath,
  FormatRow,
  LocaleDuplicates,
  TranslationRow,
} from "../types";
import { PageHeader } from "../components/layout/PageHeader";
import { Tabs } from "../components/layout/Tabs";
import { Badge } from "../components/ui/Badge";
import { CodeBlock } from "../components/ui/CodeBlock";
import { LabelValueBadge } from "../components/ui/LabelValueBadge";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { FieldGrid } from "../components/details/FieldGrid";
import { ConditionTree } from "../components/details/ConditionTree";
import { GroupSegmentTree } from "../components/details/GroupSegmentTree";
import { MarkdownContent } from "../components/details/MarkdownContent";
import { TranslationsTable } from "../components/details/TranslationsTable";
import { UsageLinks } from "../components/details/UsageLinks";
import { HistoryTimeline } from "../components/history/HistoryTimeline";
import { useCatalog } from "../context/CatalogContext";
import { hashTranslationValue } from "../utils/hashTranslationValue";
import type { ParsedQuery } from "../utils/searchQuery";
import { parseQuery } from "../utils/searchQuery";

interface EvaluatedMessageExample {
  locale: string;
  exampleIndex: number;
  matrixIndex?: number;
  description?: string;
  values?: Record<string, unknown>;
  context?: Record<string, unknown>;
  formats?: Record<string, unknown>;
  currency?: string;
  timeZone?: string;
  evaluatedTranslation: unknown;
}

interface EvaluatedLocaleExample {
  locale: string;
  sourceLocale: string;
  exampleIndex: number;
  matrixIndex?: number;
  description?: string;
  rawMessage?: string;
  message?: string;
  originalTranslation?: string;
  values?: Record<string, unknown>;
  context?: Record<string, unknown>;
  formats?: Record<string, unknown>;
  currency?: string;
  timeZone?: string;
  evaluatedTranslation: unknown;
}

function getLocaleDirection(
  localeKey: string | undefined,
  localeDirections?: Record<string, string | undefined>,
) {
  if (!localeKey) {
    return undefined;
  }

  return localeDirections?.[localeKey];
}

function slugifyFragment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ExamplesSearchHighlight(props: { text: string; query: string }) {
  const q = props.query.trim();
  if (!q) {
    return <>{props.text}</>;
  }

  const escaped = escapeRegExp(q);
  const regex = new RegExp(escaped, "gi");
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of props.text.matchAll(regex)) {
    if (match.index !== undefined && match.index > lastIndex) {
      parts.push(props.text.slice(lastIndex, match.index));
    }

    if (match.index !== undefined) {
      parts.push(
        <mark
          key={`hm-${match.index}-${key++}`}
          className={[
            "rounded-[3px] bg-amber-100 px-0.5 py-px text-inherit",
            "shadow-[inset_0_-2px_0_0_rgba(251,191,36,0.35)] ring-1 ring-amber-400/25 ring-inset",
            "transition-[background-color,box-shadow] duration-150",
          ].join(" ")}
        >
          {match[0]}
        </mark>,
      );
      lastIndex = match.index + match[0].length;
    }
  }

  if (lastIndex < props.text.length) {
    parts.push(props.text.slice(lastIndex));
  }

  return <>{parts}</>;
}

function isEntityPath(value: string | undefined): value is EntityPath {
  return (
    value === "locales" ||
    value === "messages" ||
    value === "attributes" ||
    value === "segments" ||
    value === "targets"
  );
}

export function useEntityDetail() {
  return useOutletContext<{ detail: EntityDetail; setKey?: string }>();
}

function formatValue(value: unknown) {
  if (typeof value === "undefined" || value === null || value === "") {
    return "n/a";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "none";
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length > 0 ? keys.join(", ") : "none";
  }

  return String(value);
}

function rowMatchesFormatSearch(row: FormatRow, parsed: ParsedQuery): boolean {
  const parts = splitFormatPath(row.path);
  const valueStr = formatValue(row.value);
  const preview = row.examplePreview ?? "";
  const haystack =
    `${row.path} ${valueStr} ${preview} ${row.source} ${row.from ?? ""}`.toLowerCase();

  for (const term of parsed.freeText) {
    if (!haystack.includes(term)) {
      return false;
    }
  }

  for (const q of parsed.qualifiers) {
    const v = q.value.toLowerCase();
    switch (q.key) {
      case "type":
        if (!parts.type.toLowerCase().includes(v)) {
          return false;
        }
        break;
      case "style":
        if (!parts.style.toLowerCase().includes(v)) {
          return false;
        }
        break;
      case "param":
        if (!parts.param.toLowerCase().includes(v)) {
          return false;
        }
        break;
      case "value":
        if (!valueStr.toLowerCase().includes(v)) {
          return false;
        }
        break;
      case "from":
        if (!(row.from || "").toLowerCase().includes(v)) {
          return false;
        }
        break;
      case "source":
        if (!row.source.toLowerCase().includes(v)) {
          return false;
        }
        break;
      default:
        if (!haystack.includes(v)) {
          return false;
        }
    }
  }

  return true;
}

function filterFormatRowsBySearch(rows: FormatRow[], query: string): FormatRow[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return rows;
  }

  const parsed = parseQuery(trimmed);
  if (parsed.freeText.length === 0 && parsed.qualifiers.length === 0) {
    return rows;
  }

  return rows.filter((row) => rowMatchesFormatSearch(row, parsed));
}

/** Single substring for amber highlight (matches longest searchable term). */
function formatSearchHighlightNeedle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const parsed = parseQuery(trimmed);
  const parts: string[] = [...parsed.freeText];
  const scopedKeys = new Set(["type", "style", "param", "value", "from", "source"]);
  for (const q of parsed.qualifiers) {
    if (scopedKeys.has(q.key)) {
      parts.push(q.value.toLowerCase());
    }
  }

  if (parts.length === 0) {
    return trimmed;
  }

  return parts.reduce((longest, next) => (next.length > longest.length ? next : longest));
}

/** Splits a flattened format path into catalog columns: type → style → remainder (param). */
function splitFormatPath(path: string): { type: string; style: string; param: string } {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) {
    return { type: "", style: "", param: "" };
  }

  if (segments.length === 1) {
    return { type: segments[0], style: "", param: "" };
  }

  if (segments.length === 2) {
    return { type: segments[0], style: segments[1], param: "" };
  }

  return {
    type: segments[0],
    style: segments[1],
    param: segments.slice(2).join("."),
  };
}

interface FormatSplitRowPlan {
  row: FormatRow;
  parts: { type: string; style: string; param: string };
  showTypeCell: boolean;
  typeRowSpan: number;
  showStyleCell: boolean;
  styleRowSpan: number;
  /** Alternates by format *type* group for subtle banding. */
  typeBand: number;
}

/** Sorts by path, then yields rowspan plans so repeated type/style cells are not duplicated. */
function buildFormatSplitRowPlans(rows: FormatRow[]): FormatSplitRowPlan[] {
  const sorted = [...rows].sort((a, b) => a.path.localeCompare(b.path));
  const withParts = sorted.map((row) => ({
    row,
    parts: splitFormatPath(row.path),
  }));

  const plans: FormatSplitRowPlan[] = [];
  let typeBand = 0;
  let i = 0;

  while (i < withParts.length) {
    const type = withParts[i].parts.type;
    let j = i;
    while (j < withParts.length && withParts[j].parts.type === type) {
      j++;
    }
    const typeRowSpan = j - i;

    let k = i;
    while (k < j) {
      const style = withParts[k].parts.style;
      let m = k;
      while (m < j && withParts[m].parts.style === style) {
        m++;
      }
      const styleRowSpan = m - k;

      for (let n = k; n < m; n++) {
        plans.push({
          row: withParts[n].row,
          parts: withParts[n].parts,
          showTypeCell: n === i,
          typeRowSpan,
          showStyleCell: n === k,
          styleRowSpan,
          typeBand,
        });
      }
      k = m;
    }

    typeBand += 1;
    i = j;
  }

  return plans;
}

function collectSortedFormatTypes(rows: FormatRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const t = splitFormatPath(row.path).type;
    if (t) {
      seen.add(t);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** Pills after "All types": always `number`, `date`, `time`, then other types from data (sorted). */
const FORMAT_TYPE_PRIMARY_PILLS: readonly string[] = ["number", "date", "time"];

/** Set true to show the Example column; `examplePreview` is still generated at catalog build. */
const SHOW_FORMAT_EXAMPLE_COLUMN_IN_UI = false;

function showFormatExampleColumn(selectedFormatType: string | null | undefined): boolean {
  if (!SHOW_FORMAT_EXAMPLE_COLUMN_IN_UI) {
    return false;
  }
  return (
    selectedFormatType === "number" ||
    selectedFormatType === "date" ||
    selectedFormatType === "time"
  );
}

function orderedFormatTypePillKeys(typesFromData: string[]): string[] {
  const primarySet = new Set(FORMAT_TYPE_PRIMARY_PILLS);
  const rest = typesFromData.filter((t) => !primarySet.has(t)).sort((a, b) => a.localeCompare(b));
  return [...FORMAT_TYPE_PRIMARY_PILLS, ...rest];
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

function ExamplesCompactViewIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={true}
    >
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExamplesExpandedViewIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={true}
    >
      <rect x="3" y="3" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="15" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const EXAMPLES_TOOLBAR_CONTROL_HEIGHT_CLASS = "h-7";

function ExamplesViewModeSwitch(props: {
  activeView: "compact" | "expanded";
  onViewChange: (view: "compact" | "expanded") => void;
}) {
  return (
    <div
      className={[
        "inline-flex shrink-0 items-stretch rounded-lg border border-border bg-elevated p-px",
        EXAMPLES_TOOLBAR_CONTROL_HEIGHT_CLASS,
      ].join(" ")}
      role="tablist"
      aria-label="Example layout"
    >
      <button
        type="button"
        role="tab"
        aria-selected={props.activeView === "compact"}
        aria-label="Compact"
        title="Compact"
        className={[
          "inline-flex h-full min-h-0 items-center justify-center rounded-md px-2 py-0 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          props.activeView === "compact"
            ? "bg-header-active text-header-text shadow-sm"
            : "text-muted hover:text-text",
        ].join(" ")}
        onClick={() => props.onViewChange("compact")}
      >
        <ExamplesCompactViewIcon />
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={props.activeView === "expanded"}
        aria-label="Expanded"
        title="Expanded"
        className={[
          "inline-flex h-full min-h-0 items-center justify-center rounded-md px-2 py-0 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          props.activeView === "expanded"
            ? "bg-header-active text-header-text shadow-sm"
            : "text-muted hover:text-text",
        ].join(" ")}
        onClick={() => props.onViewChange("expanded")}
      >
        <ExamplesExpandedViewIcon />
      </button>
    </div>
  );
}

function setWindowHash(targetId?: string) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  if (!targetId) {
    url.hash = "";
  } else {
    url.hash = targetId;
  }

  window.history.replaceState(null, "", url.toString());
}

function JsonValueBlock(props: { value: unknown }) {
  if (
    props.value &&
    typeof props.value === "object" &&
    !Array.isArray(props.value) &&
    Object.keys(props.value as Record<string, unknown>).length === 1
  ) {
    const [key, value] = Object.entries(props.value as Record<string, unknown>)[0];
    const isPrimitive =
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean";

    if (isPrimitive) {
      return (
        <pre className="max-w-full whitespace-pre-wrap rounded border border-border bg-elevated p-4 text-xs text-text [overflow-wrap:anywhere]">
          {`{${JSON.stringify(key)}: ${JSON.stringify(value)}}`}
        </pre>
      );
    }
  }

  return <CodeBlock value={props.value} />;
}

function TranslationValueBlock(props: { value: unknown; direction?: string }) {
  return (
    <div
      dir={props.direction}
      className={["min-w-0 max-w-full", props.direction === "rtl" ? "text-right" : ""]
        .filter(Boolean)
        .join(" ")}
      style={props.direction ? { unicodeBidi: "plaintext" } : undefined}
    >
      <CodeBlock value={props.value} />
    </div>
  );
}

function ExamplePermalink(props: { targetId: string }) {
  return (
    <a
      href={`#${props.targetId}`}
      aria-label="Link to this example"
      className="inline-flex rounded p-1 text-muted opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07L13 20" />
      </svg>
    </a>
  );
}

function useScrollToHash(dependencies: React.DependencyList) {
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) {
      return;
    }

    const targetId = decodeURIComponent(window.location.hash.slice(1));

    if (!targetId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const targetElement = document.getElementById(targetId);

      if (!targetElement) {
        return;
      }

      targetElement.scrollIntoView({ block: "start" });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, dependencies);
}

function CaretIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" className="h-3 w-3">
      <path
        d="M3.25 4.5 6 7.25 8.75 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditorIcon(props: { icon: DevEditor["icon"] }) {
  if (props.icon === "cursor") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path d="M4 3l16 9-7 2-3 7L4 3Z" fill="#111827" />
        <path d="M8.2 8.6 15 12.6" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M10.2 12.9 12.6 14.3 10.5 18.8Z" fill="#ffffff" opacity=".92" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path
        d="M17.2 3.2 9.4 10 5.1 6.7 3 7.8v8.4l2.1 1.1 4.3-3.3 7.8 6.8L21 19V5l-3.8-1.8Z"
        fill="#007ACC"
      />
      <path d="M17.2 8.2v7.6L12.5 12l4.7-3.8Z" fill="#ffffff" opacity=".35" />
    </svg>
  );
}

function EditLink(props: { sourcePath?: string; editLinks?: EntityDetail["editLinks"] }) {
  const { manifest } = useCatalog();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const sourceHref =
    props.sourcePath && manifest.links?.source
      ? manifest.links.source.replace("{{path}}", props.sourcePath)
      : undefined;
  const editors = (manifest.dev?.editors || []).filter((editor) => props.editLinks?.[editor.id]);
  const hasEditorLinks = editors.length > 0;

  if (!sourceHref && !hasEditorLinks) {
    return null;
  }

  const buttonClass =
    "rounded border border-border bg-elevated px-4 py-2 text-sm font-bold text-muted shadow-sm hover:bg-background";
  const splitButtonClass =
    "border border-border bg-elevated px-4 py-2 text-sm font-bold text-muted shadow-sm hover:bg-background";
  const menuButtonClass =
    "border border-border bg-elevated py-2 text-sm font-bold text-muted shadow-sm hover:bg-background";

  const dropdown = hasEditorLinks ? (
    <div
      role="menu"
      className="absolute right-0 top-full z-20 mt-px min-w-48 overflow-hidden rounded border border-border bg-surface py-1 shadow-lg"
    >
      {editors.map((editor) => (
        <a
          key={editor.id}
          role="menuitem"
          href={props.editLinks?.[editor.id]}
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-muted hover:bg-elevated hover:text-text"
          onClick={() => setOpen(false)}
        >
          <EditorIcon icon={editor.icon} />
          <span>Open in {editor.label}</span>
        </a>
      ))}
    </div>
  ) : null;

  if (!hasEditorLinks) {
    return sourceHref ? (
      <a href={sourceHref} target="_blank" rel="noreferrer" className={buttonClass}>
        Edit
      </a>
    ) : null;
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      {sourceHref ? (
        <a
          href={sourceHref}
          target="_blank"
          rel="noreferrer"
          className={`${splitButtonClass} rounded-l`}
        >
          Edit
        </a>
      ) : (
        <button
          type="button"
          className={`${splitButtonClass} inline-flex items-center gap-2 rounded`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          Edit
          <CaretIcon />
        </button>
      )}
      {sourceHref && (
        <button
          type="button"
          className={`${menuButtonClass} -ml-px rounded-r px-1.5`}
          aria-label="Open edit menu"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <CaretIcon />
        </button>
      )}
      {open && dropdown}
    </div>
  );
}

function FormatRowsTable(props: {
  rows?: FormatRow[];
  searchQuery?: string;
  /** Locale Formats tab: split path into Type / Style / Param; targets keep a single Format column. */
  formatPathLayout?: "flat" | "split";
  /** When set with split layout, only rows whose path starts with this type (first segment). */
  selectedFormatType?: string | null;
  /** Omit the Type column (types are shown as pills elsewhere). */
  hideTypeColumn?: boolean;
  /** Last column: sample Intl output; only for number / date / time pill selection. */
  showExampleColumn?: boolean;
}) {
  const { setKey } = useEntityDetail();
  const rows = props.rows || [];
  const q = props.searchQuery ?? "";
  const highlightNeedle = formatSearchHighlightNeedle(q);
  const highlight = Boolean(highlightNeedle.trim());
  const splitPath = props.formatPathLayout === "split";
  const hideTypeColumn = Boolean(props.hideTypeColumn && splitPath);
  const showExampleColumn = Boolean(props.showExampleColumn);

  let visibleRows = q.trim() ? filterFormatRowsBySearch(rows, q) : rows;
  if (splitPath && props.selectedFormatType) {
    visibleRows = visibleRows.filter(
      (row) => splitFormatPath(row.path).type === props.selectedFormatType,
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted">No formats found.</p>;
  }

  if (visibleRows.length === 0) {
    const emptyMsg = q.trim()
      ? "No formats match your search."
      : props.selectedFormatType
        ? "No formats for this type."
        : "No formats match your search.";
    return <p className="text-sm text-muted">{emptyMsg}</p>;
  }

  const splitPlans = splitPath ? buildFormatSplitRowPlans(visibleRows) : null;

  function segmentBody(segment: string) {
    return segment ? (
      highlight ? (
        <ExamplesSearchHighlight text={segment} query={highlightNeedle} />
      ) : (
        segment
      )
    ) : (
      <span className="font-normal text-muted">—</span>
    );
  }

  /** Plain text in the cell. Param stays monospace for paths. */
  function renderSplitSegment(segment: string, role: "type" | "style" | "param") {
    const body = segmentBody(segment);
    if (role === "param") {
      return (
        <div className="overflow-x-auto whitespace-nowrap font-mono text-[11px] leading-snug text-muted">
          {body}
        </div>
      );
    }
    if (role === "style") {
      return <div className="overflow-x-auto whitespace-nowrap leading-snug text-text">{body}</div>;
    }
    return (
      <div className="whitespace-pre-wrap leading-snug text-text [overflow-wrap:anywhere]">
        {body}
      </div>
    );
  }

  function bandSurfaceClass(band: number) {
    return band % 2 === 0 ? "bg-surface" : "bg-elevated/[0.2]";
  }

  function formatSplitCellBorderClass(
    column: "type" | "example" | "style" | "param" | "value",
  ): string {
    switch (column) {
      case "type":
        return "border-b border-border border-r border-border/50";
      case "example":
        return "border-b border-border border-r border-border/50";
      case "style":
        return "border-b border-border border-r border-border/50";
      case "param":
        return "border-b border-border border-r border-border/40";
      case "value":
        return "border-b border-border";
      default:
        return "";
    }
  }

  function renderValueColumn(row: FormatRow, bandAndPaddingClass: string) {
    const valueText = formatValue(row.value);
    const showInheritedBadge = row.source === "inherited" && Boolean(row.from);
    const showTargetBadge = row.source === "target";

    return (
      <td className={[bandAndPaddingClass, formatSplitCellBorderClass("value")].join(" ")}>
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={[
              "min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]",
              row.source === "inherited" ? "text-muted" : "",
            ].join(" ")}
          >
            {highlight ? (
              <ExamplesSearchHighlight text={valueText} query={highlightNeedle} />
            ) : (
              valueText
            )}
          </div>
          {(showInheritedBadge || showTargetBadge) && (
            <div className="flex shrink-0 flex-col items-end justify-center gap-1">
              {showInheritedBadge && row.from ? (
                <LabelValueBadge
                  label="inherited from"
                  value={row.from}
                  to={getEntityRoute("locale", row.from, setKey)}
                  tone="inheritance"
                  compact
                />
              ) : null}
              {showTargetBadge ? (
                <LabelValueBadge label="from" value="target" tone="neutral" compact />
              ) : null}
            </div>
          )}
        </div>
      </td>
    );
  }

  function renderExampleCellContent(preview: string | undefined) {
    return preview ? (
      highlight ? (
        <ExamplesSearchHighlight text={preview} query={highlightNeedle} />
      ) : (
        preview
      )
    ) : (
      <span className="font-normal text-muted">—</span>
    );
  }

  /** Split layout: merged per style group (same rowSpan as Style column). */
  function renderSplitExampleColumn(plan: FormatSplitRowPlan, bandClass: string) {
    if (!showExampleColumn || !plan.showStyleCell) {
      return null;
    }

    return (
      <td
        rowSpan={plan.styleRowSpan}
        className={[
          "align-middle min-w-0 px-3 py-2 whitespace-pre-wrap [overflow-wrap:anywhere]",
          bandClass,
          formatSplitCellBorderClass("example"),
        ].join(" ")}
      >
        {renderExampleCellContent(plan.row.examplePreview)}
      </td>
    );
  }

  function renderFlatExampleColumn(row: FormatRow) {
    return (
      <td
        className={[
          "align-middle min-w-0 px-3 py-2 whitespace-pre-wrap [overflow-wrap:anywhere]",
          "border-b border-border border-r border-border/40",
        ].join(" ")}
      >
        {renderExampleCellContent(row.examplePreview)}
      </td>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[40rem] table-fixed border-collapse bg-surface text-xs">
        {splitPath ? (
          <colgroup>
            {hideTypeColumn ? (
              showExampleColumn ? (
                <>
                  <col className="min-w-0 w-[18%]" />
                  <col className="min-w-0 w-[14%]" />
                  <col className="min-w-0 w-[36%]" />
                  <col className="min-w-0 w-[32%]" />
                </>
              ) : (
                <>
                  <col className="min-w-0 w-[22%]" />
                  <col className="min-w-0 w-[36%]" />
                  <col className="min-w-0 w-[42%]" />
                </>
              )
            ) : showExampleColumn ? (
              <>
                <col className="min-w-0 w-[10%]" />
                <col className="min-w-0 w-[16%]" />
                <col className="min-w-0 w-[12%]" />
                <col className="min-w-0 w-[34%]" />
                <col className="min-w-0 w-[28%]" />
              </>
            ) : (
              <>
                <col className="min-w-0 w-[12%]" />
                <col className="min-w-0 w-[18%]" />
                <col className="min-w-0 w-[32%]" />
                <col className="min-w-0 w-[38%]" />
              </>
            )}
          </colgroup>
        ) : (
          <colgroup>
            {showExampleColumn ? (
              <>
                <col className="min-w-0 w-[40%]" />
                <col className="min-w-0 w-[20%]" />
                <col className="min-w-0 w-[40%]" />
              </>
            ) : (
              <>
                <col className="min-w-0 w-1/2" />
                <col className="min-w-0 w-1/2" />
              </>
            )}
          </colgroup>
        )}
        <thead className="bg-elevated text-left text-[11px] uppercase tracking-wide text-muted">
          <tr>
            {splitPath ? (
              <>
                {hideTypeColumn ? null : (
                  <th className="align-middle border-b border-r border-border/50 px-3 py-2 font-semibold">
                    Type
                  </th>
                )}
                <th className="align-middle border-b border-r border-border/50 px-3 py-2 font-semibold">
                  Style
                </th>
                {showExampleColumn ? (
                  <th className="align-middle border-b border-r border-border/50 px-3 py-2 font-semibold">
                    Example
                  </th>
                ) : null}
                <th className="align-middle border-b border-r border-border/40 px-3 py-2 font-semibold">
                  Param
                </th>
                <th className="align-middle border-b border-border px-3 py-2 font-semibold">
                  Value
                </th>
              </>
            ) : (
              <>
                <th className="align-middle border-b border-border px-3 py-2 font-semibold">
                  Format
                </th>
                {showExampleColumn ? (
                  <th className="align-middle border-b border-border px-3 py-2 font-semibold">
                    Example
                  </th>
                ) : null}
                <th className="align-middle border-b border-border px-3 py-2 font-semibold">
                  Value
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {splitPath && splitPlans
            ? splitPlans.map((plan) => {
                const bandClass = bandSurfaceClass(plan.typeBand);

                return (
                  <tr key={plan.row.path}>
                    {!hideTypeColumn && plan.showTypeCell ? (
                      <td
                        rowSpan={plan.typeRowSpan}
                        className={[
                          "align-middle min-w-0 px-3 py-2 font-medium",
                          bandClass,
                          formatSplitCellBorderClass("type"),
                        ].join(" ")}
                      >
                        {renderSplitSegment(plan.parts.type, "type")}
                      </td>
                    ) : null}
                    {plan.showStyleCell ? (
                      <td
                        rowSpan={plan.styleRowSpan}
                        className={[
                          "align-middle min-w-0 px-3 py-2 font-medium",
                          bandClass,
                          formatSplitCellBorderClass("style"),
                        ].join(" ")}
                      >
                        {renderSplitSegment(plan.parts.style, "style")}
                      </td>
                    ) : null}
                    {renderSplitExampleColumn(plan, bandClass)}
                    <td
                      className={[
                        "align-middle min-w-0 px-3 py-2 font-medium text-muted",
                        bandClass,
                        formatSplitCellBorderClass("param"),
                      ].join(" ")}
                    >
                      {renderSplitSegment(plan.parts.param, "param")}
                    </td>
                    {renderValueColumn(
                      plan.row,
                      ["align-middle min-w-0 px-3 py-2", bandClass].join(" "),
                    )}
                  </tr>
                );
              })
            : visibleRows.map((row) => {
                const flatFormatClass = [
                  "align-middle min-w-0 px-3 py-2 font-medium text-muted",
                  showExampleColumn
                    ? "border-b border-border border-r border-border/40"
                    : "border-b border-border",
                ].join(" ");

                return (
                  <tr key={row.path}>
                    <td className={flatFormatClass}>
                      <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {highlight ? (
                          <ExamplesSearchHighlight text={row.path} query={highlightNeedle} />
                        ) : (
                          row.path
                        )}
                      </div>
                    </td>
                    {showExampleColumn ? renderFlatExampleColumn(row) : null}
                    {renderValueColumn(
                      row,
                      "align-middle min-w-0 px-3 py-2 font-medium text-muted",
                    )}
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}

function SourceLocaleLink(props: { localeKey: string }) {
  const { setKey } = useEntityDetail();

  return (
    <Link
      to={getEntityRoute("locale", props.localeKey, setKey)}
      className="font-medium text-primary hover:underline"
    >
      {props.localeKey}
    </Link>
  );
}

function LinkedLocaleList(props: { localeKeys?: string[]; setKey?: string }) {
  const localeKeys = props.localeKeys || [];

  if (localeKeys.length === 0) {
    return <>n/a</>;
  }

  return (
    <>
      {localeKeys.map((localeKey, index) => (
        <React.Fragment key={localeKey}>
          {index > 0 ? ", " : null}
          <Link
            className="font-medium text-primary hover:underline"
            to={getEntityRoute("locale", localeKey, props.setKey)}
          >
            {localeKey}
          </Link>
        </React.Fragment>
      ))}
    </>
  );
}

function LinkedTargetBadges(props: { targetKeys?: string[]; setKey?: string }) {
  const targetKeys = props.targetKeys || [];

  if (targetKeys.length === 0) {
    return <>none</>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {targetKeys.map((targetKey) => (
        <Link
          key={targetKey}
          className="inline-flex"
          to={getEntityRoute("target", targetKey, props.setKey)}
        >
          <Badge>{targetKey}</Badge>
        </Link>
      ))}
    </div>
  );
}

export function EntityDetailPage() {
  const { entityPath, entityKey, setKey } = useParams();
  const [detail, setDetail] = React.useState<EntityDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isEntityPath(entityPath) || !entityKey) {
      return;
    }

    const type = entityPathToType[entityPath];
    setDetail(null);
    setError(null);
    fetchEntityDetail(type, entityKey, setKey)
      .then(setDetail)
      .catch((err: Error) => setError(err.message));
  }, [entityPath, entityKey, setKey]);

  if (!isEntityPath(entityPath) || !entityKey) {
    return <Navigate to={getBasePath(setKey) || "/"} replace />;
  }

  const type = entityPathToType[entityPath];
  const baseRoute = `${getBasePath(setKey)}/${entityTypeToPath[type]}/${encodeRouteSegment(entityKey)}`;

  if (error) {
    return <EmptyState title="Unable to load entity" description={error} />;
  }

  if (!detail) {
    return <div className="text-muted">Loading {entityLabels[type].singular.toLowerCase()}...</div>;
  }

  const entity = detail.entity as Record<string, any>;
  const tabs = getTabs(type, baseRoute);

  return (
    <div>
      <PageHeader
        title={`${entityLabels[type].singular}: ${detail.key}`}
        description={
          <div className="flex flex-wrap items-center gap-2">
            {entity.archived && <Badge tone="danger">archived</Badge>}
            {entity.deprecated && <Badge tone="warning">deprecated</Badge>}
          </div>
        }
        actions={<EditLink sourcePath={detail.sourcePath} editLinks={detail.editLinks} />}
      />
      <Tabs tabs={tabs}>
        <Outlet context={{ detail, setKey }} />
      </Tabs>
    </div>
  );
}

function getTabs(type: string, baseRoute: string) {
  const shared = [
    { label: "Overview", to: baseRoute, end: true },
    { label: "History", to: `${baseRoute}/history` },
  ];

  if (type === "locale") {
    return [
      shared[0],
      { label: "Formats", to: `${baseRoute}/formats` },
      { label: "Examples", to: `${baseRoute}/examples` },
      { label: "Duplicates", to: `${baseRoute}/duplicates` },
      shared[1],
    ];
  }

  if (type === "message") {
    return [
      shared[0],
      { label: "Translations", to: `${baseRoute}/translations` },
      { label: "Overrides", to: `${baseRoute}/overrides` },
      { label: "Examples", to: `${baseRoute}/examples` },
      shared[1],
    ];
  }

  if (type === "target") {
    return [
      shared[0],
      { label: "Formats", to: `${baseRoute}/formats`, end: false },
      { label: "Messages", to: `${baseRoute}/messages` },
      shared[1],
    ];
  }

  if (type === "segment") {
    return [
      shared[0],
      { label: "Conditions", to: `${baseRoute}/conditions` },
      { label: "Usage", to: `${baseRoute}/usage` },
      shared[1],
    ];
  }

  return [shared[0], { label: "Usage", to: `${baseRoute}/usage` }, shared[1]];
}

export function EntityOverviewTab() {
  const { detail, setKey } = useEntityDetail();
  const { manifest } = useCatalog();
  const entity = detail.entity as Record<string, any>;
  const fields = getOverviewFields(detail, entity, setKey, manifest.sets);

  return (
    <div className="space-y-5">
      <FieldGrid fields={fields} />
    </div>
  );
}

function getOverviewFields(
  detail: EntityDetail,
  entity: Record<string, any>,
  setKey?: string,
  showPromotable?: boolean,
) {
  const promotableField = showPromotable
    ? { label: "Promotable", value: entity.promotable === false ? "No" : "Yes" }
    : undefined;
  const compact = (
    fields: Array<{ label: string; value: React.ReactNode; fullWidth?: boolean } | undefined>,
  ) =>
    fields.filter(
      (
        field,
      ): field is {
        label: string;
        value: React.ReactNode;
        fullWidth?: boolean;
      } => Boolean(field?.value),
    );

  if (detail.type === "locale") {
    const fields = [
      { label: "Direction", value: entity.direction },
      { label: "Inherits formats from", value: entity.inheritFormatsFrom },
      { label: "Inherits translations from", value: entity.inheritTranslationsFrom },
      promotableField,
      {
        label: "Description",
        value: <MarkdownContent value={entity.description} />,
        fullWidth: true,
      },
    ];

    return compact(fields);
  }

  if (detail.type === "message") {
    const fields = [
      promotableField,
      { label: "Deprecated", value: entity.deprecated ? "Yes" : "No" },
      { label: "Deprecation warning", value: entity.deprecationWarning },
      {
        label: "Targets",
        value: (
          <LinkedTargetBadges targetKeys={detail.targets as string[] | undefined} setKey={setKey} />
        ),
      },
      {
        label: "Summary",
        value: entity.summary,
        fullWidth: true,
      },
      {
        label: "Description",
        value: <MarkdownContent value={entity.description} />,
        fullWidth: true,
      },
      {
        label: "Meta",
        value: entity.meta ? <CodeBlock value={entity.meta} /> : undefined,
        fullWidth: true,
      },
    ];

    return compact(fields);
  }

  if (detail.type === "attribute") {
    const hasAllowedValues = Array.isArray(entity.enum)
      ? entity.enum.length > 0
      : Boolean(entity.enum);
    const hasRequiredFields = Array.isArray(entity.required)
      ? entity.required.length > 0
      : Boolean(entity.required);
    const hasRange = typeof entity.minimum !== "undefined" || typeof entity.maximum !== "undefined";
    const fields = [
      { label: "Type", value: entity.type },
      promotableField,
      { label: "Allowed values", value: hasAllowedValues ? formatValue(entity.enum) : undefined },
      {
        label: "Required fields",
        value: hasRequiredFields ? formatValue(entity.required) : undefined,
      },
      { label: "Pattern", value: entity.pattern },
      {
        label: "Range",
        value: hasRange
          ? `${typeof entity.minimum !== "undefined" ? entity.minimum : "-∞"} to ${typeof entity.maximum !== "undefined" ? entity.maximum : "∞"}`
          : undefined,
      },
      {
        label: "Description",
        value: <MarkdownContent value={entity.description} />,
        fullWidth: true,
      },
    ];

    return compact(fields);
  }

  if (detail.type === "segment") {
    return compact([
      { label: "Archived", value: entity.archived ? "Yes" : "No" },
      promotableField,
      {
        label: "Description",
        value: <MarkdownContent value={entity.description} />,
        fullWidth: true,
      },
    ]);
  }

  const fields = [
    promotableField,
    { label: "Included message patterns", value: formatValue(entity.includeMessages) },
    { label: "Excluded message patterns", value: formatValue(entity.excludeMessages) },
    {
      label: "Locales",
      value: (
        <LinkedLocaleList localeKeys={detail.locales as string[] | undefined} setKey={setKey} />
      ),
    },
    {
      label: "Description",
      value: <MarkdownContent value={entity.description} />,
      fullWidth: true,
    },
  ];

  return compact(fields);
}

const FORMAT_SEARCH_HINTS = [
  "type:number",
  "style:decimal",
  "type:date",
  "param:maximumFractionDigits",
  "value:2",
  "from:en",
  "source:direct",
];

function FormatSearchHints(props: { query: string; onHintClick: (hint: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-2 text-xs text-muted">
      <span className="shrink-0">Try:</span>
      {FORMAT_SEARCH_HINTS.map((hint) => {
        const isActive = props.query
          .trim()
          .split(/\s+/)
          .some((t) => t.toLowerCase() === hint.toLowerCase());
        return (
          <button
            key={hint}
            type="button"
            onClick={() => props.onHintClick(hint)}
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

/** Formats tab: filter by path type (first segment); syncs `formatType` search param. */
function FormatsTypePills(props: { typeKeys: string[] }) {
  const [searchParams] = useSearchParams();
  const formatTypeParam = searchParams.get("formatType") ?? "";
  const selectedType =
    formatTypeParam && props.typeKeys.includes(formatTypeParam) ? formatTypeParam : null;

  function typeLinkSearch(nextType: string | null): string {
    const next = setSearchParam(
      searchParams,
      "formatType",
      nextType === null ? undefined : nextType,
    );
    const qs = next.toString();
    return qs ? `?${qs}` : "";
  }

  const pillClass = (isActive: boolean) =>
    [
      "inline-flex rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
      isActive
        ? "border-primary bg-header-active text-header-text"
        : "border-pill bg-transparent text-text hover:bg-elevated",
    ].join(" ");

  return (
    <nav className="flex min-w-0 flex-wrap gap-2" aria-label="Format types">
      <Link
        replace
        to={{ search: typeLinkSearch(null) }}
        className={pillClass(selectedType === null)}
      >
        All types
      </Link>
      {props.typeKeys.map((typeKey) => {
        const isActive = typeKey === selectedType;
        return (
          <Link
            key={typeKey}
            replace
            to={{ search: typeLinkSearch(typeKey) }}
            className={pillClass(isActive)}
          >
            {typeKey}
          </Link>
        );
      })}
    </nav>
  );
}

function useFormatsTypePillSelection(formatRows: FormatRow[]) {
  const [searchParams] = useSearchParams();
  const formatTypeParam = searchParams.get("formatType") ?? "";
  const formatTypes = React.useMemo(() => collectSortedFormatTypes(formatRows), [formatRows]);
  const formatTypePillKeys = React.useMemo(
    () => orderedFormatTypePillKeys(formatTypes),
    [formatTypes],
  );
  const selectedFormatType =
    formatTypeParam && formatTypePillKeys.includes(formatTypeParam) ? formatTypeParam : null;
  return { formatTypes, formatTypePillKeys, selectedFormatType };
}

/** Shared by Locale and Target entity Format tabs (below type pills; on Target, below locale pills). */
function FormatsSearchToolbar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showHints, setShowHints] = React.useState(false);
  const searchQuery = searchParams.get("q") ?? "";

  function handleFormatSearchHintClick(hint: string) {
    const current = searchQuery.trim();
    const tokens = current.split(/\s+/).filter(Boolean);
    const idx = tokens.findIndex((t) => t.toLowerCase() === hint.toLowerCase());
    const next =
      idx !== -1
        ? tokens.filter((_, i) => i !== idx).join(" ")
        : current
          ? `${current} ${hint}`
          : hint;
    setSearchParams(setSearchParam(searchParams, "q", next.trim() ? next.trim() : undefined), {
      replace: true,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex min-h-0 min-w-0 flex-1 basis-[min(100%,22rem)] flex-col gap-0">
        <div className="relative">
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => {
              const val = event.target.value;
              setSearchParams(setSearchParam(searchParams, "q", val.trim() ? val : undefined), {
                replace: true,
              });
            }}
            placeholder="Search formats…"
            aria-label="Search formats"
            className={[
              EXAMPLES_TOOLBAR_CONTROL_HEIGHT_CLASS,
              "box-border rounded-lg border border-border bg-elevated py-0 pl-2 pr-10",
              "text-xs leading-snug text-text",
              "placeholder:text-xs placeholder:text-muted placeholder:leading-snug",
            ].join(" ")}
          />
          <button
            type="button"
            onClick={() => setShowHints((v) => !v)}
            aria-label={showHints ? "Hide advanced search hints" : "Show advanced search hints"}
            className={[
              "absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border text-xs font-bold transition-colors",
              showHints
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface text-muted hover:border-primary hover:text-primary",
            ].join(" ")}
          >
            ?
          </button>
        </div>

        <div
          className={[
            "grid transition-all duration-200 ease-in-out",
            showHints ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          ].join(" ")}
        >
          <div className="overflow-hidden pl-1">
            <FormatSearchHints query={searchQuery} onHintClick={handleFormatSearchHintClick} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LocaleFormatsTab() {
  const { detail } = useEntityDetail();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";
  const rows = detail.formatRows as FormatRow[] | undefined;
  const allRows = rows ?? [];
  const { formatTypes, formatTypePillKeys, selectedFormatType } =
    useFormatsTypePillSelection(allRows);
  const showExampleColumn = showFormatExampleColumn(selectedFormatType);

  return (
    <div className="space-y-6">
      {formatTypes.length > 0 ? <FormatsTypePills typeKeys={formatTypePillKeys} /> : null}

      <FormatsSearchToolbar />

      <FormatRowsTable
        rows={rows}
        searchQuery={searchQuery}
        formatPathLayout="split"
        hideTypeColumn={selectedFormatType != null}
        selectedFormatType={selectedFormatType}
        showExampleColumn={showExampleColumn}
      />
    </div>
  );
}

export function FormatsTab() {
  const { detail } = useEntityDetail();

  if (detail.type === "target") {
    return <TargetFormatsTab />;
  }

  return <LocaleFormatsTab />;
}

function MessageTranslationOverridesDetails(props: {
  messageKey: string;
  overrides: Array<{ key: string; row: TranslationRow; override: Record<string, any> }>;
  localeDirections?: Record<string, string | undefined>;
  setKey?: string;
}) {
  if (props.overrides.length === 0) {
    return <p className="text-sm text-muted">No overrides.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted">Overrides</p>
      <div className="space-y-3">
        {props.overrides.map(({ key, row, override }) => (
          <div key={key} className="rounded border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                to={`${getEntityRoute("message", props.messageKey, props.setKey)}/overrides#${key}`}
                className="text-sm font-semibold text-primary hover:underline"
              >
                {key}
              </Link>
              {row.source === "inherited" && row.from && (
                <LabelValueBadge
                  label="inherited from"
                  value={row.from}
                  to={getEntityRoute("locale", row.from, props.setKey)}
                  tone="inheritance"
                  compact
                />
              )}
            </div>
            {(override.segments || override.conditions) && (
              <div className="mt-4 space-y-4">
                {override.segments && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Segments
                    </h4>
                    <GroupSegmentTree segments={override.segments} setKey={props.setKey} />
                  </div>
                )}
                {override.conditions && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Conditions
                    </h4>
                    <ConditionTree conditions={override.conditions} setKey={props.setKey} />
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Overridden translation
              </h4>
              <TranslationValueBlock
                value={row.value || "—"}
                direction={getLocaleDirection(row.locale, props.localeDirections)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MessageTranslationsTab() {
  const { detail, setKey } = useEntityDetail();
  const entity = detail.entity as Record<string, any>;
  const localeDirections = (detail.localeDirections || {}) as Record<string, string | undefined>;
  const overrideTranslations = (detail.overrideTranslations || []) as Array<{
    key: string;
    rows: TranslationRow[];
  }>;
  const overrides = (entity.overrides || []) as Record<string, any>[];
  const overridesByLocale = Object.fromEntries(
    ((detail.translations as TranslationRow[] | undefined) || []).map((translationRow) => [
      translationRow.locale,
      overrideTranslations
        .map((override) => ({
          key: override.key,
          row: (override.rows || []).find((row) => row.locale === translationRow.locale),
          override: overrides.find((item) => item.key === override.key),
        }))
        .filter(
          (
            value,
          ): value is {
            key: string;
            row: TranslationRow;
            override: Record<string, any>;
          } => Boolean(value.row && value.row.source !== "missing" && value.override),
        ),
    ]),
  ) as Record<string, Array<{ key: string; row: TranslationRow; override: Record<string, any> }>>;
  const overriddenLocales = new Set(
    Object.entries(overridesByLocale)
      .filter(([, rows]) => rows.length > 0)
      .map(([locale]) => locale),
  );

  return (
    <TranslationsTable
      rows={detail.translations as TranslationRow[] | undefined}
      linkLocales
      showSource={false}
      localeDirections={localeDirections}
      getRowFragmentId={(entry) => slugifyFragment(`translation-${entry.locale}`)}
      renderExpandedRow={(entry) => (
        <MessageTranslationOverridesDetails
          messageKey={detail.key}
          overrides={overridesByLocale[entry.locale] || []}
          localeDirections={localeDirections}
          setKey={setKey}
        />
      )}
      renderMetaCell={(entry) => {
        const badges: React.ReactNode[] = [];

        if (entry.source === "inherited" && entry.from) {
          badges.push(
            <LabelValueBadge
              key={`inherited-${entry.locale}`}
              label="inherited from"
              value={entry.from}
              to={getEntityRoute("locale", entry.from, setKey)}
              tone="inheritance"
              compact
            />,
          );
        }

        if (overriddenLocales.has(entry.locale)) {
          badges.push(
            <LabelValueBadge
              key={`override-${entry.locale}`}
              label="overrides"
              value="yes"
              tone="override"
              compact
            />,
          );
        }

        if (badges.length === 0) {
          return null;
        }

        return <div className="flex flex-wrap justify-end gap-1.5">{badges}</div>;
      }}
    />
  );
}

export function MessageOverridesTab() {
  const { detail, setKey } = useEntityDetail();
  const entity = detail.entity as Record<string, any>;
  const localeDirections = (detail.localeDirections || {}) as Record<string, string | undefined>;
  const baseTranslationsByLocale = Object.fromEntries(
    ((detail.translations as TranslationRow[] | undefined) || []).map((row) => [
      row.locale,
      row.value,
    ]),
  );

  const overrides = entity.overrides || [];

  useScrollToHash([overrides.length]);

  if (overrides.length === 0) {
    return <p className="text-sm text-muted">No overrides found.</p>;
  }

  return (
    <div className="space-y-6">
      {overrides.map((override: Record<string, any>) => {
        return (
          <section key={override.key} className="space-y-4">
            <div className="space-y-3">
              <div className="group flex items-center gap-2">
                <h2 id={override.key} className="font-semibold">
                  {override.key}
                </h2>
                <ExamplePermalink targetId={override.key} />
              </div>
              {override.summary && <p className="mt-1 text-sm text-muted">{override.summary}</p>}
              {override.description && (
                <div className="mt-3">
                  <MarkdownContent value={override.description} />
                </div>
              )}
            </div>

            <div className="space-y-4">
              {override.segments && (
                <div className="space-y-2 rounded-xl border border-border bg-elevated p-4">
                  <h3 className="text-sm font-semibold text-muted">Segments</h3>
                  <GroupSegmentTree segments={override.segments} setKey={setKey} />
                </div>
              )}

              {override.conditions && (
                <div className="space-y-2 rounded-xl border border-border bg-elevated p-4">
                  <h3 className="text-sm font-semibold text-muted">Conditions</h3>
                  <ConditionTree conditions={override.conditions} setKey={setKey} />
                </div>
              )}

              <TranslationsTable
                translations={override.translations}
                linkLocales
                showSource={false}
                translationLabel="Overridden translation"
                comparisonLabel="Original translation"
                comparisonValues={baseTranslationsByLocale}
                localeDirections={localeDirections}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function MessageExamplesTab() {
  const { detail } = useEntityDetail();
  const [searchParams, setSearchParams] = useSearchParams();
  const examples = (detail.evaluatedExamples || []) as EvaluatedMessageExample[];
  const localeDirections = (detail.localeDirections || {}) as Record<string, string | undefined>;
  const originalTranslationsByLocale = Object.fromEntries(
    ((detail.translations as TranslationRow[] | undefined) || []).map((row) => [
      row.locale,
      row.value,
    ]),
  );
  const view = searchParams.get("view");
  const activeView = view === "expanded" ? "expanded" : "compact";
  const localeKeys = Array.from(new Set(examples.map((example) => example.locale))).sort();
  const localeFilter = searchParams.get("locale");
  const activeLocaleFilter = localeFilter && localeKeys.includes(localeFilter) ? localeFilter : "";
  const visibleExamples = activeLocaleFilter
    ? examples.filter((example) => example.locale === activeLocaleFilter)
    : examples;

  useScrollToHash([visibleExamples.length, activeLocaleFilter, activeView]);

  if (examples.length === 0) {
    return <p className="text-sm text-muted">No examples found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <nav className="flex min-w-0 flex-wrap gap-2">
          <button
            type="button"
            className={[
              "inline-flex rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              activeLocaleFilter
                ? "border-pill bg-transparent text-text hover:bg-elevated"
                : "border-primary bg-header-active text-header-text",
            ].join(" ")}
            onClick={() => setSearchParams(setSearchParam(searchParams, "locale", undefined))}
          >
            All locales
          </button>

          {localeKeys.map((localeKey) => {
            const isActive = activeLocaleFilter === localeKey;

            return (
              <button
                key={localeKey}
                type="button"
                className={[
                  "inline-flex rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  isActive
                    ? "border-primary bg-header-active text-header-text"
                    : "border-pill bg-transparent text-text hover:bg-elevated",
                ].join(" ")}
                onClick={() =>
                  setSearchParams(
                    setSearchParam(searchParams, "locale", isActive ? undefined : localeKey),
                  )
                }
              >
                {localeKey}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto shrink-0">
          <ExamplesViewModeSwitch
            activeView={activeView}
            onViewChange={(view) =>
              setSearchParams(
                setSearchParam(searchParams, "view", view === "compact" ? undefined : view),
              )
            }
          />
        </div>
      </div>

      {activeView === "compact" ? (
        <MessageExamplesCompactView
          examples={visibleExamples}
          localeDirections={localeDirections}
          originalTranslationsByLocale={originalTranslationsByLocale}
        />
      ) : (
        <MessageExamplesExpandedView
          examples={visibleExamples}
          localeDirections={localeDirections}
          originalTranslationsByLocale={originalTranslationsByLocale}
        />
      )}
    </div>
  );
}

function ExampleTitle(props: {
  title: string;
  targetId: string;
  description?: string;
  highlightQuery?: string;
}) {
  const titleContent =
    props.highlightQuery?.trim() && props.title ? (
      <ExamplesSearchHighlight text={props.title} query={props.highlightQuery} />
    ) : (
      props.title
    );

  return (
    <div className="space-y-2">
      <div className="group flex items-center gap-2">
        <h2 id={props.targetId} className="font-semibold">
          {titleContent}
        </h2>
        <ExamplePermalink targetId={props.targetId} />
      </div>
      {props.description?.trim() ? (
        props.highlightQuery?.trim() ? (
          <div className="text-sm text-muted whitespace-pre-wrap [overflow-wrap:anywhere]">
            <ExamplesSearchHighlight text={props.description.trim()} query={props.highlightQuery} />
          </div>
        ) : (
          <div className="text-sm text-muted">
            <MarkdownContent value={props.description} />
          </div>
        )
      ) : null}
    </div>
  );
}

function ExampleTable(props: {
  inputs: React.ReactNode;
  evaluatedTranslation: unknown;
  direction?: string;
  highlightQuery?: string;
}) {
  const highlightTranslation =
    props.highlightQuery?.trim() &&
    props.evaluatedTranslation !== undefined &&
    props.evaluatedTranslation !== null;

  const translationBody = highlightTranslation ? (
    <div
      dir={props.direction}
      className={[
        "min-w-0 max-w-full whitespace-pre-wrap [overflow-wrap:anywhere]",
        props.direction === "rtl" ? "text-right" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={props.direction ? { unicodeBidi: "plaintext" } : undefined}
    >
      <ExamplesSearchHighlight
        text={
          typeof props.evaluatedTranslation === "string"
            ? props.evaluatedTranslation
            : JSON.stringify(props.evaluatedTranslation)
        }
        query={props.highlightQuery ?? ""}
      />
    </div>
  ) : (
    <TranslationValueBlock value={props.evaluatedTranslation} direction={props.direction} />
  );

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-1/2" />
          <col className="w-1/2" />
        </colgroup>
        <thead className="bg-elevated text-left text-muted">
          <tr>
            <th className="border-b border-border px-4 py-3 font-semibold">Input</th>
            <th className="border-b border-border px-4 py-3 font-semibold">Output</th>
          </tr>
        </thead>
        <tbody>
          <tr className="align-top">
            <td className="min-w-0 border-b border-border px-4 py-4">{props.inputs}</td>
            <td className="min-w-0 border-b border-border px-4 py-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Evaluated translation
                </div>
                <div className="min-w-0">{translationBody}</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function InputField(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{props.label}</div>
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}

function getMessageExampleId(example: EvaluatedMessageExample) {
  return slugifyFragment(
    [
      `example-${example.exampleIndex + 1}`,
      example.locale,
      typeof example.matrixIndex === "number" ? `matrix-${example.matrixIndex + 1}` : "",
    ]
      .filter(Boolean)
      .join("-"),
  );
}

function getMessageExampleTitle(example: EvaluatedMessageExample) {
  const titleParts = [`Example #${example.exampleIndex + 1}`];

  if (typeof example.matrixIndex === "number") {
    titleParts.push(`matrix #${example.matrixIndex + 1}`);
  }

  return titleParts.join(" · ");
}

function getMessageExampleCompactLabel(example: EvaluatedMessageExample) {
  if (typeof example.matrixIndex === "number") {
    return `#${example.exampleIndex + 1}.${example.matrixIndex + 1}`;
  }

  return `#${example.exampleIndex + 1}`;
}

function MessageExampleDetails(props: {
  example: EvaluatedMessageExample;
  showLocale?: boolean;
  originalTranslationsByLocale?: Record<string, string | undefined>;
}) {
  const { example } = props;
  const { detail, setKey } = useEntityDetail();
  const originalTranslation = props.originalTranslationsByLocale?.[example.locale];

  return (
    <div className="min-w-0 space-y-4">
      {props.showLocale !== false && (
        <InputField label="Locale">
          <SourceLocaleLink localeKey={example.locale} />
        </InputField>
      )}

      {typeof example.values !== "undefined" && (
        <InputField label="Values">
          <JsonValueBlock value={example.values} />
        </InputField>
      )}

      {typeof example.context !== "undefined" && (
        <InputField label="Context">
          <JsonValueBlock value={example.context} />
        </InputField>
      )}

      {typeof example.timeZone !== "undefined" && (
        <InputField label="Time zone">
          <span className="font-mono text-sm text-text">{example.timeZone}</span>
        </InputField>
      )}

      {typeof example.currency !== "undefined" && (
        <InputField label="Currency">
          <span className="font-mono text-sm text-text">{example.currency}</span>
        </InputField>
      )}

      {typeof example.formats !== "undefined" && (
        <InputField label="Formats">
          <JsonValueBlock value={example.formats} />
        </InputField>
      )}

      {originalTranslation && (
        <InputField label="Original translation">
          <div className="space-y-2">
            <TranslationValueBlock value={originalTranslation} />
            <p className="text-xs text-muted">
              See more{" "}
              <Link
                to={`${getEntityRoute("message", detail.key, setKey)}/translations`}
                className="font-medium text-primary hover:underline"
              >
                translations
              </Link>{" "}
              and{" "}
              <Link
                to={`${getEntityRoute("message", detail.key, setKey)}/overrides`}
                className="font-medium text-primary hover:underline"
              >
                overrides
              </Link>
              .
            </p>
          </div>
        </InputField>
      )}
    </div>
  );
}

function MessageExamplesExpandedView(props: {
  examples: EvaluatedMessageExample[];
  localeDirections: Record<string, string | undefined>;
  originalTranslationsByLocale: Record<string, string | undefined>;
}) {
  return (
    <div className="space-y-6">
      {props.examples.map((example) => {
        const titleId = getMessageExampleId(example);

        return (
          <section
            key={`${example.exampleIndex}-${example.matrixIndex ?? "base"}-${example.locale}`}
            className="min-w-0 space-y-4"
          >
            <ExampleTitle
              title={getMessageExampleTitle(example)}
              targetId={titleId}
              description={example.description}
            />

            <ExampleTable
              inputs={
                <MessageExampleDetails
                  example={example}
                  showLocale
                  originalTranslationsByLocale={props.originalTranslationsByLocale}
                />
              }
              evaluatedTranslation={example.evaluatedTranslation}
              direction={getLocaleDirection(example.locale, props.localeDirections)}
            />
          </section>
        );
      })}
    </div>
  );
}

function MessageExamplesCompactView(props: {
  examples: EvaluatedMessageExample[];
  localeDirections: Record<string, string | undefined>;
  originalTranslationsByLocale: Record<string, string | undefined>;
}) {
  const [expandedExampleIds, setExpandedExampleIds] = React.useState<string[]>([]);
  const [lastOpenedExampleId, setLastOpenedExampleId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hashTargetId = decodeURIComponent(window.location.hash.slice(1));

    if (!hashTargetId) {
      return;
    }

    const matchingExample = props.examples.find(
      (example) => getMessageExampleId(example) === hashTargetId,
    );

    if (!matchingExample) {
      return;
    }

    setExpandedExampleIds((current) =>
      current.includes(hashTargetId) ? current : [...current, hashTargetId],
    );
    setLastOpenedExampleId(hashTargetId);
  }, [props.examples]);

  function toggleExample(exampleId: string) {
    if (expandedExampleIds.includes(exampleId)) {
      const nextExpandedExampleIds = expandedExampleIds.filter(
        (currentId) => currentId !== exampleId,
      );
      const nextLastOpenedExampleId =
        lastOpenedExampleId === exampleId
          ? nextExpandedExampleIds[nextExpandedExampleIds.length - 1] || null
          : lastOpenedExampleId;

      setExpandedExampleIds(nextExpandedExampleIds);
      setLastOpenedExampleId(nextLastOpenedExampleId);
      setWindowHash(nextLastOpenedExampleId || undefined);
      return;
    }

    setExpandedExampleIds((current) => [...current, exampleId]);
    setLastOpenedExampleId(exampleId);
    setWindowHash(exampleId);
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border">
      <table className="w-full table-fixed border-collapse bg-surface text-xs">
        <colgroup>
          <col className="w-16" />
          <col className="w-28" />
          <col className="w-1/3" />
          <col className="w-auto" />
        </colgroup>
        <thead className="bg-elevated text-left text-[11px] uppercase tracking-wide text-muted">
          <tr>
            <th className="border-b border-border px-3 py-2 font-semibold">#</th>
            <th className="border-b border-border px-3 py-2 font-semibold">Locale</th>
            <th className="border-b border-border px-3 py-2 font-semibold">Description</th>
            <th className="border-b border-border px-3 py-2 font-semibold">
              Evaluated translation
            </th>
          </tr>
        </thead>
        <tbody>
          {props.examples.map((example) => {
            const exampleId = getMessageExampleId(example);
            const isExpanded = expandedExampleIds.includes(exampleId);
            const direction = getLocaleDirection(example.locale, props.localeDirections);

            return (
              <React.Fragment key={exampleId}>
                <tr
                  id={exampleId}
                  className={[
                    "cursor-pointer align-top transition-colors",
                    isExpanded ? "bg-elevated" : "hover:bg-elevated/60",
                  ].join(" ")}
                  onClick={() => toggleExample(exampleId)}
                >
                  <td className="border-b border-border px-3 py-2 font-medium text-muted">
                    {getMessageExampleCompactLabel(example)}
                  </td>
                  <td className="border-b border-border px-3 py-2">{example.locale}</td>
                  <td className="min-w-0 border-b border-border px-3 py-2 text-muted">
                    <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {example.description || "—"}
                    </div>
                  </td>
                  <td
                    className={[
                      "min-w-0 border-b border-border px-3 py-2",
                      direction === "rtl" ? "text-right" : "",
                    ].join(" ")}
                    dir={direction}
                    style={direction ? { unicodeBidi: "plaintext" } : undefined}
                  >
                    <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {typeof example.evaluatedTranslation === "string"
                        ? example.evaluatedTranslation
                        : JSON.stringify(example.evaluatedTranslation)}
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-background/60">
                    <td colSpan={4} className="min-w-0 border-b border-border px-4 py-4">
                      <div className="min-w-0 space-y-4">
                        <div className="group flex items-center gap-2">
                          <h3 className="text-sm font-semibold">
                            {getMessageExampleTitle(example)}
                          </h3>
                          <ExamplePermalink targetId={exampleId} />
                        </div>

                        <MessageExampleDetails
                          example={example}
                          showLocale={false}
                          originalTranslationsByLocale={props.originalTranslationsByLocale}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getLocaleExampleId(example: EvaluatedLocaleExample) {
  return slugifyFragment(
    [
      `example-${example.exampleIndex + 1}`,
      example.locale,
      typeof example.matrixIndex === "number" ? `matrix-${example.matrixIndex + 1}` : "",
    ]
      .filter(Boolean)
      .join("-"),
  );
}

function getLocaleExampleTitle(example: EvaluatedLocaleExample) {
  const titleParts = [`Example #${example.exampleIndex + 1}`];

  if (typeof example.matrixIndex === "number") {
    titleParts.push(`matrix #${example.matrixIndex + 1}`);
  }

  return titleParts.join(" · ");
}

function getLocaleExampleCompactLabel(example: EvaluatedLocaleExample) {
  if (typeof example.matrixIndex === "number") {
    return `#${example.exampleIndex + 1}.${example.matrixIndex + 1}`;
  }

  return `#${example.exampleIndex + 1}`;
}

function getLocaleExampleEvaluatedTranslationText(example: EvaluatedLocaleExample) {
  return typeof example.evaluatedTranslation === "string"
    ? example.evaluatedTranslation
    : JSON.stringify(example.evaluatedTranslation);
}

function filterLocaleExamplesBySearch(
  examples: EvaluatedLocaleExample[],
  query: string,
): EvaluatedLocaleExample[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return examples;
  }

  return examples.filter((example) => {
    const id = getLocaleExampleId(example);
    const compactId = getLocaleExampleCompactLabel(example);
    const description = example.description ?? "";
    const translation = getLocaleExampleEvaluatedTranslationText(example);
    const haystack = `${id} ${compactId} ${description} ${translation}`.toLowerCase();
    return haystack.includes(needle);
  });
}

function LocaleExampleDetails(props: {
  example: EvaluatedLocaleExample;
  setKey?: string;
  localeDirection?: string;
  showLocale?: boolean;
  highlightQuery?: string;
}) {
  const { example, setKey, localeDirection } = props;
  const q = props.highlightQuery?.trim() ?? "";
  const highlight = Boolean(q);

  function localeLink(localeKey: string) {
    return highlight ? (
      <Link
        to={getEntityRoute("locale", localeKey, setKey)}
        className="font-medium text-primary hover:underline"
      >
        <ExamplesSearchHighlight text={localeKey} query={q} />
      </Link>
    ) : (
      <SourceLocaleLink localeKey={localeKey} />
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      {props.showLocale !== false && (
        <InputField label="Locale">{localeLink(example.locale)}</InputField>
      )}

      {example.sourceLocale !== example.locale && (
        <InputField label="Merged from">{localeLink(example.sourceLocale)}</InputField>
      )}

      {example.message && (
        <>
          <InputField label="Message">
            <Link
              to={getEntityRoute("message", example.message, setKey)}
              className="font-medium text-primary hover:underline"
            >
              {highlight ? (
                <ExamplesSearchHighlight text={example.message} query={q} />
              ) : (
                example.message
              )}
            </Link>
          </InputField>

          {example.originalTranslation && (
            <InputField label="Original translation">
              <div className="space-y-2">
                {highlight ? (
                  <div
                    dir={localeDirection}
                    className={[
                      "min-w-0 max-w-full whitespace-pre-wrap [overflow-wrap:anywhere]",
                      localeDirection === "rtl" ? "text-right" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={localeDirection ? { unicodeBidi: "plaintext" } : undefined}
                  >
                    <ExamplesSearchHighlight text={example.originalTranslation} query={q} />
                  </div>
                ) : (
                  <TranslationValueBlock
                    value={example.originalTranslation}
                    direction={localeDirection}
                  />
                )}
                <p className="text-xs text-muted">
                  See more{" "}
                  <Link
                    to={`${getEntityRoute("message", example.message, setKey)}/translations`}
                    className="font-medium text-primary hover:underline"
                  >
                    translations
                  </Link>{" "}
                  and{" "}
                  <Link
                    to={`${getEntityRoute("message", example.message, setKey)}/overrides`}
                    className="font-medium text-primary hover:underline"
                  >
                    overrides
                  </Link>
                  .
                </p>
              </div>
            </InputField>
          )}
        </>
      )}

      {example.rawMessage && (
        <InputField label="Raw message">
          <div
            dir={localeDirection}
            className={["min-w-0 max-w-full", localeDirection === "rtl" ? "text-right" : ""]
              .filter(Boolean)
              .join(" ")}
            style={localeDirection ? { unicodeBidi: "plaintext" } : undefined}
          >
            {highlight ? (
              <pre className="max-w-full whitespace-pre-wrap rounded border border-border bg-elevated p-4 text-xs text-text [overflow-wrap:anywhere]">
                <ExamplesSearchHighlight text={example.rawMessage} query={q} />
              </pre>
            ) : (
              <CodeBlock value={example.rawMessage} />
            )}
          </div>
        </InputField>
      )}

      {typeof example.values !== "undefined" && (
        <InputField label="Values">
          {highlight ? (
            <pre className="max-w-full whitespace-pre-wrap rounded border border-border bg-elevated p-4 text-xs text-text [overflow-wrap:anywhere]">
              <ExamplesSearchHighlight text={JSON.stringify(example.values, null, 2)} query={q} />
            </pre>
          ) : (
            <JsonValueBlock value={example.values} />
          )}
        </InputField>
      )}

      {typeof example.context !== "undefined" && (
        <InputField label="Context">
          {highlight ? (
            <pre className="max-w-full whitespace-pre-wrap rounded border border-border bg-elevated p-4 text-xs text-text [overflow-wrap:anywhere]">
              <ExamplesSearchHighlight text={JSON.stringify(example.context, null, 2)} query={q} />
            </pre>
          ) : (
            <JsonValueBlock value={example.context} />
          )}
        </InputField>
      )}

      {typeof example.timeZone !== "undefined" && (
        <InputField label="Time zone">
          <span className="font-mono text-sm text-text">
            {highlight ? (
              <ExamplesSearchHighlight text={example.timeZone} query={q} />
            ) : (
              example.timeZone
            )}
          </span>
        </InputField>
      )}

      {typeof example.currency !== "undefined" && (
        <InputField label="Currency">
          <span className="font-mono text-sm text-text">
            {highlight ? (
              <ExamplesSearchHighlight text={example.currency} query={q} />
            ) : (
              example.currency
            )}
          </span>
        </InputField>
      )}

      {typeof example.formats !== "undefined" && (
        <InputField label="Formats">
          {highlight ? (
            <pre className="max-w-full whitespace-pre-wrap rounded border border-border bg-elevated p-4 text-xs text-text [overflow-wrap:anywhere]">
              <ExamplesSearchHighlight text={JSON.stringify(example.formats, null, 2)} query={q} />
            </pre>
          ) : (
            <JsonValueBlock value={example.formats} />
          )}
        </InputField>
      )}
    </div>
  );
}

function LocaleExamplesExpandedView(props: {
  examples: EvaluatedLocaleExample[];
  setKey?: string;
  localeDirection?: string;
  searchQuery: string;
}) {
  return (
    <div className="space-y-6">
      {props.examples.map((example) => {
        const titleId = getLocaleExampleId(example);

        return (
          <section
            key={`${example.exampleIndex}-${example.matrixIndex ?? "base"}-${example.sourceLocale}-${example.locale}`}
            className="min-w-0 space-y-4"
          >
            <ExampleTitle
              title={getLocaleExampleTitle(example)}
              targetId={titleId}
              description={example.description}
              highlightQuery={props.searchQuery}
            />

            <ExampleTable
              inputs={
                <LocaleExampleDetails
                  example={example}
                  setKey={props.setKey}
                  localeDirection={props.localeDirection}
                  showLocale={false}
                  highlightQuery={props.searchQuery}
                />
              }
              evaluatedTranslation={example.evaluatedTranslation}
              direction={props.localeDirection}
              highlightQuery={props.searchQuery}
            />
          </section>
        );
      })}
    </div>
  );
}

function LocaleExamplesCompactView(props: {
  examples: EvaluatedLocaleExample[];
  setKey?: string;
  localeDirection?: string;
  searchQuery: string;
}) {
  const [expandedExampleIds, setExpandedExampleIds] = React.useState<string[]>([]);
  const [lastOpenedExampleId, setLastOpenedExampleId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hashTargetId = decodeURIComponent(window.location.hash.slice(1));

    if (!hashTargetId) {
      return;
    }

    const matchingExample = props.examples.find(
      (example) => getLocaleExampleId(example) === hashTargetId,
    );

    if (!matchingExample) {
      return;
    }

    setExpandedExampleIds((current) =>
      current.includes(hashTargetId) ? current : [...current, hashTargetId],
    );
    setLastOpenedExampleId(hashTargetId);
  }, [props.examples]);

  function toggleExample(exampleId: string) {
    if (expandedExampleIds.includes(exampleId)) {
      const nextExpandedExampleIds = expandedExampleIds.filter(
        (currentId) => currentId !== exampleId,
      );
      const nextLastOpenedExampleId =
        lastOpenedExampleId === exampleId
          ? nextExpandedExampleIds[nextExpandedExampleIds.length - 1] || null
          : lastOpenedExampleId;

      setExpandedExampleIds(nextExpandedExampleIds);
      setLastOpenedExampleId(nextLastOpenedExampleId);
      setWindowHash(nextLastOpenedExampleId || undefined);
      return;
    }

    setExpandedExampleIds((current) => [...current, exampleId]);
    setLastOpenedExampleId(exampleId);
    setWindowHash(exampleId);
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border">
      <table className="w-full table-fixed border-collapse bg-surface text-xs">
        <colgroup>
          <col className="w-16" />
          <col className="w-2/5" />
          <col className="w-auto" />
        </colgroup>
        <thead className="bg-elevated text-left text-[11px] uppercase tracking-wide text-muted">
          <tr>
            <th className="border-b border-border px-3 py-2 font-semibold">#</th>
            <th className="border-b border-border px-3 py-2 font-semibold">Description</th>
            <th className="border-b border-border px-3 py-2 font-semibold">
              Evaluated translation
            </th>
          </tr>
        </thead>
        <tbody>
          {props.examples.map((example) => {
            const exampleId = getLocaleExampleId(example);
            const isExpanded = expandedExampleIds.includes(exampleId);

            return (
              <React.Fragment key={exampleId}>
                <tr
                  id={exampleId}
                  className={[
                    "cursor-pointer align-top transition-colors",
                    isExpanded ? "bg-elevated" : "hover:bg-elevated/60",
                  ].join(" ")}
                  onClick={() => toggleExample(exampleId)}
                >
                  <td className="border-b border-border px-3 py-2 font-medium text-muted">
                    <ExamplesSearchHighlight
                      text={getLocaleExampleCompactLabel(example)}
                      query={props.searchQuery}
                    />
                  </td>
                  <td className="min-w-0 border-b border-border px-3 py-2 text-muted">
                    <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                      <ExamplesSearchHighlight
                        text={example.description || "—"}
                        query={props.searchQuery}
                      />
                    </div>
                  </td>
                  <td
                    className={[
                      "min-w-0 border-b border-border px-3 py-2",
                      props.localeDirection === "rtl" ? "text-right" : "",
                    ].join(" ")}
                    dir={props.localeDirection}
                    style={props.localeDirection ? { unicodeBidi: "plaintext" } : undefined}
                  >
                    <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                      <ExamplesSearchHighlight
                        text={
                          typeof example.evaluatedTranslation === "string"
                            ? example.evaluatedTranslation
                            : JSON.stringify(example.evaluatedTranslation)
                        }
                        query={props.searchQuery}
                      />
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-background/60">
                    <td colSpan={3} className="min-w-0 border-b border-border px-4 py-4">
                      <div className="min-w-0 space-y-4">
                        <div className="group flex items-center gap-2">
                          <h3 className="text-sm font-semibold">
                            {props.searchQuery.trim() ? (
                              <ExamplesSearchHighlight
                                text={getLocaleExampleTitle(example)}
                                query={props.searchQuery}
                              />
                            ) : (
                              getLocaleExampleTitle(example)
                            )}
                          </h3>
                          <ExamplePermalink targetId={exampleId} />
                        </div>

                        <LocaleExampleDetails
                          example={example}
                          setKey={props.setKey}
                          localeDirection={props.localeDirection}
                          showLocale={false}
                          highlightQuery={props.searchQuery}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LocaleExamplesTab() {
  const { detail, setKey } = useEntityDetail();
  const [searchParams, setSearchParams] = useSearchParams();
  const examples = (detail.evaluatedExamples || []) as EvaluatedLocaleExample[];
  const localeDirection = (detail.entity as Record<string, any>).direction as string | undefined;
  const view = searchParams.get("view");
  const activeView = view === "expanded" ? "expanded" : "compact";
  const sourceLocaleKeys = Array.from(
    new Set(examples.map((example) => example.sourceLocale)),
  ).sort();
  const sourceLocaleFilter = searchParams.get("sourceLocale");
  const activeSourceLocaleFilter =
    sourceLocaleFilter && sourceLocaleKeys.includes(sourceLocaleFilter) ? sourceLocaleFilter : "";
  const visibleExamples = activeSourceLocaleFilter
    ? examples.filter((example) => example.sourceLocale === activeSourceLocaleFilter)
    : examples;

  const searchQuery = searchParams.get("q") ?? "";
  const filteredExamples = filterLocaleExamplesBySearch(visibleExamples, searchQuery);

  useScrollToHash([filteredExamples.length, activeSourceLocaleFilter, activeView, searchQuery]);

  if (examples.length === 0) {
    return <p className="text-sm text-muted">No examples found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-h-0 min-w-0 flex-1 basis-[min(100%,22rem)] items-center">
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => {
              const val = event.target.value;
              setSearchParams(setSearchParam(searchParams, "q", val.trim() ? val : undefined), {
                replace: true,
              });
            }}
            placeholder="Search examples…"
            aria-label="Search examples"
            className={[
              EXAMPLES_TOOLBAR_CONTROL_HEIGHT_CLASS,
              "box-border rounded-lg border border-border bg-elevated py-0 pl-2 pr-3",
              "text-xs leading-snug text-text",
              "placeholder:text-xs placeholder:text-muted placeholder:leading-snug",
            ].join(" ")}
          />
        </div>

        {sourceLocaleKeys.length > 1 ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Filter by source locale</span>
            <nav className="flex flex-wrap gap-2">
              <button
                type="button"
                className={[
                  "inline-flex rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  activeSourceLocaleFilter
                    ? "border-pill bg-transparent text-text hover:bg-elevated"
                    : "border-primary bg-header-active text-header-text",
                ].join(" ")}
                onClick={() =>
                  setSearchParams(setSearchParam(searchParams, "sourceLocale", undefined))
                }
              >
                All
              </button>

              {sourceLocaleKeys.map((sourceLocaleKey) => {
                const isActive = activeSourceLocaleFilter === sourceLocaleKey;

                return (
                  <button
                    key={sourceLocaleKey}
                    type="button"
                    className={[
                      "inline-flex rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                      isActive
                        ? "border-primary bg-header-active text-header-text"
                        : "border-pill bg-transparent text-text hover:bg-elevated",
                    ].join(" ")}
                    onClick={() =>
                      setSearchParams(
                        setSearchParam(
                          searchParams,
                          "sourceLocale",
                          isActive ? undefined : sourceLocaleKey,
                        ),
                      )
                    }
                  >
                    {sourceLocaleKey}
                  </button>
                );
              })}
            </nav>
          </div>
        ) : null}

        <div className="ml-auto shrink-0">
          <ExamplesViewModeSwitch
            activeView={activeView}
            onViewChange={(view) =>
              setSearchParams(
                setSearchParam(searchParams, "view", view === "compact" ? undefined : view),
              )
            }
          />
        </div>
      </div>

      {filteredExamples.length === 0 ? (
        <p className="text-sm text-muted">No examples match your search.</p>
      ) : activeView === "compact" ? (
        <LocaleExamplesCompactView
          examples={filteredExamples}
          setKey={setKey}
          localeDirection={localeDirection}
          searchQuery={searchQuery}
        />
      ) : (
        <LocaleExamplesExpandedView
          examples={filteredExamples}
          setKey={setKey}
          localeDirection={localeDirection}
          searchQuery={searchQuery}
        />
      )}
    </div>
  );
}

function filterDuplicateValuesBySearch(
  duplicateValues: DuplicateTranslationValue[],
  query: string,
): DuplicateTranslationValue[] {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return duplicateValues;
  }

  return duplicateValues.filter((duplicate) => {
    const haystack = [
      duplicate.value,
      ...duplicate.messageKeys,
      ...duplicate.sources.map((source) => source.locale),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(needle);
  });
}

export function LocaleDuplicatesTab() {
  const { detail, setKey } = useEntityDetail();
  const [searchParams, setSearchParams] = useSearchParams();
  const [duplicates, setDuplicates] = React.useState<LocaleDuplicates | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedDuplicateHashes, setExpandedDuplicateHashes] = React.useState<string[]>([]);
  const localeDirection = (detail.entity as Record<string, any>).direction as string | undefined;
  const searchQuery = searchParams.get("q") ?? "";

  function toggleDuplicateValue(duplicate: DuplicateTranslationValue) {
    const duplicateHash = hashTranslationValue(duplicate.value);

    setExpandedDuplicateHashes((current) => {
      if (current.includes(duplicateHash)) {
        const next = current.filter((item) => item !== duplicateHash);
        setWindowHash(undefined);
        return next;
      }

      setWindowHash(duplicateHash);
      return [...current, duplicateHash];
    });
  }

  React.useEffect(() => {
    let cancelled = false;

    setDuplicates(null);
    setError(null);
    setExpandedDuplicateHashes([]);

    fetchLocaleDuplicates(detail.key, setKey)
      .then((data) => {
        if (!cancelled) {
          setDuplicates(data);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detail.key, setKey]);

  React.useEffect(() => {
    if (!duplicates || typeof window === "undefined") {
      return;
    }

    const hashTargetId = decodeURIComponent(window.location.hash.slice(1));

    if (!hashTargetId) {
      return;
    }

    const matchingDuplicate = duplicates.duplicateValues.find(
      (duplicate) => hashTranslationValue(duplicate.value) === hashTargetId,
    );

    if (!matchingDuplicate) {
      return;
    }

    const matchingHash = hashTranslationValue(matchingDuplicate.value);

    setExpandedDuplicateHashes((current) =>
      current.includes(matchingHash) ? current : [...current, matchingHash],
    );
  }, [duplicates]);

  useScrollToHash([duplicates?.duplicateValues.length, expandedDuplicateHashes.length]);

  if (error) {
    return <EmptyState title="Unable to load duplicate translations" description={error} />;
  }

  if (!duplicates) {
    return <div className="text-sm text-muted">Loading duplicate translations...</div>;
  }

  if (duplicates.duplicateValues.length === 0) {
    return <p className="text-sm text-muted">No duplicate translations found for this locale.</p>;
  }

  const visibleDuplicateValues = filterDuplicateValuesBySearch(
    duplicates.duplicateValues,
    searchQuery,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-h-0 min-w-0 flex-1 basis-[min(100%,22rem)] items-center">
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => {
              const val = event.target.value;
              setSearchParams(setSearchParam(searchParams, "q", val.trim() ? val : undefined), {
                replace: true,
              });
            }}
            placeholder="Search duplicates..."
            aria-label="Search duplicates"
            className={[
              EXAMPLES_TOOLBAR_CONTROL_HEIGHT_CLASS,
              "box-border rounded-lg border border-border bg-elevated py-0 pl-2 pr-3",
              "text-xs leading-snug text-text",
              "placeholder:text-xs placeholder:text-muted placeholder:leading-snug",
            ].join(" ")}
          />
        </div>

        <div className="shrink-0 text-xs text-muted">
          {duplicates.summary.duplicateValues} value
          {duplicates.summary.duplicateValues === 1 ? "" : "s"} ·{" "}
          {duplicates.summary.duplicateMessageKeys} message key
          {duplicates.summary.duplicateMessageKeys === 1 ? "" : "s"}
        </div>
      </div>

      {visibleDuplicateValues.length === 0 ? (
        <p className="text-sm text-muted">No duplicates match your search.</p>
      ) : (
        <div className="min-w-0 overflow-hidden rounded-xl border border-border">
          <table className="w-full table-fixed border-collapse bg-surface text-xs">
            <colgroup>
              <col className="w-[70%]" />
              <col className="w-[30%]" />
            </colgroup>
            <thead className="bg-elevated text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="border-b border-border px-3 py-2 font-semibold">Duplicate value</th>
                <th className="border-b border-border px-3 py-2 font-semibold">Messages</th>
              </tr>
            </thead>
            <tbody>
              {visibleDuplicateValues.map((duplicate) => {
                const sourcesByMessageKey = Object.fromEntries(
                  duplicate.sources.map((source) => [source.messageKey, source.locale]),
                );
                const duplicateHash = hashTranslationValue(duplicate.value);
                const isExpanded = expandedDuplicateHashes.includes(duplicateHash);

                return (
                  <React.Fragment key={duplicate.value}>
                    <tr
                      id={duplicateHash}
                      className={[
                        "cursor-pointer align-top transition-colors",
                        isExpanded ? "bg-elevated" : "hover:bg-elevated/60",
                      ].join(" ")}
                      onClick={() => toggleDuplicateValue(duplicate)}
                    >
                      <td
                        className={[
                          "min-w-0 border-b border-border px-3 py-2 font-medium text-text",
                          localeDirection === "rtl" ? "text-right" : "",
                        ].join(" ")}
                        dir={localeDirection}
                        style={localeDirection ? { unicodeBidi: "plaintext" } : undefined}
                      >
                        <div className="truncate">
                          <ExamplesSearchHighlight text={duplicate.value} query={searchQuery} />
                        </div>
                      </td>
                      <td className="min-w-0 border-b border-border px-3 py-2 text-muted">
                        {duplicate.messageKeys.length} message
                        {duplicate.messageKeys.length === 1 ? "" : "s"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-background/60">
                        <td colSpan={2} className="min-w-0 border-b border-border px-4 py-4">
                          <div className="min-w-0 space-y-3">
                            <div className="space-y-2">
                              <h3 className="text-sm font-semibold">Translation value</h3>
                              <CodeBlock value={duplicate.value} />
                            </div>
                            <h3 className="text-sm font-semibold">Messages</h3>
                            <div className="min-w-0 overflow-hidden rounded-lg border border-border">
                              <table className="w-full table-fixed border-collapse bg-surface text-xs">
                                <colgroup>
                                  <col className="w-[70%]" />
                                  <col className="w-[30%]" />
                                </colgroup>
                                <thead className="bg-elevated text-left text-[11px] uppercase tracking-wide text-muted">
                                  <tr>
                                    <th className="border-b border-border px-3 py-2 font-semibold">
                                      Message
                                    </th>
                                    <th className="border-b border-border px-3 py-2 font-semibold">
                                      Source
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {duplicate.messageKeys.map((messageKey) => {
                                    const sourceLocale =
                                      sourcesByMessageKey[messageKey] || duplicates.locale;
                                    const isInherited = sourceLocale !== duplicates.locale;

                                    return (
                                      <tr key={messageKey} className="align-top">
                                        <td className="min-w-0 border-b border-border px-3 py-2">
                                          <Link
                                            to={getEntityRoute("message", messageKey, setKey)}
                                            className="font-medium text-primary hover:underline"
                                          >
                                            <ExamplesSearchHighlight
                                              text={messageKey}
                                              query={searchQuery}
                                            />
                                          </Link>
                                        </td>
                                        <td className="min-w-0 border-b border-border px-3 py-2 text-muted">
                                          {isInherited ? (
                                            <>
                                              <span>from </span>
                                              <Link
                                                to={getEntityRoute("locale", sourceLocale, setKey)}
                                                className="font-medium text-primary hover:underline"
                                                onClick={(event) => event.stopPropagation()}
                                              >
                                                <ExamplesSearchHighlight
                                                  text={sourceLocale}
                                                  query={searchQuery}
                                                />
                                              </Link>
                                            </>
                                          ) : (
                                            <span>direct</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function EntityExamplesTab() {
  const { detail } = useEntityDetail();

  if (detail.type === "locale") {
    return <LocaleExamplesTab />;
  }

  return <MessageExamplesTab />;
}

export function AttributeUsageTab() {
  const { detail, setKey } = useEntityDetail();
  const usage = (detail.usage || {}) as Record<string, string[]>;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section>
        <h2 className="mb-2 font-semibold">Segments</h2>
        <UsageLinks type="segment" keys={usage.segments} setKey={setKey} />
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Messages</h2>
        <UsageLinks type="message" keys={usage.messages} setKey={setKey} />
      </section>
    </div>
  );
}

export function SegmentUsageTab() {
  const { detail, setKey } = useEntityDetail();
  const usage = (detail.usage || {}) as Record<string, string[]>;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section>
        <h2 className="mb-2 font-semibold">Attributes</h2>
        <UsageLinks type="attribute" keys={usage.attributes} setKey={setKey} />
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Messages</h2>
        <UsageLinks type="message" keys={usage.messages} setKey={setKey} />
      </section>
    </div>
  );
}

export function UsageTab() {
  const { detail } = useEntityDetail();

  if (detail.type === "segment") {
    return <SegmentUsageTab />;
  }

  return <AttributeUsageTab />;
}

export function SegmentConditionsTab() {
  const { detail, setKey } = useEntityDetail();
  const entity = detail.entity as Record<string, any>;

  return <ConditionTree conditions={entity.conditions} setKey={setKey} />;
}

export function TargetFormatsTab() {
  const { detail, setKey } = useEntityDetail();
  const { localeKey } = useParams();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";
  const rowsByLocale = (detail.formatRowsByLocale || {}) as Record<string, FormatRow[]>;
  const localeKeys = Object.keys(rowsByLocale).sort();

  const activeLocaleKey =
    localeKeys.length === 0 ? "" : localeKey && rowsByLocale[localeKey] ? localeKey : localeKeys[0];

  const activeFormatRows =
    activeLocaleKey && rowsByLocale[activeLocaleKey] ? rowsByLocale[activeLocaleKey] : [];

  const { formatTypes, formatTypePillKeys, selectedFormatType } =
    useFormatsTypePillSelection(activeFormatRows);

  if (localeKeys.length === 0) {
    return <p className="text-sm text-muted">No target formats found.</p>;
  }

  const basePath = `${getBasePath(setKey)}/targets/${encodeRouteSegment(detail.key)}/formats`;

  if (!localeKey) {
    const qs = searchParams.toString();
    return (
      <Navigate
        to={`${basePath}/${encodeRouteSegment(activeLocaleKey)}${qs ? `?${qs}` : ""}`}
        replace
      />
    );
  }

  return (
    <div className="space-y-6">
      <nav className="flex min-w-0 flex-wrap gap-2">
        {localeKeys.map((item) => {
          const qs = searchParams.toString();
          const suffix = qs ? `?${qs}` : "";
          const isActive = item === activeLocaleKey;
          return (
            <Link
              key={item}
              to={`${basePath}/${encodeRouteSegment(item)}${suffix}`}
              className={[
                "inline-flex rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                isActive
                  ? "border-primary bg-header-active text-header-text"
                  : "border-pill bg-transparent text-text hover:bg-elevated",
              ].join(" ")}
            >
              {item}
            </Link>
          );
        })}
      </nav>

      {formatTypes.length > 0 ? <FormatsTypePills typeKeys={formatTypePillKeys} /> : null}

      <FormatsSearchToolbar />

      <FormatRowsTable
        rows={rowsByLocale[activeLocaleKey]}
        searchQuery={searchQuery}
        formatPathLayout="split"
        hideTypeColumn={selectedFormatType != null}
        selectedFormatType={selectedFormatType}
        showExampleColumn={showFormatExampleColumn(selectedFormatType)}
      />
    </div>
  );
}

export function TargetMessagesTab() {
  const { detail, setKey } = useEntityDetail();

  return <UsageLinks type="message" keys={detail.messages as string[]} setKey={setKey} />;
}

export function EntityHistoryTab() {
  const { manifest } = useCatalog();
  const { detail, setKey } = useEntityDetail();

  return (
    <HistoryTimeline
      path={`${setKey ? `/data/sets/${encodeRouteSegment(setKey)}` : "/data/root"}/history/${detail.type}/${encodeRouteSegment(detail.key)}`}
      setKey={setKey}
      commitUrl={manifest.links?.commit}
    />
  );
}
