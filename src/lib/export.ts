import { toast } from "sonner";
import { estimateTokens } from "@/lib/openrouter";
import { getAllPages } from "@/lib/storage";

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportAsMarkdown(docId: string) {
  const pages = await getAllPages(docId);
  const lines: string[] = [
    "# Anuwad — Export",
    "",
    `> Exported at ${new Date().toISOString()}`,
    "",
  ];
  for (const page of pages) {
    lines.push(`## Page ${page.pageNumber}`, "");
    lines.push("### Extracted Text", "");
    lines.push(page.text || "*(no extractable text)*", "");
    if (page.pageAi?.status === "done" && page.pageAi.result) {
      lines.push("### AI Result", "");
      lines.push(page.pageAi.result, "");
    }
    lines.push("---", "");
  }
  downloadBlob(lines.join("\n"), "doclens-export.md", "text/markdown;charset=utf-8");
  toast.success("Exported as Markdown.");
}

export async function exportAsJson(docId: string) {
  const pages = await getAllPages(docId);
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
    JSON.stringify({ exportedAt: new Date().toISOString(), pages: data }, null, 2),
    "doclens-export.json",
    "application/json;charset=utf-8",
  );
  toast.success("Exported as JSON.");
}
