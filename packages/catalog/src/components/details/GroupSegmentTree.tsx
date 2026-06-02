import { Link } from "react-router-dom";
import type { GroupSegment } from "@messagevisor/types";

import { Badge } from "../ui/Badge";
import { EntityKey } from "../ui/EntityKey";
import { getEntityRoute } from "../../entityTypes";

function SegmentLeaf(props: { segmentKey: string; setKey?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="primary">segment</Badge>
        <Link
          to={getEntityRoute("segment", props.segmentKey, props.setKey)}
          className="font-semibold text-primary hover:underline"
        >
          <EntityKey value={props.segmentKey} className="font-semibold" />
        </Link>
      </div>
    </div>
  );
}

function GroupSegmentNode(props: { segment: GroupSegment; setKey?: string }) {
  if (typeof props.segment === "string") {
    return <SegmentLeaf segmentKey={props.segment} setKey={props.setKey} />;
  }

  const operator = "and" in props.segment ? "and" : "or" in props.segment ? "or" : "not";
  const children = props.segment[operator] as GroupSegment[];

  return (
    <div className="rounded-lg border border-border bg-elevated p-4">
      <div className="mb-3 flex items-center gap-2">
        <Badge tone="neutral">{operator.toUpperCase()}</Badge>
        <span className="text-sm text-muted">
          {children.length} branch{children.length === 1 ? "" : "es"}
        </span>
      </div>
      <div className="ml-3 space-y-3 border-l border-border pl-4">
        {children.map((child, index) => (
          <GroupSegmentNode key={`${operator}-${index}`} segment={child} setKey={props.setKey} />
        ))}
      </div>
    </div>
  );
}

export function GroupSegmentTree(props: {
  segments?: GroupSegment | GroupSegment[] | "*";
  setKey?: string;
}) {
  if (!props.segments) {
    return <p className="text-sm text-muted">No segments found.</p>;
  }

  if (props.segments === "*") {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-sm">
        Everyone
      </div>
    );
  }

  const segments = Array.isArray(props.segments) ? props.segments : [props.segments];

  return (
    <div className="space-y-3">
      {segments.map((segment, index) => (
        <GroupSegmentNode key={index} segment={segment} setKey={props.setKey} />
      ))}
    </div>
  );
}
