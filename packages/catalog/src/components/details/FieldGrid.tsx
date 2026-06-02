import type { ReactNode } from "react";

export function FieldGrid(props: {
  fields: { label: string; value: ReactNode; fullWidth?: boolean }[];
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-8 md:grid-cols-2">
      {props.fields.map((field) => (
        <div key={field.label} className={field.fullWidth ? "md:col-span-2" : ""}>
          <dt className="text-sm font-medium text-muted">{field.label}</dt>
          <dd className="mt-1 min-w-0 text-sm [overflow-wrap:anywhere]">{field.value || "n/a"}</dd>
        </div>
      ))}
    </dl>
  );
}
