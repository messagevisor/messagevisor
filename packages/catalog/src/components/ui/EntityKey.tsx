import * as React from "react";

import { SearchHighlightMark } from "./SearchHighlight";

interface HighlightRange {
  start: number;
  end: number;
}

function getHighlightRanges(value: string, queries: string[]): HighlightRange[] {
  const lowerValue = value.toLowerCase();
  const ranges: HighlightRange[] = [];

  for (const rawQuery of queries) {
    const query = rawQuery.trim().toLowerCase();
    if (!query) continue;

    let start = lowerValue.indexOf(query);
    while (start !== -1) {
      ranges.push({ start, end: start + query.length });
      start = lowerValue.indexOf(query, start + query.length);
    }
  }

  return ranges
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .reduce<HighlightRange[]>((merged, range) => {
      const previous = merged[merged.length - 1];
      if (!previous || range.start > previous.end) {
        merged.push({ ...range });
      } else {
        previous.end = Math.max(previous.end, range.end);
      }
      return merged;
    }, []);
}

function renderKeyTextWithBreaks(text: string) {
  return text.split(".").flatMap((part, index, parts) => {
    const nodes: React.ReactNode[] = [part];
    if (index < parts.length - 1) {
      nodes.push(
        <React.Fragment key={`dot-${index}`}>
          .<wbr />
        </React.Fragment>,
      );
    }
    return nodes;
  });
}

function renderHighlightedKey(value: string, queries: string[]) {
  const ranges = getHighlightRanges(value, queries);
  if (ranges.length === 0) {
    return renderKeyTextWithBreaks(value);
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      nodes.push(
        <React.Fragment key={`text-${cursor}`}>
          {renderKeyTextWithBreaks(value.slice(cursor, range.start))}
        </React.Fragment>,
      );
    }

    nodes.push(
      <SearchHighlightMark key={`highlight-${range.start}-${index}`}>
        {renderKeyTextWithBreaks(value.slice(range.start, range.end))}
      </SearchHighlightMark>,
    );
    cursor = range.end;
  });

  if (cursor < value.length) {
    nodes.push(
      <React.Fragment key={`text-${cursor}`}>
        {renderKeyTextWithBreaks(value.slice(cursor))}
      </React.Fragment>,
    );
  }

  return nodes;
}

export function EntityKey(props: { value: string; className?: string; highlightQuery?: string[] }) {
  const highlightQuery = props.highlightQuery || [];

  return (
    <span
      className={["inline leading-snug [overflow-wrap:anywhere]", props.className || ""].join(" ")}
    >
      {renderHighlightedKey(props.value, highlightQuery)}
    </span>
  );
}
