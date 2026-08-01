import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { estimateTokens } from "@/lib/openrouter";
import { getDocBlob, getPageData, updatePageData, type PageAiSummaryEntry } from "@/lib/storage";
import { checkTextQuality } from "@/lib/textCleaning";
import { HighlightableText } from "./HighlightableText";

export function ExtractedPageRow({
  docId,
  pageNumber,
  summary,
}: {
  docId: string;
  pageNumber: number;
  summary?: PageAiSummaryEntry;
}) {
  const [data, setData] = useState<{ text: string; columns: number } | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getPageData(docId, pageNumber);
      if (cancelled) return;
      setData(p ? { text: p.text, columns: p.columns } : { text: "", columns: 1 });
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, pageNumber, summary]);

  const handleRunOcr = async () => {
    setOcrRunning(true);
    const tid = toast.loading("Loading document and running OCR...");
    try {
      const blob = await getDocBlob(docId);
      if (!blob) {
        toast.error("Document binary not found in storage.", { id: tid });
        return;
      }
      const { ocrPageById } = await import("@/lib/pdfOcr");
      const ocrText = await ocrPageById(blob, pageNumber, data?.columns ?? 1);
      if (!ocrText || ocrText.trim().length === 0) {
        toast.error("OCR completed but extracted no text.", { id: tid });
        return;
      }

      const quality = checkTextQuality(ocrText);
      await updatePageData(docId, pageNumber, {
        text: ocrText,
        garbageRatio: quality.symbolRatio,
        ocrRun: true,
      });

      if (isMountedRef.current) {
        setData({ text: ocrText, columns: data?.columns ?? 1 });
      }
      toast.success("Page text updated successfully using OCR!", { id: tid });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "OCR failed.", { id: tid });
    } finally {
      if (isMountedRef.current) {
        setOcrRunning(false);
      }
    }
  };

  if (data === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-primary border-t-transparent spin-slow" />
        Loading page {pageNumber}…
      </div>
    );
  }

  const quality = checkTextQuality(data.text);
  const showOcrSuggestion = quality.isGarbled || quality.isScanned;

  return (
    <article className="reader-card">
      <header className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Page {pageNumber} — Original Text
        </h3>
        <div className="flex items-center gap-3">
          {data.text && (
            <span className="text-[11px] text-muted-foreground/60">
              {estimateTokens(data.text).toLocaleString()} tokens
            </span>
          )}
          <button
            disabled={ocrRunning}
            onClick={handleRunOcr}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50 cursor-pointer"
          >
            {ocrRunning ? "Running OCR…" : "Run OCR"}
          </button>
        </div>
      </header>

      {showOcrSuggestion && (
        <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-[13px] leading-relaxed text-foreground/95 backdrop-blur-md">
          <div className="flex items-start gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
              !
            </span>
            <div className="flex-1">
              <p className="font-semibold text-primary">
                {quality.isGarbled
                  ? "Garbled character symbols detected"
                  : "Minimal extractable text found"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {quality.isGarbled
                  ? "This page seems to contain corrupted fonts or symbols instead of standard characters. Run OCR to convert the visual layout to clean, readable text."
                  : "This page might be scanned or contain only images. Run OCR to extract text from the page."}
              </p>
              <button
                disabled={ocrRunning}
                onClick={handleRunOcr}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground shadow-md transition-all hover:bg-primary/90 disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {ocrRunning ? (
                  <>
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-primary-foreground border-t-transparent spin-slow" />
                    Running OCR…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1 inline" />
                    Fix page with OCR
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="reader-text">
        {data.text ? (
          <HighlightableText text={data.text} source="original" pageNumber={pageNumber} />
        ) : (
          <p className="italic text-muted-foreground">No extractable text on this page.</p>
        )}
      </div>
    </article>
  );
}
