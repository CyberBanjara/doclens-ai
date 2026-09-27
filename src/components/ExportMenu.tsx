import { useState } from "react";
import { Download, FileDown, FileText, Code, Loader2 } from "lucide-react";
import { exportAsPdf, exportAsMarkdown, exportAsJson } from "@/lib/export";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Desktop tab-bar export dropdown (PDF / Markdown / JSON) for the active document.
 * Uses a portaled Popover so the dropdown floats cleanly above the workstation/viewer
 * without clipping or stacking context issues.
 */
export function ExportMenu({ docId }: { docId: string }) {
  const [open, setOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      await exportAsPdf(docId);
      setOpen(false);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          title="Export Document"
          aria-label="Export Document"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="z-50 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-2xl backdrop-blur-md"
      >
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          Export Document
        </div>
        <div className="flex flex-col gap-0.5">
          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-surface-2 hover:text-primary disabled:opacity-50"
          >
            {isExportingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <FileDown className="h-4 w-4 text-primary" />
            )}
            <div>
              <div className="font-semibold">{isExportingPdf ? "Generating PDF…" : "Export as PDF"}</div>
              <div className="text-[10px] text-muted-foreground">Formatted with Anuwad branding</div>
            </div>
          </button>

          <button
            onClick={() => {
              void exportAsMarkdown(docId);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">Export as Markdown</div>
              <div className="text-[10px] text-muted-foreground">Clean translated text (.md)</div>
            </div>
          </button>

          <button
            onClick={() => {
              void exportAsJson(docId);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            <Code className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">Export as JSON</div>
              <div className="text-[10px] text-muted-foreground">Structured pages & metadata</div>
            </div>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
