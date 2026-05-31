export function EmptyState(props: { title: string; description?: string }) {
  return (
    <div className="mx-6 rounded border-2 border-warning-outline bg-warning-surface p-4 text-center text-text">
      <p className="font-medium">{props.title}</p>
      {props.description && <p className="mt-1 text-sm text-muted">{props.description}</p>}
    </div>
  );
}
