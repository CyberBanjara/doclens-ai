import { useState } from "react";
import { Download } from "lucide-react";
import { exportAsMarkdown, exportAsJson } from "@/lib/export";

/** Desktop tab-bar export dropdown (Markdown / JSON) for the active document. */
export function ExportMenu({ docId }: { docId: string }) {
  const [showExport, setShowExport] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowExport(!showExport)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        title="Export"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      {showExport && (
        <div className="absolute right-0 top-full z-20 mt-1 rounded-lg border border-border bg-surface p-1 shadow-xl">
          <button
            onClick={() => {
              void exportAsMarkdown(docId);
              setShowExport(false);
            }}
            className="block w-full rounded px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-2"
          >
            Export as Markdown
          </button>
          <button
            onClick={() => {
              void exportAsJson(docId);
              setShowExport(false);
            }}
            className="block w-full rounded px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-2"
          >
            Export as JSON
          </button>
        </div>
      )}
    </div>
  );
}
