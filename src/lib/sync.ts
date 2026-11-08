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
import {
  isSupportedTranslationLanguage,
  getLanguageSlug,
  getPageAiLanguageSlug,
  isContentScriptMismatch,
} from "./languageTableMap";
import type { PageAi, PageAiLanguageEntry } from "./storage";

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
 * ============================================================================
 * SUPABASE BOOK SNAPSHOT CACHE (request de-duplication)
 * ----------------------------------------------------------------------------
 * Many UI paths (doc mount, language-change events, workspace reconciliation,
 * preference saves, analysis stage 3) call syncFromSupabase for the same
 * document + language within seconds. Previously every call issued its own
 * fetchSupabaseLanguageBook request. Now:
 *  - concurrent calls for the same (doc, language) share ONE in-flight request;
 *  - a successful remote snapshot is reused for SYNC_SNAPSHOT_TTL_MS, so
 *    reopening / navigating between PDFs does not refetch;
 *  - local reconciliation (cheap IndexedDB work) still runs every time so a
 *    language switch is always applied correctly.
 * Pass { force: true } to bypass the snapshot (explicit user refresh).
 * ============================================================================
 */
const SYNC_SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const SYNC_SNAPSHOT_MAX_ENTRIES = 20;

interface RemoteSnapshot {
  fetchedAt: number;
  pages: Map<number, string>;
}

const remoteSnapshots = new Map<string, RemoteSnapshot>();
const remoteFetchInFlight = new Map<string, Promise<RemoteSnapshot | null>>();
/** Latest language requested per doc — stale reconciliations for older languages are dropped. */
const latestRequestedSlug = new Map<string, string>();

/** Whether the current user may write to Supabase (admin / moderator / editor). Set by AuthContext. */
let supabasePushAllowed = false;
export function setSupabasePushAllowed(allowed: boolean): void {
  supabasePushAllowed = allowed;
}

function snapshotKey(docId: string, slug: string): string {
  return `${docId}|${slug}`;
}

/** Drops cached remote snapshots (all, for one doc, or for one doc + language). */
export function invalidateSupabaseSnapshot(docId?: string, language?: string): void {
  if (!docId) {
    remoteSnapshots.clear();
    return;
  }
  if (language) {
    remoteSnapshots.delete(snapshotKey(docId, getLanguageSlug(language)));
    return;
  }
  for (const k of Array.from(remoteSnapshots.keys())) {
    if (k.startsWith(`${docId}|`)) remoteSnapshots.delete(k);
  }
}

function storeSnapshot(key: string, snap: RemoteSnapshot) {
  remoteSnapshots.delete(key);
  remoteSnapshots.set(key, snap);
  while (remoteSnapshots.size > SYNC_SNAPSHOT_MAX_ENTRIES) {
    const oldest = remoteSnapshots.keys().next().value;
    if (oldest === undefined) break;
    remoteSnapshots.delete(oldest);
  }
}

/**
 * Answers a single-page Supabase lookup from the fresh book snapshot when possible.
 * Returns `known: false` when there is no fresh snapshot (caller should query the server).
 */
export function getCachedRemotePage(
  docId: string,
  language: string,
  pageNumber: number,
): { known: boolean; content?: string } {
  const snap = remoteSnapshots.get(snapshotKey(docId, getLanguageSlug(language)));
  if (!snap || Date.now() - snap.fetchedAt >= SYNC_SNAPSHOT_TTL_MS) return { known: false };
  return { known: true, content: snap.pages.get(pageNumber) };
}

/** Records pages known to exist remotely (after a successful push) so they are not re-pushed. */
function noteRemotePages(
  docId: string,
  slug: string,
  pages: Array<{ pageNumber: number; content: string }>,
) {
  const snap = remoteSnapshots.get(snapshotKey(docId, slug));
  if (!snap) return;
  for (const p of pages) snap.pages.set(p.pageNumber, p.content);
}

/**
 * Returns the remote pages for (doc, language) — from the in-memory snapshot when fresh,
 * otherwise via exactly one shared network request. `fresh` tells whether this call
 * performed (or joined) a real network fetch.
 */
async function getRemoteSnapshot(
  docId: string,
  bookId: string,
  language: string,
  force: boolean,
): Promise<{ snapshot: RemoteSnapshot | null; fresh: boolean }> {
  const slug = getLanguageSlug(language);
  const key = snapshotKey(docId, slug);

  const cached = remoteSnapshots.get(key);
  if (!force && cached && Date.now() - cached.fetchedAt < SYNC_SNAPSHOT_TTL_MS) {
    return { snapshot: cached, fresh: false };
  }

  const pending = remoteFetchInFlight.get(key);
  if (pending) {
    return { snapshot: await pending, fresh: true };
  }

  const request = (async (): Promise<RemoteSnapshot | null> => {
    try {
      const res = await fetchSupabaseLanguageBook({ data: { language, bookId, docId } });
      // A failed lookup must not be cached as "no translations exist".
      if (!res || ("error" in res && res.error)) return null;
      const pages = new Map<number, string>();
      if (res.found && res.pages) {
        for (const p of res.pages) {
          const content = p.content?.trim();
          // Defense in depth: never accept content written in another language's script.
          if (p.pageNumber > 0 && content && !isContentScriptMismatch(language, content)) {
            pages.set(p.pageNumber, content);
          }
        }
      }
      const snap: RemoteSnapshot = { fetchedAt: Date.now(), pages };
      storeSnapshot(key, snap);
      return snap;
    } finally {
      remoteFetchInFlight.delete(key);
    }
  })();
  remoteFetchInFlight.set(key, request);
  return { snapshot: await request, fresh: true };
}

/** True when a cached result is a standard (translate / Native) translation eligible for the shared cache. */
function isShareableTranslation(
  ai: PageAi | PageAiLanguageEntry,
  overrides?: PageAi["overrides"],
): boolean {
  if ((ai as PageAi).isCustom) return false;
  if (overrides?.mode && overrides.mode !== "translate") return false;
  if (overrides?.style && overrides.style !== "Native") return false;
  if (!ai.settingsHash) return false; // remote-origin entries are already in Supabase
  const [mode, , style] = ai.settingsHash.split("|");
  return mode === "translate" && style === "Native";
}

/**
 * Synchronizes document translations for the selected language with Supabase.
 *
 * Strictly language-isolated, non-destructive reconciliation:
 * - Every local result is tagged with the language it was produced in.
 * - Results in another language are moved to `pageAi.byLanguage[slug]` (hidden, not deleted)
 *   and restored instantly — without any request — when that language is selected again.
 * - Remote pages for the selected language fill pages that have no result in that language.
 * - A page with no translation in the selected language is shown as missing; another
 *   language's content is NEVER shown or pushed as the selected language.
 * - Local results missing from Supabase are pushed only when their language is known to
 *   match the target table and the user is allowed to write.
 */
export async function syncFromSupabase(
  docId: string,
  fileName: string,
  targetLanguage?: string,
  _resetMissing = false,
  options?: {
    /** Bypass the cached snapshot (explicit user refresh). */
    force?: boolean;
    /** Never hit the network: reconcile against local data and any cached snapshot only. */
    localOnly?: boolean;
  },
): Promise<boolean> {
  const docRec = await getDoc(docId);
  const language = targetLanguage || getOutputLanguage() || docRec?.selectedLanguage || "हिंदी";
  const bookId = docRec?.bookId || fileName || docId;
  const targetSlug = getLanguageSlug(language);
  latestRequestedSlug.set(docId, targetSlug);

  try {
    let remoteTranslationsMap = new Map<number, string>();
    let fetchedFresh = false;
    if (options?.localOnly) {
      const cached = remoteSnapshots.get(snapshotKey(docId, targetSlug));
      if (cached) remoteTranslationsMap = cached.pages;
    } else if (isGlobalSyncEnabled() && isSupportedTranslationLanguage(language)) {
      const { snapshot, fresh } = await getRemoteSnapshot(
        docId,
        bookId,
        language,
        !!options?.force,
      );
      if (snapshot) remoteTranslationsMap = snapshot.pages;
      fetchedFresh = fresh && !!snapshot;
    }

    // The user switched language again while we were fetching — let the newer call win.
    if (latestRequestedSlug.get(docId) !== targetSlug) return false;

    const localPages = await getAllPages(docId);
    const localPagesMap = new Map(localPages.map((p) => [p.pageNumber, p]));

    let updatedAny = false;
    const localPagesToPush: Array<{ pageNumber: number; content: string }> = [];

    await withDocLock(docId, async () => {
      const d = await db();
      const PAGES = "pageData";
      const tx = d.transaction(PAGES, "readwrite");

      // 1. Reconcile existing local pages with the target language
      for (const localPage of localPages) {
        const ai = localPage.pageAi;
        // Pages with an explicit per-page language override follow their own language.
        if (ai?.overrides?.language) continue;

        const remoteContent = remoteTranslationsMap.get(localPage.pageNumber);
        const hasDone = !!(ai?.status === "done" && ai.result?.trim());

        let currentSlug: string | null = null;
        let languageKnown = false;
        if (hasDone) {
          currentSlug = getPageAiLanguageSlug(ai);
          languageKnown = !!currentSlug;
          if (!currentSlug) {
            // Legacy record without language info: only treat it as the target language
            // when its script does not contradict that.
            currentSlug = isContentScriptMismatch(language, ai!.result!) ? "_legacy" : targetSlug;
          }
        }

        const stash: Record<string, PageAiLanguageEntry> = { ...(ai?.byLanguage || {}) };
        if (hasDone && currentSlug && currentSlug !== targetSlug) {
          stash[currentSlug] = {
            result: ai!.result!,
            language: ai!.language || currentSlug,
            settingsHash: ai!.settingsHash,
            contextDelta: ai!.contextDelta,
            updatedAt: ai!.updatedAt,
          };
        }

        let nextAi: PageAi | undefined;

        if (hasDone && currentSlug === targetSlug) {
          // Already showing the target language. Queue for push if Supabase lacks it.
          if (
            !remoteContent &&
            languageKnown &&
            isShareableTranslation(ai!, ai!.overrides) &&
            !isContentScriptMismatch(language, ai!.result!)
          ) {
            localPagesToPush.push({
              pageNumber: localPage.pageNumber,
              content: ai!.result!.trim(),
            });
          }
          continue;
        } else if (stash[targetSlug]?.result) {
          // Restore this language's earlier local result — no network needed.
          const restored = stash[targetSlug];
          delete stash[targetSlug];
          nextAi = {
            pageNumber: localPage.pageNumber,
            status: "done",
            result: restored.result,
            language: restored.language || language,
            settingsHash: restored.settingsHash,
            contextDelta: restored.contextDelta,
            overrides: ai?.overrides,
            updatedAt: Date.now(),
            byLanguage: stash,
          };
          if (!remoteContent && isShareableTranslation(restored, ai?.overrides)) {
            localPagesToPush.push({ pageNumber: localPage.pageNumber, content: restored.result });
          }
        } else if (remoteContent) {
          nextAi = {
            pageNumber: localPage.pageNumber,
            status: "done",
            result: remoteContent,
            language,
            overrides: ai?.overrides,
            updatedAt: Date.now(),
            byLanguage: stash,
          };
        } else if (hasDone) {
          // Only another language's content exists: hide it (kept in byLanguage) → page is missing.
          nextAi = {
            pageNumber: localPage.pageNumber,
            status: "idle",
            overrides: ai?.overrides,
            updatedAt: Date.now(),
            byLanguage: stash,
          };
        }

        if (nextAi) {
          if (Object.keys(nextAi.byLanguage || {}).length === 0) delete nextAi.byLanguage;
          updatedAny = true;
          await tx.store.put({ ...localPage, pageAi: nextAi });
        }
      }

      // 2. Remote pages not present in local IDB: create placeholder entries
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
              language,
              updatedAt: Date.now(),
            },
          });
        }
      }

      await tx.done;
    });

    // Count completed translations currently active in local storage
    const allCurrentPages = await getAllPages(docId);
    const totalDoneCount = allCurrentPages.filter(
      (p) => p.pageAi?.status === "done" && p.pageAi?.result?.trim(),
    ).length;

    await updateDoc(docId, {
      aiDoneCount: totalDoneCount,
      selectedLanguage: language,
      pageCount: Math.max(docRec?.pageCount || 0, remoteTranslationsMap.size, localPages.length),
    });

    // 3. Background push of target-language pages missing in Supabase.
    //    Only after a real fetch (a cached snapshot already triggered its push), only for
    //    privileged users (the server rejects others), and only for this language's table.
    if (
      fetchedFresh &&
      supabasePushAllowed &&
      localPagesToPush.length > 0 &&
      isGlobalSyncEnabled() &&
      isSupportedTranslationLanguage(language)
    ) {
      void batchSaveSupabaseLanguagePages({
        data: { language, bookId, pages: localPagesToPush, docId },
      })
        .then((res) => {
          if (res?.success) noteRemotePages(docId, targetSlug, localPagesToPush);
        })
        .catch((err) => {
          console.warn(
            "Background auto-sync of local translations to Supabase note:",
            err?.message || err,
          );
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
  options?: { localOnly?: boolean },
): Promise<boolean> {
  if (!docId || !targetLanguage) return false;
  clearDocContext(docId);
  const docRec = await getDoc(docId);
  if (!docRec) return false;
  await updateDoc(docId, { selectedLanguage: targetLanguage });
  // Always reconcile locally (hide other-language results, restore stashed ones); only
  // query Supabase when the language has a table and the caller wants a network check.
  return await syncFromSupabase(docId, docRec.fileName, targetLanguage, false, {
    localOnly: !!options?.localOnly || !isSupportedTranslationLanguage(targetLanguage),
  });
}

/**
 * Reconciles ALL documents in the local library with the newly selected language.
 * Immediately resets context memory and switches every document's visible results to the
 * target language using local data only (other-language results are hidden, previously
 * stashed results for the target language are restored). No per-document network requests.
 */
export async function reconcileAllDocsLanguage(targetLanguage: string): Promise<void> {
  if (!targetLanguage) return;
  clearDocContext();

  try {
    const allDocs = await listDocs();
    if (allDocs.length > 0) {
      // Local-only: a language switch must not fan out one Supabase request per library
      // document. The open document performs its single network check via the
      // workspace-reconciled event; other documents check when they are opened.
      await Promise.allSettled(
        allDocs.map((d) => reconcileDocumentLanguage(d.id, targetLanguage, { localOnly: true })),
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
  // Kept for call-site compatibility. Pages are grouped by the language they were actually
  // produced in, never by the currently selected language.
  _targetLanguage?: string,
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

    const targetKey = customKey || docRec.bookId || docRec.fileName;

    // Group shareable translations by the language they were ACTUALLY produced in.
    // The document's currently selected language is never assumed — that assumption is what
    // previously pushed (e.g.) Bengali results into translations_hindi.
    const pagesByLanguage = new Map<string, { pageNumber: number; content: string }[]>();
    const addPage = (lang: string, pageNumber: number, content: string) => {
      if (isContentScriptMismatch(lang, content)) return;
      const slug = getLanguageSlug(lang);
      if (!pagesByLanguage.has(slug)) pagesByLanguage.set(slug, []);
      pagesByLanguage.get(slug)!.push({ pageNumber, content });
    };

    for (const p of pages) {
      const ai = p.pageAi;
      if (!ai) continue;
      if (ai.status === "done" && ai.result?.trim() && isShareableTranslation(ai, ai.overrides)) {
        const lang = ai.overrides?.language || ai.language || getPageAiLanguageSlug(ai);
        if (lang) addPage(lang, p.pageNumber, ai.result.trim());
      }
      // Hidden results for other languages are also known-language and shareable
      for (const entry of Object.values(ai.byLanguage || {})) {
        if (entry.result?.trim() && isShareableTranslation(entry, ai.overrides)) {
          const lang = entry.language || getPageAiLanguageSlug(entry);
          if (lang) addPage(lang, p.pageNumber, entry.result.trim());
        }
      }
    }
    for (const [lang, langPages] of pagesByLanguage.entries()) {
      if (langPages.length > 0) {
        if (!isSupportedTranslationLanguage(lang)) {
          // Language does not have a dedicated table in Supabase. Keep safely local in IndexedDB.
          continue;
        }
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
        noteRemotePages(docId, lang, langPages);
      }
    }
  } catch (e: any) {
    console.error("Failed to sync translations to Supabase:", e);
    throw e;
  }
}
