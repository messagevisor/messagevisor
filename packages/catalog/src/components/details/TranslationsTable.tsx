import { Link } from "react-router-dom";
import * as React from "react";

import type { TranslationRow } from "../../types";
import { getEntityRoute } from "../../entityTypes";
import { useEntityDetail } from "../../pages/EntityDetailPage";
import { Badge } from "../ui/Badge";

function getDirectionClassName(direction?: string) {
  return direction === "rtl" ? "text-right" : "";
}

function getDirectionStyle(direction?: string) {
  if (!direction) {
    return undefined;
  }

  return { unicodeBidi: "plaintext" as const };
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

export function TranslationsTable(props: {
  translations?: Record<string, string>;
  rows?: TranslationRow[];
  linkLocales?: boolean;
  showSource?: boolean;
  translationLabel?: string;
  comparisonLabel?: string;
  comparisonValues?: Record<string, string | undefined>;
  localeDirections?: Record<string, string | undefined>;
  renderMetaCell?: (entry: TranslationRow) => React.ReactNode;
  renderExpandedRow?: (entry: TranslationRow) => React.ReactNode;
  getRowKey?: (entry: TranslationRow) => string;
  getRowFragmentId?: (entry: TranslationRow) => string;
}) {
  const { setKey } = useEntityDetail();
  const showSource = props.showSource !== false;
  const entries: TranslationRow[] = props.rows
    ? props.rows
    : Object.entries(props.translations || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([locale, value]) => ({ locale, value, source: "direct" as const }));
  const [expandedRowKeys, setExpandedRowKeys] = React.useState<string[]>([]);
  const [lastOpenedRowFragmentId, setLastOpenedRowFragmentId] = React.useState<string | null>(null);
  const showWorkflow = entries.some((entry) => entry.status || entry.stale);

  if (entries.length === 0) {
    return <p className="text-sm text-muted">No translations found.</p>;
  }

  React.useEffect(() => {
    if (typeof window === "undefined" || !props.getRowFragmentId) {
      return;
    }

    const hashTargetId = decodeURIComponent(window.location.hash.slice(1));

    if (!hashTargetId) {
      return;
    }

    const matchingEntry = entries.find((entry) => props.getRowFragmentId?.(entry) === hashTargetId);

    if (!matchingEntry) {
      return;
    }

    const rowKey = props.getRowKey ? props.getRowKey(matchingEntry) : matchingEntry.locale;

    setExpandedRowKeys((current) => (current.includes(rowKey) ? current : [...current, rowKey]));
    setLastOpenedRowFragmentId(hashTargetId);
  }, [entries, props.getRowFragmentId, props.getRowKey]);

  React.useEffect(() => {
    if (!lastOpenedRowFragmentId || typeof window === "undefined") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const targetElement = document.getElementById(lastOpenedRowFragmentId);

      if (!targetElement) {
        return;
      }

      targetElement.scrollIntoView({ block: "start" });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [lastOpenedRowFragmentId]);

  const columnCount =
    2 +
    (props.comparisonLabel ? 1 : 0) +
    (props.renderMetaCell ? 1 : 0) +
    (showWorkflow ? 1 : 0) +
    (showSource ? 1 : 0);

  return (
    <div className="overflow-hidden rounded border border-border">
      <table className="w-full border-collapse bg-surface text-xs">
        <thead className="bg-elevated text-left text-[11px] uppercase tracking-wide text-muted">
          <tr>
            <th className="border-b border-border px-3 py-2 font-semibold">Locale</th>
            <th className="border-b border-border px-3 py-2 font-semibold">
              {props.translationLabel || "Translation"}
            </th>
            {props.comparisonLabel && (
              <th className="border-b border-border px-3 py-2 font-semibold">
                {props.comparisonLabel}
              </th>
            )}
            {props.renderMetaCell && (
              <th className="border-b border-border px-3 py-2 font-semibold" />
            )}
            {showWorkflow && (
              <th className="border-b border-border px-3 py-2 font-semibold">Workflow</th>
            )}
            {showSource && (
              <th className="border-b border-border px-3 py-2 font-semibold">Source</th>
            )}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const rowKey = props.getRowKey ? props.getRowKey(entry) : entry.locale;
            const rowFragmentId = props.getRowFragmentId?.(entry);
            const isExpandable = Boolean(props.renderExpandedRow);
            const isExpanded = expandedRowKeys.includes(rowKey);

            return (
              <React.Fragment key={rowKey}>
                <tr
                  id={rowFragmentId}
                  className={
                    isExpandable
                      ? [
                          "cursor-pointer transition-colors",
                          isExpanded ? "bg-elevated" : "hover:bg-elevated/60",
                        ].join(" ")
                      : undefined
                  }
                  onClick={
                    isExpandable
                      ? () =>
                          setExpandedRowKeys((current) => {
                            if (current.includes(rowKey)) {
                              const nextExpandedRowKeys = current.filter(
                                (value) => value !== rowKey,
                              );
                              const nextLastOpenedRowKey =
                                rowFragmentId && lastOpenedRowFragmentId === rowFragmentId
                                  ? nextExpandedRowKeys[nextExpandedRowKeys.length - 1] || null
                                  : current[current.length - 1] || null;
                              const nextLastOpenedRowFragmentId = nextLastOpenedRowKey
                                ? props.getRowFragmentId?.(
                                    entries.find(
                                      (item) =>
                                        (props.getRowKey ? props.getRowKey(item) : item.locale) ===
                                        nextLastOpenedRowKey,
                                    ) as TranslationRow,
                                  ) || null
                                : null;

                              setLastOpenedRowFragmentId(nextLastOpenedRowFragmentId);
                              setWindowHash(nextLastOpenedRowFragmentId || undefined);
                              return nextExpandedRowKeys;
                            }

                            if (rowFragmentId) {
                              setLastOpenedRowFragmentId(rowFragmentId);
                              setWindowHash(rowFragmentId);
                            }

                            return [...current, rowKey];
                          })
                      : undefined
                  }
                >
                  <td className="border-b border-border px-3 py-2 font-medium">
                    {props.linkLocales ? (
                      <Link
                        to={getEntityRoute("locale", entry.locale, setKey)}
                        className="font-medium text-primary hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {entry.locale}
                      </Link>
                    ) : (
                      entry.locale
                    )}
                  </td>
                  <td
                    className={[
                      "border-b border-border px-3 py-2",
                      entry.source === "inherited" ? "text-faint" : "",
                      getDirectionClassName(props.localeDirections?.[entry.locale]),
                    ].join(" ")}
                    dir={props.localeDirections?.[entry.locale]}
                    style={getDirectionStyle(props.localeDirections?.[entry.locale])}
                  >
                    {entry.value || "—"}
                  </td>
                  {props.comparisonLabel && (
                    <td
                      className={[
                        "border-b border-border px-3 py-2 text-muted",
                        getDirectionClassName(props.localeDirections?.[entry.locale]),
                      ].join(" ")}
                      dir={props.localeDirections?.[entry.locale]}
                      style={getDirectionStyle(props.localeDirections?.[entry.locale])}
                    >
                      {props.comparisonValues?.[entry.locale] || "—"}
                    </td>
                  )}
                  {props.renderMetaCell && (
                    <td className="border-b border-border px-3 py-2">
                      {props.renderMetaCell(entry)}
                    </td>
                  )}
                  {showWorkflow && (
                    <td className="border-b border-border px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {entry.status && <Badge>{entry.status}</Badge>}
                        {entry.stale && <Badge tone="warning">stale</Badge>}
                      </div>
                    </td>
                  )}
                  {showSource && (
                    <td className="border-b border-border px-3 py-2 text-muted">
                      {entry.source}
                      {entry.from ? (
                        <>
                          {" from "}
                          <Link
                            to={getEntityRoute("locale", entry.from, setKey)}
                            className="font-medium text-primary hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {entry.from}
                          </Link>
                        </>
                      ) : (
                        ""
                      )}
                    </td>
                  )}
                </tr>
                {isExpandable && isExpanded && (
                  <tr className="bg-background/60">
                    <td colSpan={columnCount} className="border-b border-border px-4 py-4">
                      {props.renderExpandedRow?.(entry)}
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
