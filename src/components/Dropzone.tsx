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
      className={`group relative flex h-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed bg-background transition-all ${
        hover
          ? "border-primary bg-primary/10 shadow-[0_0_24px_rgba(78,222,163,0.12)]"
          : "border-border hover:border-primary/70 hover:bg-primary/5"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(78,222,163,0.10),transparent_55%)] opacity-0 transition-opacity group-hover:opacity-100" />
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
      <div className="relative z-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface-2 font-mono text-xl text-primary transition-all group-hover:scale-105 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
          ↑
        </div>
        <div className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
          Click or drag PDF documents here
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          PDF only · max {formatSize(MAX_FILE_SIZE)}
        </div>
        <div className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">
          processed entirely in your browser · nothing uploaded
        </div>
      </div>
    </div>
  );
}
