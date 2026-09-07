import { createServerFn } from "@tanstack/react-start";
import { fetchSupabaseLanguageBook, batchSaveSupabaseLanguagePages } from "./supabase";
import { getDoc, updateDoc, db, pageKey, pageRange, getAllPages, withDocLock, listDocs } from "./storage";
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
 * Synchronizes document translations for the selected language from Supabase.
 * Queries the selected language's dedicated table (e.g. `translations_telugu`, `translations_hindi`)
 * using `book_id + page_number`.
 * For the selected language, only its translations are populated; other pages remain blank.
 */
export async function syncFromSupabase(
  docId: string,
  fileName: string,
  targetLanguage?: string,
  resetMissing = false,
): Promise<boolean> {
  const docRec = await getDoc(docId);
  const language = targetLanguage || getOutputLanguage() || docRec?.selectedLanguage || "हिंदी";
  const bookId = docRec?.bookId || fileName || docId;

  if (!isGlobalSyncEnabled()) {
    if (resetMissing) {
      return await purgeDocLanguageTranslations(docId, language);
    }
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

    if (!res || !res.found || !res.pages || res.pages.length === 0) {
      if (resetMissing) {
        return await purgeDocLanguageTranslations(docId, language);
      }
      return false;
    }

    const { pages } = res;
    const remoteTranslationsMap = new Map<number, string>();
    for (const p of pages) {
      if (p.pageNumber > 0 && p.content?.trim()) {
        remoteTranslationsMap.set(p.pageNumber, p.content.trim());
      }
    }

    const localPages = await getAllPages(docId);
    const localPagesMap = new Map(localPages.map((p) => [p.pageNumber, p]));

    let updatedAny = false;

    await withDocLock(docId, async () => {
      const d = await db();
      const PAGES = "pageData";
      const tx = d.transaction(PAGES, "readwrite");

      // Update existing local pages
      for (const localPage of localPages) {
        const translatedContent = remoteTranslationsMap.get(localPage.pageNumber);
        if (translatedContent) {
          if (
            localPage.pageAi?.result !== translatedContent ||
            localPage.pageAi?.status !== "done"
          ) {
            updatedAny = true;
            await tx.store.put({
              ...localPage,
              pageAi: {
                pageNumber: localPage.pageNumber,
                status: "done" as const,
                result: translatedContent,
                updatedAt: Date.now(),
              },
            });
          }
        } else if (resetMissing && localPage.pageAi !== undefined) {
          // If switching language, reset local translation for pages without translation in this language
          updatedAny = true;
          const cleanPage = { ...localPage };
          delete cleanPage.pageAi;
          await tx.store.put(cleanPage);
        }
      }

      // If remote has translated pages not in local IDB pages, create placeholder page entries
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

    await updateDoc(docId, {
      aiDoneCount: remoteTranslationsMap.size,
      selectedLanguage: language,
      pageCount: Math.max(docRec?.pageCount || 0, pages.length, localPages.length),
    });

    return updatedAny;
  } catch (e) {
    console.error("Failed to sync from Supabase dedicated language table:", e);
    if (resetMissing) {
      return await purgeDocLanguageTranslations(docId, language);
    }
  }
  return false;
}

/**
 * Reconciles a single document's state and pages with the target language.
 * Checks Supabase for the selected language version:
 * - If found: keeps/fetches it into local storage.
 * - If not found: cleans and removes old language-specific data, presenting a clean blank state.
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
  return await syncFromSupabase(docId, docRec.fileName, targetLanguage, true);
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
      await Promise.allSettled(
        allDocs.map((d) => reconcileDocumentLanguage(d.id, targetLanguage)),
      );
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
