import { useEffect, useRef, useState } from "react";
import { loadPdfDocument } from "@/lib/pdf";

export function PdfViewer({ data }: { data: ArrayBuffer | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setRendering(true);
    (async () => {
      const pdf = await loadPdfDocument(data);
      if (cancelled || !containerRef.current) return;
      setPageCount(pdf.numPages);
      containerRef.current.innerHTML = "";
      const dpr = window.devicePixelRatio || 1;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.3 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.className =
          "rounded-md shadow-2xl shadow-black/40 ring-1 ring-border bg-white";
        ctx.scale(dpr, dpr);

        const wrapper = document.createElement("div");
        wrapper.className = "flex flex-col items-center gap-2";
        const label = document.createElement("div");
        label.className =
          "font-mono text-[11px] text-muted-foreground tracking-wider uppercase";
        label.textContent = `Page ${i} / ${pdf.numPages}`;
        wrapper.appendChild(label);
        wrapper.appendChild(canvas);
        containerRef.current?.appendChild(wrapper);
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (cancelled) return;
      }
      setRendering(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="font-mono text-xs uppercase tracking-widest">
            no document loaded
          </div>
          <div className="mt-2 text-sm">Upload a PDF to begin</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-auto bg-grid p-6">
      <div ref={containerRef} className="flex flex-col items-center gap-6" />
      {rendering && pageCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
          rendering…
        </div>
      )}
    </div>
  );
}
