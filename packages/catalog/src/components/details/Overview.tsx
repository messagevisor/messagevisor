import * as React from "react";
import { Link } from "react-router-dom";

import { getEntityRoute } from "../../entityTypes";
import { Badge } from "../ui/Badge";
import { MarkdownContent } from "./MarkdownContent";

export function SourceLocaleLink(props: { localeKey: string; setKey?: string }) {
  return (
    <Link
      to={getEntityRoute("locale", props.localeKey, props.setKey)}
      className="font-medium text-primary hover:underline"
    >
      {props.localeKey}
    </Link>
  );
}

export function OverviewChipLink(props: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={props.to}
      className="inline-flex items-center rounded-full bg-pill px-2.5 py-0.5 text-xs font-medium text-primary hover:underline"
    >
      {props.children}
    </Link>
  );
}

export function LinkedEntityChips(props: {
  type: "locale" | "target";
  keys?: string[];
  setKey?: string;
}) {
  if (!props.keys?.length) return null;
  return (
    <>
      {props.keys.map((key) => (
        <OverviewChipLink key={key} to={getEntityRoute(props.type, key, props.setKey)}>
          {key}
        </OverviewChipLink>
      ))}
    </>
  );
}

export function OverviewChip(props: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full bg-pill px-2.5 py-0.5 text-xs text-text",
        props.className || "",
      ].join(" ")}
    >
      {props.children}
    </span>
  );
}

export function OverviewPlaceholder(props: { children: React.ReactNode }) {
  return <span className="text-xs italic text-faint">{props.children}</span>;
}

export function OverviewMetaPanel(props: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-elevated px-5 py-4">
      <dl className="space-y-3.5">{props.children}</dl>
    </div>
  );
}

export function OverviewMetaRow(props: { label: string; children?: React.ReactNode }) {
  if (!props.children) return null;
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-5">
      <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-faint sm:w-[7rem]">
        {props.label}
      </dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
        {props.children}
      </dd>
    </div>
  );
}

export function DescriptionField(props: {
  title?: string;
  value?: string;
  fallback?: string;
  showTopDivider?: boolean;
}) {
  return (
    <div className={props.showTopDivider === false ? undefined : "border-t border-border pt-6"}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
        {props.title || "Description"}
      </div>
      <div className="mt-2 min-w-0 text-sm [overflow-wrap:anywhere]">
        <MarkdownContent value={props.value || props.fallback} />
      </div>
    </div>
  );
}

export function hasEntityStatus(entity: Record<string, any>) {
  return entity.archived === true || entity.deprecated === true || entity.promotable === false;
}

export function EntityStatusBadges(props: { entity: Record<string, any> }) {
  if (!hasEntityStatus(props.entity)) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {props.entity.archived === true && <Badge tone="danger">archived</Badge>}
      {props.entity.deprecated === true && <Badge tone="warning">deprecated</Badge>}
      {props.entity.promotable === false && <Badge>not promotable</Badge>}
    </div>
  );
}
