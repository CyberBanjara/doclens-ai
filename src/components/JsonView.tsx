/**
 * Tiny JSON syntax highlighter — no deps. Returns highlighted <pre> content.
 */
function highlight(json: string) {
  // Escape HTML
  const escaped = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "text-syntax-number";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "text-syntax-key" : "text-syntax-string";
      } else if (/true|false|null/.test(match)) {
        cls = "text-syntax-number";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

export function JsonView({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2);
  return (
    <pre
      className="font-mono text-[12.5px] leading-relaxed text-syntax-punct whitespace-pre-wrap break-words"
      dangerouslySetInnerHTML={{ __html: highlight(json) }}
    />
  );
}
