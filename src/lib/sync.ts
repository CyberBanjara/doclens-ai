import { createServerFn } from "@tanstack/react-start";
import { fetchSupabaseExtraction, saveSupabaseExtraction } from "./supabase";
import { getDoc, updateDoc, db, pageKey, getAllPages, withDocLock, type PageAi } from "./storage";
import { isGlobalSyncEnabled } from "./env";

export const getSyncConfig = createServerFn({ method: "GET" }).handler(async () => {
  "use server";
  return {
    enabled: isGlobalSyncEnabled(),
  };
});

export async function syncFromSupabase(docId: string, fileName: string): Promise<boolean> {
  if (!isGlobalSyncEnabled()) return false;
  try {
    const res = await fetchSupabaseExtraction({ data: { key: fileName } });
    if (!res || !res.found || !res.record) {
      return false;
    }

    const record = res.record;
    const { text } = record;

    let pagesData: {
      pageNumber: number;
      pageAi?: PageAi;
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
      // Not JSON or legacy format - ignore
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
          const remoteAi = p.pageAi;

          let shouldUpdate = false;
          if (!localPage) {
            if (remoteAi) {
              shouldUpdate = true;
            }
          } else {
            // Check if AI status / result is updated. We NEVER overwrite localPage.text from Supabase.
            const localAi = localPage.pageAi;
            if (remoteAi) {
              if (!localAi) {
                shouldUpdate = true;
              } else if (remoteAi.status === "done" && localAi.status !== "done") {
                shouldUpdate = true;
              } else if (remoteAi.status === "done" && localAi.status === "done") {
                if (
                  (remoteAi.updatedAt || 0) > (localAi.updatedAt || 0) ||
                  remoteAi.result !== localAi.result
                ) {
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
              text: localPage?.text || "",
              columns: localPage?.columns || 1,
              garbageRatio: localPage?.garbageRatio || 0,
              ocrRun: localPage?.ocrRun || false,
              pageAi: remoteAi || undefined,
            };
            await tx.store.put(rec);
          }
        }
        await tx.done;
      });

      // Maintain aiDoneCount on the doc. Do NOT update pageCount here so local extraction state is preserved.
      await updateDoc(docId, {
        aiDoneCount,
      });

      return updatedAny;
    }
  } catch (e) {
    console.error("Failed to sync from Supabase:", e);
  }
  return false;
}

export async function syncToSupabase(docId: string, customKey?: string): Promise<void> {
  if (!isGlobalSyncEnabled()) return;
  try {
    const docRec = await getDoc(docId);
    if (!docRec) {
      throw new Error(`Document "${docId}" not found in local storage.`);
    }

    const pages = await getAllPages(docId);
    if (pages.length === 0) {
      throw new Error("No page extractions found. Please click 'Analyze Document' first.");
    }

    const { getTranslationConfig } = await import("./openrouter");
    const translationConfig = getTranslationConfig();

    // Supabase stores ONLY page-number-wise translated text and translation config/settings.
    // It NEVER stores extracted/original text.
    const payload = {
      version: 1,
      translationConfig,
      pages: pages.map((p) => ({
        pageNumber: p.pageNumber,
        pageAi: p.pageAi,
      })),
    };

    const serializedText = JSON.stringify(payload);
    const targetKey = customKey || docRec.fileName;
    const nowIso = new Date().toISOString();

    const res = await saveSupabaseExtraction({
      data: {
        key: targetKey,
        size: docRec.fileSize,
        lastModified: nowIso,
        numPages: docRec.pageCount || pages.length,
        text: serializedText,
        usedOcr: false,
        translationConfig,
      },
    });

    if (!res || !res.success) {
      const errMsg = res?.error || "Failed to sync extraction to Supabase.";
      console.error("Supabase sync error:", errMsg);
      throw new Error(errMsg);
    }

    // If customKey has folder prefix, also mirror under base filename for seamless lookup
    if (customKey && customKey !== docRec.fileName) {
      await saveSupabaseExtraction({
        data: {
          key: docRec.fileName,
          size: docRec.fileSize,
          lastModified: nowIso,
          numPages: docRec.pageCount || pages.length,
          text: serializedText,
          usedOcr: false,
          translationConfig,
        },
      }).catch((err) => console.warn("Mirror sync note:", err?.message || err));
    }
  } catch (e: any) {
    console.error("Failed to sync up to Supabase:", e);
    throw e;
  }
}
