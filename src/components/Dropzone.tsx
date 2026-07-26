import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";

/** Maximum allowed file size in bytes (50 MB). */
const MAX_FILE_SIZE = 50 * 1024 * 1024;
/** File size above which a warning is shown but upload proceeds (25 MB). */
const WARN_FILE_SIZE = 25 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DropzoneProps {
  onFile: (file: File) => void;
  /** Slim horizontal bar instead of the full onboarding hero — used once the
   * library already has documents, so returning users aren't shown a big
   * empty-state prompt every time. Drag/drop and validation are unchanged. */
  compact?: boolean;
}

export function Dropzone({ onFile, compact = false }: DropzoneProps) {
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
        toast.warning(`Large file (${formatSize(file.size)}). Processing may take a while.`, {
          duration: 5000,
        });
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

  const fileInput = (
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
  );

  const dragHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setHover(true);
    },
    onDragLeave: () => setHover(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setHover(false);
      handle(e.dataTransfer.files?.[0]);
    },
  };

  if (compact) {
    return (
      <div
        {...dragHandlers}
        onClick={() => inputRef.current?.click()}
        className={`group flex h-14 cursor-pointer items-center gap-3 rounded-2xl border border-dashed px-5 transition-all ${
          hover
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-surface-2/30"
        }`}
      >
        {fileInput}
        <Upload className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
        <span className="text-sm font-medium text-foreground">Add a PDF</span>
        <span className="text-xs text-muted-foreground">or drop it here</span>
      </div>
    );
  }

  return (
    <div
      {...dragHandlers}
      onClick={() => inputRef.current?.click()}
      className={`group relative flex h-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[18px] border border-dashed bg-background transition-all ${
        hover
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50 hover:bg-surface-2/30"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--primary)_8%,transparent),transparent_55%)] opacity-0 transition-opacity group-hover:opacity-100" />
      {fileInput}
      <div className="relative z-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface-2 text-primary transition-all group-hover:scale-105 group-hover:border-primary/30 group-hover:bg-primary/10">
          <Upload className="h-5 w-5" />
        </div>
        <div className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
          Drop a PDF here, or click to browse
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          Up to {formatSize(MAX_FILE_SIZE)} · stays on your device
        </div>
      </div>
    </div>
  );
}
