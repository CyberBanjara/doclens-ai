import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

/** Maximum allowed file size in bytes (50 MB). */
const MAX_FILE_SIZE = 50 * 1024 * 1024;
/** File size above which a warning is shown but upload proceeds (25 MB). */
const WARN_FILE_SIZE = 25 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Dropzone({ onFile }: { onFile: (file: File) => void }) {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (file: File | undefined) => {
      if (!file) return;

      // Validate file type
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Only PDF files are supported.");
        return;
      }

      // Enforce hard size limit
      if (file.size > MAX_FILE_SIZE) {
        toast.error(
          `File too large (${formatSize(file.size)}). Maximum allowed size is ${formatSize(MAX_FILE_SIZE)}.`,
        );
        return;
      }

      // Warn on large files
      if (file.size > WARN_FILE_SIZE) {
        toast.warning(
          `Large file (${formatSize(file.size)}). Processing may take a while.`,
          { duration: 5000 },
        );
      }

      // Validate the file isn't empty
      if (file.size === 0) {
        toast.error("File is empty.");
        return;
      }

      onFile(file);
      toast.success(`"${file.name}" added to library.`);
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
        onChange={(e) => {
          handle(e.target.files?.[0] ?? undefined);
          // Reset input so re-uploading the same file triggers onChange
          if (inputRef.current) inputRef.current.value = "";
        }}
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
        <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
          max {formatSize(MAX_FILE_SIZE)}
        </div>
        <div className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          processed entirely in your browser · nothing uploaded
        </div>
      </div>
    </div>
  );
}
