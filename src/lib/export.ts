import { toast } from "sonner";
import { estimateTokens, getStoredLanguage, getOutputLanguage } from "@/lib/openrouter";
import { getAllPages, getDoc } from "@/lib/storage";

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Lazy loads the PDF renderer module on-demand when the user triggers export.
 */
export async function exportAsPdf(docId: string): Promise<void> {
  const { exportAsPdf: generatePdf } = await import("./pdfExport");
  return generatePdf(docId);
}

/**
 * Exports translated content only in the active language as a Markdown document.
 */
export async function exportAsMarkdown(docId: string) {
  const doc = await getDoc(docId);
  const pages = await getAllPages(docId);
  const activeLanguage = getStoredLanguage() || getOutputLanguage() || "translated";

  const translatedPages = pages
    .map((page) => ({
      pageNumber: page.pageNumber,
      text: page.pageAi?.status === "done" && page.pageAi.result?.trim() ? page.pageAi.result.trim() : "",
    }))
    .filter((p) => p.text.length > 0);

  if (translatedPages.length === 0) {
    toast.error("No translated content found to export. Please translate pages first.");
    return;
  }

  const lines: string[] = [];
  const baseTitle = doc?.fileName?.replace(/\.[^/.]+$/, "") || "document";

  if (translatedPages.length === 1) {
    lines.push(translatedPages[0].text);
  } else {
    for (let i = 0; i < translatedPages.length; i++) {
      const page = translatedPages[i];
      if (i > 0) {
        lines.push("\n---\n");
      }
      lines.push(`## Page ${page.pageNumber}\n`);
      lines.push(page.text);
    }
  }

  const filename = `${baseTitle}-${activeLanguage ? activeLanguage.toLowerCase().replace(/\s+/g, "_") : "translated"}.md`;
  downloadBlob(lines.join("\n"), filename, "text/markdown;charset=utf-8");
  toast.success("Exported as Markdown.");
}

export async function exportAsJson(docId: string) {
  const doc = await getDoc(docId);
  const pages = await getAllPages(docId);
  const baseTitle = doc?.fileName?.replace(/\.[^/.]+$/, "") || "document";
  const data = pages.map((page) => ({
    pageNumber: page.pageNumber,
    columns: page.columns,
    tokenEstimate: estimateTokens(page.text),
    extractedText: page.text,
    ai:
      page.pageAi?.status === "done" && page.pageAi.result
        ? {
            status: page.pageAi.status,
            result: page.pageAi.result,
            settingsHash: page.pageAi.settingsHash,
            updatedAt: page.pageAi.updatedAt,
          }
        : null,
  }));
  downloadBlob(
    JSON.stringify({ documentId: docId, exportedAt: new Date().toISOString(), pages: data }, null, 2),
    `${baseTitle}-export.json`,
    "application/json;charset=utf-8",
  );
  toast.success("Exported as JSON.");
}
