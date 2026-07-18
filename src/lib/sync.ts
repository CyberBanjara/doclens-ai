import { fetchSupabaseExtraction, saveSupabaseExtraction } from "./supabase";
import { getDoc, updateDoc, db, pageKey } from "./storage";

export async function syncFromSupabase(docId: string, fileName: string): Promise<boolean> {
  try {
    const res = await fetchSupabaseExtraction({ data: { key: fileName } });
    if (!res || !res.found || !res.record) {
      return false;
    }

    const record = res.record;
    const { text, numPages, usedOcr } = record;

    let pagesData: {
      pageNumber: number;
      text: string;
      columns: number;
      garbageRatio: number;
      ocrRun: boolean;
      pageAi?: any;
    }[] = [];

    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.version === 1 && Array.isArray(parsed.pages)) {
        pagesData = parsed.pages;
      }
    } catch {
      // Not JSON, fallback to plain text
    }

    if (pagesData.length === 0 && numPages > 0) {
      const splitPages = text.split("\n\n");
      for (let i = 0; i < numPages; i++) {
        pagesData.push({
          pageNumber: i + 1,
          text: splitPages[i] || "",
          columns: 1,
          garbageRatio: 0,
          ocrRun: usedOcr,
        });
      }
    }

    if (pagesData.length > 0) {
      const d = await db();
      const PAGES = "pageData";
      
      const tx = d.transaction(PAGES, "readwrite");
      
      // Clear old pages for this docId
      let cur = await tx.store.openCursor(IDBKeyRange.bound(`${docId}:`, `${docId}:\uffff`));
      while (cur) {
        await cur.delete();
        cur = await cur.continue();
      }

      let aiDoneCount = 0;
      for (const p of pagesData) {
        const isDone = p.pageAi?.status === "done";
        if (isDone) aiDoneCount++;

        const rec = {
          key: pageKey(docId, p.pageNumber),
          docId,
          pageNumber: p.pageNumber,
          text: p.text,
          columns: p.columns || 1,
          garbageRatio: p.garbageRatio || 0,
          ocrRun: p.ocrRun || false,
          pageAi: p.pageAi || undefined,
        };
        await tx.store.put(rec);
      }
      await tx.done;

      await updateDoc(docId, {
        pageCount: pagesData.length,
        aiDoneCount,
      });

      return true;
    }
  } catch (e) {
    console.error("Failed to sync from Supabase:", e);
  }
  return false;
}

export async function syncToSupabase(docId: string): Promise<void> {
  try {
    const docRec = await getDoc(docId);
    if (!docRec) return;

    const { getAllPages } = await import("./storage");
    const pages = await getAllPages(docId);
    if (pages.length === 0) return;

    const payload = {
      version: 1,
      pages: pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        columns: p.columns,
        garbageRatio: p.garbageRatio,
        ocrRun: p.ocrRun,
        pageAi: p.pageAi,
      })),
    };

    const serializedText = JSON.stringify(payload);
    const usedOcr = pages.some((p) => p.ocrRun);

    await saveSupabaseExtraction({
      data: {
        key: docRec.fileName,
        size: docRec.fileSize,
        lastModified: new Date(docRec.createdAt).toISOString(),
        numPages: docRec.pageCount || pages.length,
        text: serializedText,
        usedOcr,
      },
    });
  } catch (e) {
    console.error("Failed to sync up to Supabase:", e);
  }
}
