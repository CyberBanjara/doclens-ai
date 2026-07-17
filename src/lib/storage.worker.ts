import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import wasmUrl from "../../node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm?url";
import * as Comlink from "comlink";

let db: any = null;

// Helper to deserialize JSON safely
function parseJson(str: string | null): any {
  if (!str) return undefined;
  try {
    return JSON.parse(str);
  } catch {
    return undefined;
  }
}

// Helper to serialize JSON safely
function stringifyJson(val: any): string {
  return val ? JSON.stringify(val) : "";
}

const api = {
  async init(): Promise<boolean> {
    try {
      console.log("[StorageWorker] Initializing SQLite WASM module...");
      const sqlite3 = await sqlite3InitModule({
        locateFile: (file) => {
          if (file.endsWith(".wasm")) {
            return wasmUrl;
          }
          return file;
        },
      });

      if (!sqlite3.oo1 || !sqlite3.oo1.OpfsDb) {
        throw new Error("OPFS is not supported by this SQLite build/browser environment.");
      }

      console.log("[StorageWorker] Opening SQLite database from OPFS...");
      db = new sqlite3.oo1.OpfsDb("/doclens_sqlite3.db", "c");

      // Initialize table structures
      db.exec({
        sql: `
          CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            file_name TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            page_count INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            last_opened_at INTEGER NOT NULL,
            ai_done_count INTEGER DEFAULT 0,
            last_read_page INTEGER,
            ai_results TEXT
          );

          CREATE TABLE IF NOT EXISTS blobs (
            id TEXT PRIMARY KEY,
            data BLOB NOT NULL
          );

          CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
          );

          CREATE TABLE IF NOT EXISTS page_data (
            key TEXT PRIMARY KEY,
            doc_id TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            text TEXT NOT NULL,
            columns INTEGER DEFAULT 1,
            garbage_ratio REAL DEFAULT 0,
            page_ai TEXT,
            ocr_run INTEGER DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS thumbnails (
            doc_id TEXT PRIMARY KEY,
            data BLOB NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_page_data_doc_id ON page_data(doc_id);
          CREATE INDEX IF NOT EXISTS idx_page_data_doc_page ON page_data(doc_id, page_number);
        `,
      });

      console.log("[StorageWorker] Database structures initialized successfully.");
      return true;
    } catch (err: any) {
      console.error("[StorageWorker] SQLite initialization failed:", err);
      throw new Error(err.message || "SQLite WASM initialization failed");
    }
  },

  async listDocs(): Promise<any[]> {
    const rows: any[] = [];
    db.exec({
      sql: `SELECT id, file_name, file_size, page_count, created_at, last_opened_at, ai_done_count, last_read_page, ai_results FROM documents ORDER BY last_opened_at DESC`,
      rowMode: "object",
      callback: (row: any) => {
        const aiResults = parseJson(row.ai_results) || [];
        rows.push({
          id: row.id,
          fileName: row.file_name,
          fileSize: row.file_size,
          pageCount: row.page_count,
          createdAt: row.created_at,
          lastOpenedAt: row.last_opened_at,
          hasExtraction: row.page_count > 0,
          aiResultCount: aiResults.length + (row.ai_done_count || 0),
          lastReadPage: row.last_read_page ?? undefined,
        });
      },
    });
    return rows;
  },

  async getDoc(id: string): Promise<any | undefined> {
    let result: any = undefined;
    db.exec({
      sql: `SELECT id, file_name, file_size, page_count, created_at, last_opened_at, ai_done_count, last_read_page, ai_results FROM documents WHERE id = ?`,
      bind: [id],
      rowMode: "object",
      callback: (row: any) => {
        result = {
          id: row.id,
          fileName: row.file_name,
          fileSize: row.file_size,
          pages: null,
          pageCount: row.page_count,
          createdAt: row.created_at,
          lastOpenedAt: row.last_opened_at,
          aiResults: parseJson(row.ai_results) || [],
          aiDoneCount: row.ai_done_count || 0,
          lastReadPage: row.last_read_page ?? undefined,
        };
        return false; // stop iteration
      },
    });
    return result;
  },

  async getDocBlob(id: string): Promise<Uint8Array | null> {
    let blobData: Uint8Array | null = null;
    db.exec({
      sql: `SELECT data FROM blobs WHERE id = ?`,
      bind: [id],
      rowMode: "array",
      callback: (row: any) => {
        blobData = row[0];
        return false;
      },
    });
    return blobData;
  },

  async cacheDocBlob(id: string, blobBytes: Uint8Array): Promise<void> {
    db.exec({
      sql: `INSERT OR REPLACE INTO blobs (id, data) VALUES (?, ?)`,
      bind: [id, blobBytes],
    });
  },

  async createDoc(doc: {
    id: string;
    fileName: string;
    fileSize: number;
    createdAt: number;
    lastOpenedAt: number;
  }, blobBytes: Uint8Array): Promise<void> {
    db.exec({
      sql: `INSERT OR REPLACE INTO blobs (id, data) VALUES (?, ?)`,
      bind: [doc.id, blobBytes],
    });
    db.exec({
      sql: `INSERT OR REPLACE INTO documents (id, file_name, file_size, page_count, created_at, last_opened_at, ai_done_count, last_read_page, ai_results) VALUES (?, ?, ?, 0, ?, ?, 0, NULL, ?)`,
      bind: [doc.id, doc.fileName, doc.fileSize, doc.createdAt, doc.lastOpenedAt, stringifyJson([])],
    });
  },

  async updateDoc(id: string, patch: any): Promise<void> {
    // Read the document first to merge values
    const existing = this.getDoc(id);
    if (!existing) return;

    const merged = { ...existing, ...patch };
    db.exec({
      sql: `UPDATE documents SET file_name = ?, file_size = ?, page_count = ?, created_at = ?, last_opened_at = ?, ai_done_count = ?, last_read_page = ?, ai_results = ? WHERE id = ?`,
      bind: [
        merged.fileName,
        merged.fileSize,
        merged.pageCount,
        merged.createdAt,
        merged.lastOpenedAt,
        merged.aiDoneCount,
        merged.lastReadPage ?? null,
        stringifyJson(merged.aiResults),
        id,
      ],
    });
  },

  async writePages(id: string, pages: any[]): Promise<void> {
    // 1. Delete existing pages
    db.exec({
      sql: `DELETE FROM page_data WHERE doc_id = ?`,
      bind: [id],
    });

    // 2. Insert new pages inside a transaction for performance
    db.exec({ sql: "BEGIN TRANSACTION" });
    try {
      for (const p of pages) {
        db.exec({
          sql: `INSERT INTO page_data (key, doc_id, page_number, text, columns, garbage_ratio, page_ai, ocr_run) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
          bind: [
            `${id}:${String(p.pageNumber).padStart(6, "0")}`,
            id,
            p.pageNumber,
            p.text || "",
            p.columns || 1,
            p.garbageRatio || 0,
            p.ocrRun ? 1 : 0,
          ],
        });
      }
      db.exec({
        sql: `UPDATE documents SET page_count = ? WHERE id = ?`,
        bind: [pages.length, id],
      });
      db.exec({ sql: "COMMIT" });
    } catch (err) {
      db.exec({ sql: "ROLLBACK" });
      throw err;
    }
  },

  async getPageData(docId: string, pageNumber: number): Promise<any | undefined> {
    let result: any = undefined;
    const key = `${docId}:${String(pageNumber).padStart(6, "0")}`;
    db.exec({
      sql: `SELECT key, doc_id, page_number, text, columns, garbage_ratio, page_ai, ocr_run FROM page_data WHERE key = ?`,
      bind: [key],
      rowMode: "object",
      callback: (row: any) => {
        result = {
          key: row.key,
          docId: row.doc_id,
          pageNumber: row.page_number,
          text: row.text,
          columns: row.columns,
          garbageRatio: row.garbage_ratio,
          pageAi: parseJson(row.page_ai),
          ocrRun: row.ocr_run === 1,
        };
        return false;
      },
    });
    return result;
  },

  async updatePageData(docId: string, pageNumber: number, patch: any): Promise<void> {
    const key = `${docId}:${String(pageNumber).padStart(6, "0")}`;
    const existing = await this.getPageData(docId, pageNumber);
    if (!existing) return;

    const merged = { ...existing, ...patch };
    db.exec({
      sql: `UPDATE page_data SET text = ?, columns = ?, garbage_ratio = ?, page_ai = ?, ocr_run = ? WHERE key = ?`,
      bind: [
        merged.text,
        merged.columns,
        merged.garbageRatio,
        stringifyJson(merged.pageAi),
        merged.ocrRun ? 1 : 0,
        key,
      ],
    });
  },

  async getAllPages(docId: string): Promise<any[]> {
    const rows: any[] = [];
    db.exec({
      sql: `SELECT key, doc_id, page_number, text, columns, garbage_ratio, page_ai, ocr_run FROM page_data WHERE doc_id = ? ORDER BY page_number ASC`,
      bind: [docId],
      rowMode: "object",
      callback: (row: any) => {
        rows.push({
          key: row.key,
          docId: row.doc_id,
          pageNumber: row.page_number,
          text: row.text,
          columns: row.columns,
          garbageRatio: row.garbage_ratio,
          pageAi: parseJson(row.page_ai),
          ocrRun: row.ocr_run === 1,
        });
      },
    });
    return rows;
  },

  async getPageAiSummary(docId: string): Promise<Record<number, any>> {
    const out: Record<number, any> = {};
    db.exec({
      sql: `SELECT page_number, page_ai FROM page_data WHERE doc_id = ? AND page_ai IS NOT NULL`,
      bind: [docId],
      rowMode: "object",
      callback: (row: any) => {
        const pageAi = parseJson(row.page_ai);
        if (pageAi) {
          out[row.page_number] = {
            status: pageAi.status,
            hasResult: !!pageAi.result,
            isCustom: pageAi.isCustom,
            settingsHash: pageAi.settingsHash,
            updatedAt: pageAi.updatedAt,
          };
        }
      },
    });
    return out;
  },

  async getPageMetas(docId: string): Promise<any[]> {
    const rows: any[] = [];
    db.exec({
      sql: `SELECT page_number, columns, garbage_ratio FROM page_data WHERE doc_id = ? ORDER BY page_number ASC`,
      bind: [docId],
      rowMode: "object",
      callback: (row: any) => {
        rows.push({
          pageNumber: row.page_number,
          columns: row.columns,
          garbageRatio: row.garbage_ratio,
        });
      },
    });
    return rows;
  },

  async deleteDoc(id: string): Promise<void> {
    db.exec({ sql: "BEGIN TRANSACTION" });
    try {
      db.exec({ sql: `DELETE FROM documents WHERE id = ?`, bind: [id] });
      db.exec({ sql: `DELETE FROM blobs WHERE id = ?`, bind: [id] });
      db.exec({ sql: `DELETE FROM page_data WHERE doc_id = ?`, bind: [id] });
      db.exec({ sql: `DELETE FROM thumbnails WHERE doc_id = ?`, bind: [id] });
      db.exec({ sql: "COMMIT" });
    } catch (err) {
      db.exec({ sql: "ROLLBACK" });
      throw err;
    }
  },

  async appendAiResult(docId: string, result: any): Promise<void> {
    const existing = await this.getDoc(docId);
    if (!existing) return;

    const list = [...(existing.aiResults || []).filter((r: any) => r.id !== result.id), result];
    db.exec({
      sql: `UPDATE documents SET ai_results = ? WHERE id = ?`,
      bind: [stringifyJson(list), docId],
    });
  },

  async deleteAiResult(docId: string, resultId: string): Promise<void> {
    const existing = await this.getDoc(docId);
    if (!existing) return;

    const list = (existing.aiResults || []).filter((r: any) => r.id !== resultId);
    db.exec({
      sql: `UPDATE documents SET ai_results = ? WHERE id = ?`,
      bind: [stringifyJson(list), docId],
    });
  },

  async upsertPageAi(docId: string, pageNumber: number, patch: any): Promise<void> {
    const existing = await this.getDoc(docId);
    if (!existing) return;

    const page = await this.getPageData(docId, pageNumber);
    const prevAi = page?.pageAi || { pageNumber, status: "idle" };
    const { lastSentRequest: _, ...cleanPatch } = patch;
    
    const wasDone = prevAi.status === "done";
    const nextAi = { ...prevAi, ...cleanPatch, pageNumber, updatedAt: Date.now() };
    const isDone = nextAi.status === "done";

    db.exec({ sql: "BEGIN TRANSACTION" });
    try {
      db.exec({
        sql: `UPDATE page_data SET page_ai = ? WHERE doc_id = ? AND page_number = ?`,
        bind: [stringifyJson(nextAi), docId, pageNumber],
      });

      let delta = 0;
      if (!wasDone && isDone) delta = 1;
      else if (wasDone && !isDone) delta = -1;

      if (delta !== 0) {
        const nextDone = Math.max(0, (existing.aiDoneCount || 0) + delta);
        db.exec({
          sql: `UPDATE documents SET ai_done_count = ? WHERE id = ?`,
          bind: [nextDone, docId],
        });
      }
      db.exec({ sql: "COMMIT" });
    } catch (err) {
      db.exec({ sql: "ROLLBACK" });
      throw err;
    }
  },

  async getLastOpened(): Promise<string | null> {
    let result: string | null = null;
    db.exec({
      sql: `SELECT value FROM meta WHERE key = ?`,
      bind: ["lastOpenedDocId"],
      rowMode: "array",
      callback: (row: any) => {
        result = row[0];
        return false;
      },
    });
    return result;
  },

  async setLastOpened(id: string | null): Promise<void> {
    if (id === null) {
      db.exec({
        sql: `DELETE FROM meta WHERE key = ?`,
        bind: ["lastOpenedDocId"],
      });
    } else {
      db.exec({
        sql: `INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`,
        bind: ["lastOpenedDocId", id],
      });
    }
  },

  async clearAllAiResults(): Promise<void> {
    db.exec({ sql: "BEGIN TRANSACTION" });
    try {
      // 1. Reset pageAi in page_data
      db.exec({
        sql: `UPDATE page_data SET page_ai = NULL WHERE page_ai IS NOT NULL`,
      });
      // 2. Reset aiDoneCount in documents
      db.exec({
        sql: `UPDATE documents SET ai_done_count = 0 WHERE ai_done_count != 0`,
      });
      db.exec({ sql: "COMMIT" });
    } catch (err) {
      db.exec({ sql: "ROLLBACK" });
      throw err;
    }
  },

  async getThumbnail(docId: string): Promise<Uint8Array | null> {
    let data: Uint8Array | null = null;
    db.exec({
      sql: `SELECT data FROM thumbnails WHERE doc_id = ?`,
      bind: [docId],
      rowMode: "array",
      callback: (row: any) => {
        data = row[0];
        return false;
      },
    });
    return data;
  },

  async saveThumbnailBlob(docId: string, bytes: Uint8Array): Promise<void> {
    db.exec({
      sql: `INSERT OR REPLACE INTO thumbnails (doc_id, data) VALUES (?, ?)`,
      bind: [docId, bytes],
    });
  },
};

Comlink.expose(api);
