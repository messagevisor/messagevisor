import { Link } from "react-router-dom";
import type { Condition } from "@messagevisor/types";

import { Badge } from "../ui/Badge";
import { getEntityRoute } from "../../entityTypes";

function formatValue(value: unknown): string {
  if (typeof value === "undefined") {
    return "";
  }

  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item)).join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function getParentAttributeKey(attributePath: string) {
  return attributePath.split(".")[0];
}

function ConditionLeaf(props: { condition: Record<string, any>; setKey?: string }) {
  if ("attribute" in props.condition) {
    const attributePath = String(props.condition.attribute);

    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="primary">attribute</Badge>
          <Link
            to={getEntityRoute("attribute", getParentAttributeKey(attributePath), props.setKey)}
            className="font-semibold text-primary hover:underline"
          >
            {attributePath}
          </Link>
          <span className="font-medium text-text">{props.condition.operator}</span>
          {"value" in props.condition && (
            <span className="text-muted">{formatValue(props.condition.value)}</span>
          )}
        </div>
      </div>
    );
  }

  if ("feature" in props.condition) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="success">feature</Badge>
          <span className="font-semibold text-text">{String(props.condition.feature)}</span>
          <span className="font-medium text-text">{props.condition.operator}</span>
        </div>
      </div>
    );
  }

  if ("experiment" in props.condition) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="warning">experiment</Badge>
          <span className="font-semibold text-text">{String(props.condition.experiment)}</span>
          <span className="font-medium text-text">{props.condition.operator}</span>
          <span className="text-muted">{formatValue(props.condition.value)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted shadow-sm">
      Unsupported condition
    </div>
  );
}

function ConditionNode(props: { condition: Condition; setKey?: string }) {
  const condition = props.condition as any;

  if (typeof condition === "string") {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-sm">
        {condition === "*" ? "Everyone" : condition}
      </div>
    );
  }

  if ("and" in condition || "or" in condition || "not" in condition) {
    const operator = "and" in condition ? "and" : "or" in condition ? "or" : "not";
    const children = condition[operator] as Condition[];

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
            <ConditionNode key={`${operator}-${index}`} condition={child} setKey={props.setKey} />
          ))}
        </div>
      </div>
    );
  }

  return <ConditionLeaf condition={condition} setKey={props.setKey} />;
}

export function ConditionTree(props: {
  conditions?: Condition | Condition[] | "*";
  setKey?: string;
}) {
  if (!props.conditions) {
    return <p className="text-sm text-muted">No conditions found.</p>;
  }

  if (props.conditions === "*") {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-sm">
        Everyone
      </div>
    );
  }

  const conditions = Array.isArray(props.conditions) ? props.conditions : [props.conditions];

  return (
    <div className="space-y-3">
      {conditions.map((condition, index) => (
        <ConditionNode key={index} condition={condition} setKey={props.setKey} />
      ))}
    </div>
  );
}
