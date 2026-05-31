export function CodeBlock(props: { value: unknown }) {
  return (
    <pre className="max-w-full whitespace-pre-wrap rounded border border-border bg-elevated p-4 text-xs text-text [overflow-wrap:anywhere]">
      {typeof props.value === "string" ? props.value : JSON.stringify(props.value, null, 2)}
    </pre>
  );
}
