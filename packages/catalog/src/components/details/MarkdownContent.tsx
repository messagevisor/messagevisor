import ReactMarkdown from "react-markdown";

export function MarkdownContent(props: { value?: string }) {
  if (!props.value || !props.value.trim()) {
    return <p className="text-sm text-muted">No description.</p>;
  }

  return (
    <div
      className={[
        "prose prose-sm max-w-none prose-headings:text-text prose-p:text-text prose-strong:text-text prose-a:text-primary",
        /* Inline `code`: light fill, slightly darker border for definition */
        "[&_code]:rounded-md [&_code]:border [&_code]:border-faint [&_code]:bg-elevated [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem] [&_code]:font-medium [&_code]:text-text",
        /* Fenced blocks: airy surface with a clearer frame */
        "[&_pre]:my-3 [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-faint [&_pre]:bg-elevated [&_pre]:p-4 [&_pre]:shadow-sm",
        /* Reset inner code inside pre (do not use pill/chip styling) */
        "[&_pre_code]:m-0 [&_pre_code]:block [&_pre_code]:w-full [&_pre_code]:rounded-none [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs [&_pre_code]:font-normal [&_pre_code]:leading-relaxed [&_pre_code]:shadow-none",
      ].join(" ")}
    >
      <ReactMarkdown>{props.value}</ReactMarkdown>
    </div>
  );
}
