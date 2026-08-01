import * as React from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import {
  getCatalogAssertions,
  getTestAssertionPermalink,
  type CatalogTestSpec,
} from "../../testModel";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { EntityKey } from "../ui/EntityKey";
import { LabelValueBadge } from "../ui/LabelValueBadge";
import { MarkdownContent } from "./MarkdownContent";

function hasValue(value: unknown) {
  return value !== undefined && value !== null;
}

function ValueDisplay(props: { value: unknown }) {
  if (!hasValue(props.value)) return <span className="text-faint">not set</span>;
  if (typeof props.value === "boolean") {
    return <Badge tone={props.value ? "success" : "neutral"}>{String(props.value)}</Badge>;
  }
  if (Array.isArray(props.value)) {
    if (props.value.length === 0) return <span className="text-faint">empty</span>;
    return (
      <div className="space-y-1.5">
        {props.value.map((entry, index) => (
          <div key={index} className="rounded-md border border-border bg-surface px-2 py-1">
            <ValueDisplay value={entry} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof props.value === "object") {
    const entries = Object.entries(props.value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-faint">empty</span>;
    return (
      <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {entries.map(([key, value]) => (
          <div key={key} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(8rem,0.35fr)_1fr]">
            <dt className="font-mono text-xs font-semibold text-muted [overflow-wrap:anywhere]">
              {key}
            </dt>
            <dd className="min-w-0 text-sm [overflow-wrap:anywhere]">
              <ValueDisplay value={value} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="font-mono text-xs [overflow-wrap:anywhere]">{String(props.value)}</span>;
}

function DataPanel(props: { title: string; value: unknown }) {
  if (!hasValue(props.value)) return null;
  return (
    <section className="min-w-0 rounded-xl border border-border bg-elevated p-4">
      <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
        {props.title}
      </h4>
      <ValueDisplay value={props.value} />
    </section>
  );
}

function getExpected(assertion: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(assertion).filter(([key]) => key.startsWith("expected")),
  );
}

function getInputs(assertion: Record<string, unknown>) {
  const keys = [
    "message",
    "rawMessage",
    "segment",
    "values",
    "withFlags",
    "withVariations",
    "formats",
  ];
  return Object.fromEntries(
    keys.filter((key) => hasValue(assertion[key])).map((key) => [key, assertion[key]]),
  );
}

function AssertionPermalink(props: { permalink: string; label: string }) {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  search.set("assertion", props.permalink);
  return (
    <Link
      to={{ pathname: location.pathname, search: `?${search.toString()}` }}
      aria-label={`Link to assertion ${props.label}`}
      title="Link to this assertion"
      className="inline-flex rounded p-1 text-muted opacity-100 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:opacity-0 md:group-hover:opacity-100"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07L13 20" />
      </svg>
    </Link>
  );
}

function TestSpec(props: { test: CatalogTestSpec; selected?: string; index: number }) {
  const expanded = getCatalogAssertions(props.test);
  const hasMatrix = props.test.authoredAssertions.some((assertion) => Boolean(assertion.matrix));
  return (
    <section className="space-y-5">
      <header className="flex flex-col justify-between gap-3 border-b border-border pb-3 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
            Test spec {props.index + 1}
          </div>
          <h2 className="mt-1 font-mono text-sm font-semibold [overflow-wrap:anywhere]">
            <EntityKey value={props.test.key} />
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.test.promotable === false && <Badge>not promotable</Badge>}
          <Badge>{props.test.authoredAssertions.length} authored</Badge>
          {hasMatrix && <Badge tone="primary">{expanded.length} applied</Badge>}
        </div>
      </header>
      <div className="space-y-5">
        {expanded.map(({ assertion, label, matrixValues, caseIndex, caseCount }) => {
          const permalink = getTestAssertionPermalink(props.test.key, label);
          const expected = getExpected(assertion);
          const inputs = getInputs(assertion);
          return (
            <article
              id={`assertion-${encodeURIComponent(permalink)}`}
              key={permalink}
              className={`scroll-mt-6 space-y-4 rounded-2xl border bg-surface p-5 ${props.selected === permalink ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
            >
              <header className="space-y-2">
                <div className="group flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">Assertion {label}</h3>
                    {typeof caseIndex === "number" && (
                      <Badge tone="primary">
                        Matrix case {caseIndex + 1} of {caseCount}
                      </Badge>
                    )}
                  </div>
                  <AssertionPermalink permalink={permalink} label={label} />
                </div>
                {typeof assertion.description === "string" && (
                  <MarkdownContent value={assertion.description} />
                )}
              </header>
              <div className="flex flex-wrap gap-2">
                {hasValue(assertion.locale) && (
                  <LabelValueBadge label="Locale" value={String(assertion.locale)} compact />
                )}
                {hasValue(assertion.target) && (
                  <LabelValueBadge label="Target" value={String(assertion.target)} compact />
                )}
                {hasValue(assertion.currency) && (
                  <LabelValueBadge label="Currency" value={String(assertion.currency)} compact />
                )}
                {hasValue(assertion.timeZone) && (
                  <LabelValueBadge label="Time zone" value={String(assertion.timeZone)} compact />
                )}
              </div>
              {matrixValues && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                    Matrix values
                  </span>
                  {Object.entries(matrixValues).map(([key, value]) => (
                    <LabelValueBadge key={key} label={key} value={String(value)} compact />
                  ))}
                </div>
              )}
              <div className="space-y-4">
                <DataPanel title="Context" value={assertion.context || {}} />
                {Object.keys(inputs).length > 0 && <DataPanel title="Input" value={inputs} />}
                {Object.keys(expected).length > 0 && (
                  <DataPanel title="Expected" value={expected} />
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function EntityTests(props: { tests: CatalogTestSpec[] }) {
  const [searchParams] = useSearchParams();
  const selected = searchParams.get("assertion") || undefined;
  React.useEffect(() => {
    if (!selected) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`assertion-${encodeURIComponent(selected)}`)
        ?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected, props.tests]);

  if (props.tests.length === 0) return <EmptyState title="No tests found" />;
  return (
    <div className="space-y-10">
      {props.tests.map((test, index) => (
        <TestSpec key={test.key} test={test} selected={selected} index={index} />
      ))}
    </div>
  );
}
