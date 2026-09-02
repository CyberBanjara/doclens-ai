import { createServerFn } from "@tanstack/react-start";
import { fetchSupabaseLanguageBook, batchSaveSupabaseLanguagePages } from "./supabase";
import { getDoc, updateDoc, db, pageKey, getAllPages, withDocLock } from "./storage";
import { isGlobalSyncEnabled } from "./env";
import { getOutputLanguage } from "./openrouter";

export const getSyncConfig = createServerFn({ method: "GET" }).handler(async () => {
  "use server";
  return {
    enabled: isGlobalSyncEnabled(),
  };
});

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
  if (!isGlobalSyncEnabled()) return false;
  try {
    const docRec = await getDoc(docId);
    const language = targetLanguage || docRec?.selectedLanguage || getOutputLanguage() || "हिंदी";
    const bookId = docRec?.bookId || fileName || docId;

    const res = await fetchSupabaseLanguageBook({
      data: {
        language,
        bookId,
        docId,
      },
    });

    if (!res || !res.found || !res.pages || res.pages.length === 0) {
      if (resetMissing) {
        // User switched language to a language with no translations yet: clear previous language translations
        let resetAny = false;
        await withDocLock(docId, async () => {
          const d = await db();
          const PAGES = "pageData";
          const tx = d.transaction(PAGES, "readwrite");
          const localPages = await getAllPages(docId);
          for (const lp of localPages) {
            if (lp.pageAi) {
              resetAny = true;
              await tx.store.put({ ...lp, pageAi: undefined });
            }
          }
          await tx.done;
        });
        await updateDoc(docId, {
          aiDoneCount: 0,
          selectedLanguage: language,
        });
        return resetAny;
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
          await tx.store.put({
            ...localPage,
            pageAi: undefined,
          });
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
  }
  return false;
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
