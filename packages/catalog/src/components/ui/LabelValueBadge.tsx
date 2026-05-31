import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type LabelValueBadgeTone = "neutral" | "inheritance" | "override";

const toneClasses: Record<LabelValueBadgeTone, { label: string; value: string; link: string }> = {
  neutral: {
    label: "bg-elevated text-muted",
    value: "bg-surface text-text",
    link: "text-primary hover:underline",
  },
  inheritance: {
    label: "bg-elevated text-muted",
    value: "bg-surface text-text",
    link: "text-primary hover:underline",
  },
  override: {
    label: "bg-pill text-text",
    value: "bg-surface text-text",
    link: "text-primary hover:underline",
  },
};

export function LabelValueBadge(props: {
  label: ReactNode;
  value: ReactNode;
  to?: string;
  tone?: LabelValueBadgeTone;
  compact?: boolean;
}) {
  const tone = toneClasses[props.tone || "neutral"];
  const valueContent = props.to ? (
    <Link to={props.to} className={`font-medium ${tone.link}`}>
      {props.value}
    </Link>
  ) : (
    <span className="font-medium text-text">{props.value}</span>
  );

  return (
    <span
      className={[
        "inline-flex overflow-hidden rounded-md border border-border shadow-sm",
        props.compact ? "text-[10px] leading-4" : "text-xs",
      ].join(" ")}
    >
      <span className={`${props.compact ? "px-1.5 py-px" : "px-2 py-1"} ${tone.label}`}>
        {props.label}
      </span>
      <span className={`${props.compact ? "px-1.5 py-px" : "px-2 py-1"} ${tone.value}`}>
        {valueContent}
      </span>
    </span>
  );
}
