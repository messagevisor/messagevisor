import type { ReactNode } from "react";

export function PageHeader(props: {
  title: ReactNode;
  titleAction?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 border-b border-border px-6 pb-4 pt-8 md:flex-row md:items-start">
      <div className="min-w-0 flex-1">
        <div className="group flex min-w-0 items-center gap-2">
          <h1 className="min-w-0 text-3xl font-black text-text [overflow-wrap:anywhere]">
            {props.title}
          </h1>
          {props.titleAction ? <div className="shrink-0">{props.titleAction}</div> : null}
        </div>
        {props.description && (
          <div className="mt-2 min-w-0 text-sm text-muted [overflow-wrap:anywhere]">
            {props.description}
          </div>
        )}
      </div>
      {props.actions ? <div className="shrink-0">{props.actions}</div> : null}
    </div>
  );
}
