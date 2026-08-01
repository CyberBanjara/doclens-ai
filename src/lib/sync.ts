import { createServerFn } from "@tanstack/react-start";
import { fetchSupabaseExtraction, saveSupabaseExtraction } from "./supabase";
import { getDoc, updateDoc, db, pageKey, getAllPages, withDocLock } from "./storage";
import { isGlobalSyncEnabled } from "./env";

export const getSyncConfig = createServerFn({ method: "GET" })
  .handler(async () => {
    "use server";
    return {
      enabled: isGlobalSyncEnabled(),
    };
  });

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
      if (parsed && typeof parsed === "object") {
        if (parsed.translationConfig) {
          const { applyTranslationConfig } = await import("./openrouter");
          applyTranslationConfig(parsed.translationConfig, docId);
        }
        if (parsed.version === 1 && Array.isArray(parsed.pages)) {
          pagesData = parsed.pages;
        }
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
      const localPages = await getAllPages(docId);
      const localPagesMap = new Map(localPages.map((p) => [p.pageNumber, p]));

      let updatedAny = false;
      let aiDoneCount = 0;

      // Writes go through the same withDocLock mutex every other writer (translation
      // streaming via upsertPageAi, writePages, updateDoc) uses, so a background sync
      // can't race an in-flight write to the same document's page records.
      await withDocLock(docId, async () => {
        const d = await db();
        const PAGES = "pageData";
        const tx = d.transaction(PAGES, "readwrite");

        for (const p of pagesData) {
          const isDone = p.pageAi?.status === "done";
          if (isDone) aiDoneCount++;

          const localPage = localPagesMap.get(p.pageNumber);

          let shouldUpdate = false;
          if (!localPage) {
            shouldUpdate = true;
          } else {
            // Check if text or OCR status is different
            if (localPage.text !== p.text ||
                localPage.columns !== (p.columns || 1) ||
                localPage.garbageRatio !== (p.garbageRatio || 0) ||
                localPage.ocrRun !== (p.ocrRun || false)) {
              shouldUpdate = true;
            }
            // Check if AI status / result is updated
            const localAi = localPage.pageAi;
            const remoteAi = p.pageAi;
            if (remoteAi) {
              if (!localAi) {
                shouldUpdate = true;
              } else if (remoteAi.status === "done" && localAi.status !== "done") {
                shouldUpdate = true;
              } else if (remoteAi.status === "done" && localAi.status === "done") {
                if ((remoteAi.updatedAt || 0) > (localAi.updatedAt || 0) || remoteAi.result !== localAi.result) {
                  shouldUpdate = true;
                }
              } else if (remoteAi.status !== localAi.status || remoteAi.result !== localAi.result) {
                shouldUpdate = true;
              }
            }
          }

          if (shouldUpdate) {
            updatedAny = true;
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
        }
        await tx.done;
      });

      // A separate (non-nested) lock acquisition — updateDoc acquires withDocLock
      // itself, so it must run after the block above releases it.
      await updateDoc(docId, {
        pageCount: pagesData.length,
        aiDoneCount,
      });

      return updatedAny;
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

    const pages = await getAllPages(docId);
    if (pages.length === 0) return;

    const { getTranslationConfig } = await import("./openrouter");
    const translationConfig = getTranslationConfig();

    const payload = {
      version: 1,
      translationConfig,
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
        translationConfig,
      },
    });
  } catch (e) {
    console.error("Failed to sync up to Supabase:", e);
  }
}
