import { useCallback, useRef, useState } from "react";

export function Dropzone({ onFile }: { onFile: (file: File) => void }) {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return;
      onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        handle(e.dataTransfer.files?.[0]);
      }}
      onClick={() => inputRef.current?.click()}
      className={`group flex h-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-grid transition-colors ${
        hover ? "border-primary bg-primary/5" : "border-border hover:border-border-strong"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0] ?? undefined)}
      />
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md border border-border bg-surface font-mono text-xl text-primary">
          {"{ }"}
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          drag pdf here
        </div>
        <div className="mt-1 text-sm text-foreground">
          or <span className="text-primary underline-offset-4 group-hover:underline">browse files</span>
        </div>
        <div className="mt-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          processed entirely in your browser · nothing uploaded
        </div>
      </div>
    </div>
  );
}
