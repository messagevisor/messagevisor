import type { ReactNode } from "react";

export function PageHeader(props: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 border-b border-border px-6 pb-4 pt-8 md:flex-row md:items-start">
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-3xl font-black text-text">{props.title}</h1>
        {props.description && <div className="mt-2 text-sm text-muted">{props.description}</div>}
      </div>
      {props.actions ? <div className="shrink-0">{props.actions}</div> : null}
    </div>
  );
}
