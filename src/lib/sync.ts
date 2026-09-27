import { createServerFn } from "@tanstack/react-start";
import { fetchSupabaseLanguageBook, batchSaveSupabaseLanguagePages } from "./supabase";
import {
  getDoc,
  updateDoc,
  db,
  pageKey,
  pageRange,
  getAllPages,
  withDocLock,
  listDocs,
} from "./storage";
import { isGlobalSyncEnabled } from "./env";
import { getOutputLanguage } from "./openrouter";
import { clearDocContext } from "./contextStore";

export const getSyncConfig = createServerFn({ method: "GET" }).handler(async () => {
  "use server";
  return {
    enabled: isGlobalSyncEnabled(),
  };
});

/**
 * Purges all local language-specific translations and context for a document.
 * Guarantees a fresh, blank slate for the newly active language.
 */
export async function purgeDocLanguageTranslations(
  docId: string,
  language: string,
): Promise<boolean> {
  clearDocContext(docId);
  let resetAny = false;
  await withDocLock(docId, async () => {
    const d = await db();
    const PAGES = "pageData";
    const tx = d.transaction(PAGES, "readwrite");
    let cur = await tx.store.openCursor(pageRange(docId));
    while (cur) {
      const val = cur.value;
      if (val.pageAi) {
        resetAny = true;
        delete val.pageAi;
        await cur.update(val);
      }
      cur = await cur.continue();
    }
    await tx.done;
  });
  await updateDoc(docId, {
    aiDoneCount: 0,
    selectedLanguage: language,
    aiResults: [],
  });
  return resetAny;
}

/**
 * Synchronizes document translations for the selected language with Supabase.
 * Non-destructive Union Sync:
 * - Pulls any remote translations from Supabase and populates missing local pages.
 * - PRESERVES all existing local translations (never purges or overwrites local translations).
 * - Automatically pushes any local translations missing in Supabase to Supabase in the background.
 */
export async function syncFromSupabase(
  docId: string,
  fileName: string,
  targetLanguage?: string,
  _resetMissing = false,
): Promise<boolean> {
  const docRec = await getDoc(docId);
  const language = targetLanguage || getOutputLanguage() || docRec?.selectedLanguage || "हिंदी";
  const bookId = docRec?.bookId || fileName || docId;

  if (!isGlobalSyncEnabled()) {
    return false;
  }

  try {
    const res = await fetchSupabaseLanguageBook({
      data: {
        language,
        bookId,
        docId,
      },
    });

    const remoteTranslationsMap = new Map<number, string>();
    if (res && res.found && res.pages && res.pages.length > 0) {
      for (const p of res.pages) {
        if (p.pageNumber > 0 && p.content?.trim()) {
          remoteTranslationsMap.set(p.pageNumber, p.content.trim());
        }
      }
    }

    const localPages = await getAllPages(docId);
    const localPagesMap = new Map(localPages.map((p) => [p.pageNumber, p]));

    let updatedAny = false;
    const localPagesToPush: Array<{ pageNumber: number; content: string }> = [];

    await withDocLock(docId, async () => {
      const d = await db();
      const PAGES = "pageData";
      const tx = d.transaction(PAGES, "readwrite");

      // 1. Process existing local pages
      for (const localPage of localPages) {
        const remoteContent = remoteTranslationsMap.get(localPage.pageNumber);
        const hasLocalResult = !!(
          localPage.pageAi?.status === "done" && localPage.pageAi?.result?.trim()
        );

        if (remoteContent) {
          // If remote has content and local does not have it, fill it into local IDB
          if (!hasLocalResult) {
            updatedAny = true;
            await tx.store.put({
              ...localPage,
              pageAi: {
                pageNumber: localPage.pageNumber,
                status: "done" as const,
                result: remoteContent,
                updatedAt: Date.now(),
              },
            });
          }
        } else if (hasLocalResult) {
          // Local has translation, but Supabase doesn't have it yet!
          // NEVER purge! Keep it intact locally and queue for background push to Supabase
          localPagesToPush.push({
            pageNumber: localPage.pageNumber,
            content: localPage.pageAi!.result!.trim(),
          });
        }
      }

      // 2. If remote has translated pages not present in local IDB pages, create placeholder entries
      for (const [pageNum, content] of remoteTranslationsMap.entries()) {
        if (!localPagesMap.has(pageNum)) {
          updatedAny = true;
          await tx.store.put({
            key: pageKey(docId, pageNum),
            docId,
            pageNumber: pageNum,
            text: "",
            columns: 1,
            garbageRatio: 0,
            ocrRun: false,
            pageAi: {
              pageNumber: pageNum,
              status: "done" as const,
              result: content,
              updatedAt: Date.now(),
            },
          });
        }
      }

      await tx.done;
    });

    // Count union of all completed translations currently in local storage
    const allCurrentPages = await getAllPages(docId);
    const totalDoneCount = allCurrentPages.filter(
      (p) => p.pageAi?.status === "done" && p.pageAi?.result?.trim(),
    ).length;

    await updateDoc(docId, {
      aiDoneCount: totalDoneCount,
      selectedLanguage: language,
      pageCount: Math.max(docRec?.pageCount || 0, res?.pages?.length || 0, localPages.length),
    });

    // 3. Automatic Background Push to Supabase for local pages missing in Supabase
    if (localPagesToPush.length > 0 && isGlobalSyncEnabled()) {
      void syncToSupabase(docId, bookId, language).catch((err) => {
        console.warn("Background auto-sync of local translations to Supabase note:", err?.message || err);
      });
    }

    return updatedAny;
  } catch (e) {
    console.error("Failed to sync from Supabase dedicated language table:", e);
  }
  return false;
}

/**
 * Reconciles a single document's state and pages with the target language.
 * Merges Supabase translations with local translations non-destructively.
 */
export async function reconcileDocumentLanguage(
  docId: string,
  targetLanguage: string,
): Promise<boolean> {
  if (!docId || !targetLanguage) return false;
  clearDocContext(docId);
  const docRec = await getDoc(docId);
  if (!docRec) return false;
  await updateDoc(docId, { selectedLanguage: targetLanguage });
  return await syncFromSupabase(docId, docRec.fileName, targetLanguage, false);
}

/**
 * Reconciles ALL documents in the local library with the newly selected language.
 * Immediately resets context memory and checks Supabase for each document.
 * If translations in targetLanguage exist, they are populated; otherwise, existing language
 * data is purged to guarantee the selected language is the single source of truth.
 */
export async function reconcileAllDocsLanguage(targetLanguage: string): Promise<void> {
  if (!targetLanguage) return;
  clearDocContext();

  try {
    const allDocs = await listDocs();
    if (allDocs.length > 0) {
      await Promise.allSettled(allDocs.map((d) => reconcileDocumentLanguage(d.id, targetLanguage)));
    }
  } catch (err) {
    console.error("Failed to reconcile all docs language:", err);
  } finally {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("doclens:docs-reconciled", { detail: { language: targetLanguage } }),
      );
      window.dispatchEvent(
        new CustomEvent("doclens:workspace-reconciled", { detail: targetLanguage }),
      );
      window.dispatchEvent(
        new CustomEvent("doclens:library-changed", { detail: { language: targetLanguage } }),
      );
    }
  }
}

/**
 * Synchronizes completed translations for the current language to its dedicated Supabase table.
 * Strictly language-isolated: Saves ONLY to `translations_<slug>` and updates `book_languages.pages`.
 */
export async function syncToSupabase(
  docId: string,
  customKey?: string,
  targetLanguage?: string,
): Promise<void> {
  if (!isGlobalSyncEnabled()) return;
  try {
    const docRec = await getDoc(docId);
    if (!docRec) {
      throw new Error(`Document "${docId}" not found in local storage.`);
    }

    const pages = await getAllPages(docId);
    if (pages.length === 0) {
      return;
    }

    // Explicit priority: targetLanguage -> docRec.selectedLanguage -> openrouter outputLanguage -> "हिंदी"
    const defaultLanguage =
      targetLanguage || docRec.selectedLanguage || getOutputLanguage() || "हिंदी";
    const targetKey = customKey || docRec.bookId || docRec.fileName;

    // Group completed standard translation pages by their effective language (respecting per-page language overrides)
    const pagesByLanguage = new Map<string, { pageNumber: number; content: string }[]>();

    for (const p of pages) {
      if (p.pageAi?.status === "done" && p.pageAi.result && p.pageAi.result.trim()) {
        // Skip pages that are non-standard translations (e.g. explain mode or custom styles)
        if (p.pageAi.overrides?.mode && p.pageAi.overrides.mode !== "translate") continue;
        if (p.pageAi.overrides?.style && p.pageAi.overrides.style !== "Native") continue;

        const pageLang = p.pageAi.overrides?.language || defaultLanguage;
        if (!pagesByLanguage.has(pageLang)) {
          pagesByLanguage.set(pageLang, []);
        }
        pagesByLanguage.get(pageLang)!.push({
          pageNumber: p.pageNumber,
          content: p.pageAi.result.trim(),
        });
      }
    }

    for (const [lang, langPages] of pagesByLanguage.entries()) {
      if (langPages.length > 0) {
        const res = await batchSaveSupabaseLanguagePages({
          data: {
            language: lang,
            bookId: targetKey,
            pages: langPages,
            docId,
          },
        });

        if (!res || !res.success) {
          throw new Error(res?.error || `Failed to sync ${lang} pages to Supabase.`);
        }
      }
    }
  } catch (e: any) {
    console.error("Failed to sync translations to Supabase:", e);
    throw e;
  }
}
