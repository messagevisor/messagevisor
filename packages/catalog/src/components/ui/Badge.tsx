import type { ReactNode } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "primary";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "border-pill bg-pill text-text",
  success: "border-success-outline bg-success-surface text-text",
  warning: "border-warning-outline bg-warning-surface text-text",
  danger: "border-danger-outline bg-danger-surface text-danger",
  primary: "border-pill bg-pill text-text",
};

export function Badge(props: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${toneClasses[props.tone || "neutral"]}`}
    >
      {props.children}
    </span>
  );
}
