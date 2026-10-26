import { db, safePut, META } from "./idbUtils";
import {
  apiGetTranslationActivity,
  type UserActivityData,
  type UserActivityHeatmapItem,
} from "@/lib/auth-client";
import { dispatchDocEvent } from "@/lib/docEvents";

export type { UserActivityData, UserActivityHeatmapItem };

export interface CachedTranslationActivityRecord {
  userId: string;
  data: UserActivityData;
  cachedAt: number;
}

const getActivityKey = (uid: string) => `translation_activity:${uid}`;
const getActivityAtKey = (uid: string) => `translation_activity_at:${uid}`;

// In-memory cache for fast synchronous access and memory-first lookups
const inMemoryActivity = new Map<string, UserActivityData>();
const inFlightRequests = new Map<string, Promise<UserActivityData | null>>();

/**
 * Returns cached translation activity synchronously from in-memory cache if available.
 */
export function getCachedTranslationActivitySync(userId: string): UserActivityData | null {
  if (!userId) return null;
  return inMemoryActivity.get(userId) || null;
}

/**
 * Fetch and return translation activity for the user.
 * By default, checks in-memory cache and IndexedDB META store first.
 * If cached data exists and forceRefresh is false, returns cached data immediately
 * without making any network call to Supabase.
 * If forceRefresh is true or cache is missing, fetches from Supabase and persists to IndexedDB.
 */
export async function getCachedTranslationActivity(
  userId: string,
  options?: { forceRefresh?: boolean; days?: number },
): Promise<UserActivityData | null> {
  if (!userId || typeof userId !== "string") return null;

  const forceRefresh = options?.forceRefresh ?? false;
  const days = options?.days ?? 365;

  // 1. Check in-memory cache if not force refreshing
  if (!forceRefresh) {
    const memory = inMemoryActivity.get(userId);
    if (memory && typeof memory.total_pages === "number") {
      return memory;
    }
  }

  // 2. Check persistent IndexedDB META store before making any network call
  if (!forceRefresh) {
    try {
      const d = await db();
      const stored = (await d.get(META, getActivityKey(userId))) as UserActivityData | undefined;
      if (stored && typeof stored.total_pages === "number" && stored.daily_activity) {
        inMemoryActivity.set(userId, stored);
        return stored;
      }
    } catch (e) {
      console.warn("Failed reading translation activity from IndexedDB:", e);
    }
  }

  // 3. Deduplicate concurrent in-flight network requests for the same user
  if (!forceRefresh && inFlightRequests.has(userId)) {
    return inFlightRequests.get(userId)!;
  }

  // 4. Fetch from Supabase
  const request = (async () => {
    try {
      const remoteData = await apiGetTranslationActivity(days);
      if (remoteData && typeof remoteData.total_pages === "number") {
        inMemoryActivity.set(userId, remoteData);
        try {
          const d = await db();
          await safePut(d, META, remoteData, getActivityKey(userId));
          await safePut(d, META, Date.now(), getActivityAtKey(userId));
        } catch (dbErr) {
          console.warn("Failed persisting translation activity to IndexedDB:", dbErr);
        }
        dispatchDocEvent("doclens:translation-activity-updated", {
          userId,
          data: remoteData,
        });
        return remoteData;
      }
      return null;
    } catch (err) {
      console.warn("Failed fetching translation activity from Supabase:", err);
      return inMemoryActivity.get(userId) || null;
    } finally {
      inFlightRequests.delete(userId);
    }
  })();

  inFlightRequests.set(userId, request);
  return request;
}

/**
 * Immediately fetches the user's translation activity data from Supabase upon login
 * and saves it locally in IndexedDB.
 */
export async function fetchAndCacheUserTranslationActivity(
  userId: string,
  days = 365,
): Promise<UserActivityData | null> {
  if (!userId) return null;
  return getCachedTranslationActivity(userId, { forceRefresh: true, days });
}

/**
 * Atomically updates the local IndexedDB cached translation activity
 * when a new translation completes, avoiding unnecessary Supabase refetches.
 */
export async function recordLocalTranslationActivity(params: {
  userId: string;
  bookTitle: string;
  pageNumber: number;
  language?: string;
}): Promise<void> {
  const { userId, bookTitle, pageNumber, language } = params;
  if (!userId) return;

  try {
    let currentData = inMemoryActivity.get(userId);
    if (!currentData) {
      const d = await db();
      const stored = (await d.get(META, getActivityKey(userId))) as UserActivityData | undefined;
      if (stored) {
        currentData = stored;
      }
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const cleanTitle = (bookTitle && bookTitle.trim()) || "Untitled Document";

    if (!currentData) {
      currentData = {
        total_pages: 1,
        active_days: 1,
        daily_activity: {
          [todayStr]: {
            date: todayStr,
            count: 1,
            books: { [cleanTitle]: 1 },
          },
        },
        recent_activities: [
          {
            bookTitle: cleanTitle,
            pageNumber,
            language: language || "default",
            translatedAt: new Date().toISOString(),
          },
        ],
      };
    } else {
      const daily = { ...(currentData.daily_activity || {}) };
      let activeDays = currentData.active_days || 0;

      if (!daily[todayStr]) {
        daily[todayStr] = {
          date: todayStr,
          count: 1,
          books: { [cleanTitle]: 1 },
        };
        activeDays += 1;
      } else {
        const item = { ...daily[todayStr] };
        item.count = (item.count || 0) + 1;
        item.books = {
          ...(item.books || {}),
          [cleanTitle]: ((item.books && item.books[cleanTitle]) || 0) + 1,
        };
        daily[todayStr] = item;
      }

      const recent = [
        {
          bookTitle: cleanTitle,
          pageNumber,
          language: language || "default",
          translatedAt: new Date().toISOString(),
        },
        ...(currentData.recent_activities || []),
      ].slice(0, 10);

      currentData = {
        ...currentData,
        total_pages: (currentData.total_pages || 0) + 1,
        active_days: activeDays,
        daily_activity: daily,
        recent_activities: recent,
      };
    }

    inMemoryActivity.set(userId, currentData);
    const d = await db();
    await safePut(d, META, currentData, getActivityKey(userId));
    await safePut(d, META, Date.now(), getActivityAtKey(userId));

    dispatchDocEvent("doclens:translation-activity-updated", {
      userId,
      data: currentData,
    });
  } catch (err) {
    console.warn("Failed to locally update translation activity in IndexedDB:", err);
  }
}

/**
 * Clears cached translation activity for a user or all users (e.g. on logout or reset).
 */
export async function clearCachedTranslationActivity(userId?: string): Promise<void> {
  try {
    if (userId) {
      inMemoryActivity.delete(userId);
      const d = await db();
      await d.delete(META, getActivityKey(userId));
      await d.delete(META, getActivityAtKey(userId));
    } else {
      inMemoryActivity.clear();
      const d = await db();
      const tx = d.transaction(META, "readwrite");
      let cursor = await tx.store.openCursor();
      while (cursor) {
        if (typeof cursor.key === "string" && cursor.key.startsWith("translation_activity")) {
          await cursor.delete();
        }
        cursor = await cursor.continue();
      }
      await tx.done;
    }
  } catch (err) {
    console.warn("Failed to clear cached translation activity from IndexedDB:", err);
  }
}
