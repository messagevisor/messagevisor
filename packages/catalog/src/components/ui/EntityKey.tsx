export function EntityKey(props: { value: string; className?: string }) {
  const parts = props.value.split(".");

  return (
    <span
      className={["font-mono leading-snug [overflow-wrap:anywhere]", props.className || ""].join(
        " ",
      )}
    >
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {index < parts.length - 1 ? (
            <>
              .<wbr />
            </>
          ) : null}
        </span>
      ))}
    </span>
  );
}
