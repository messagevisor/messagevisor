import * as React from "react";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeQueries(query: string | string[]) {
  const queries = Array.isArray(query) ? query : [query];

  return Array.from(
    new Set(queries.map((item) => item.trim()).filter((item) => item.length > 0)),
  ).sort((left, right) => right.length - left.length);
}

export function SearchHighlight(props: { text: string; query: string | string[] }) {
  const queries = normalizeQueries(props.query);
  if (queries.length === 0) {
    return <>{props.text}</>;
  }

  const regex = new RegExp(queries.map(escapeRegExp).join("|"), "gi");
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of props.text.matchAll(regex)) {
    if (match.index !== undefined && match.index > lastIndex) {
      parts.push(props.text.slice(lastIndex, match.index));
    }

    if (match.index !== undefined) {
      parts.push(
        <SearchHighlightMark key={`hm-${match.index}-${key++}`}>{match[0]}</SearchHighlightMark>,
      );
      lastIndex = match.index + match[0].length;
    }
  }

  if (lastIndex < props.text.length) {
    parts.push(props.text.slice(lastIndex));
  }

  return <>{parts}</>;
}

export function SearchHighlightMark(props: { children: React.ReactNode }) {
  return (
    <mark
      className={[
        "rounded-[3px] bg-amber-100 px-0.5 py-px text-inherit",
        "shadow-[inset_0_-2px_0_0_rgba(251,191,36,0.35)] ring-1 ring-amber-400/25 ring-inset",
        "transition-[background-color,box-shadow] duration-150",
      ].join(" ")}
    >
      {props.children}
    </mark>
  );
}
