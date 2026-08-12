import type { FrecencyMap } from "../shared/bang-suggest";
import type { Bang } from "./redirect";

const DB_NAME = "smirkhat-search";
const DB_VERSION = 2;
const CATALOG_STORE = "bang-catalogs";
const PREFS_STORE = "prefs";

export type CatalogKey = "hot" | "full";

type CatalogRecord = {
  key: CatalogKey;
  bangs: Bang[];
  etag: string | null;
  savedAt: number;
};

export type SearchPrefs = {
  defaultBang: string;
  customBangs: Bang[];
  customSearxUrl: string;
  frecency: FrecencyMap;
  bangPrefix: string;
};

export const DEFAULT_PREFS: SearchPrefs = {
  defaultBang: "brave",
  customBangs: [],
  customSearxUrl: "",
  frecency: {},
  bangPrefix: "!",
};

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CATALOG_STORE)) {
          db.createObjectStore(CATALOG_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(PREFS_STORE)) {
          db.createObjectStore(PREFS_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbGetCatalog(
  key: CatalogKey,
): Promise<{ bangs: Bang[]; etag: string | null } | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CATALOG_STORE, "readonly");
      const req = tx.objectStore(CATALOG_STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as CatalogRecord | undefined;
        resolve(row?.bangs?.length ? { bangs: row.bangs, etag: row.etag } : null);
      };
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function idbSetCatalog(
  key: CatalogKey,
  bangs: Bang[],
  etag: string | null = null,
): Promise<void> {
  const db = await openDb();
  if (!db) return;

  const record: CatalogRecord = {
    key,
    bangs,
    etag,
    savedAt: Date.now(),
  };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CATALOG_STORE, "readwrite");
      tx.objectStore(CATALOG_STORE).put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function idbGetPrefs(): Promise<SearchPrefs> {
  const db = await openDb();
  if (!db) return { ...DEFAULT_PREFS };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PREFS_STORE, "readonly");
      const req = tx.objectStore(PREFS_STORE).get("search");
      req.onsuccess = () => {
        const row = req.result as Partial<SearchPrefs> | undefined;
        resolve({
          defaultBang: row?.defaultBang ?? DEFAULT_PREFS.defaultBang,
          customBangs: Array.isArray(row?.customBangs)
            ? row.customBangs
            : DEFAULT_PREFS.customBangs,
          customSearxUrl: row?.customSearxUrl ?? "",
          frecency:
            row?.frecency && typeof row.frecency === "object"
              ? row.frecency
              : {},
          bangPrefix:
            typeof row?.bangPrefix === "string" && row.bangPrefix.length === 1
              ? row.bangPrefix
              : DEFAULT_PREFS.bangPrefix,
        });
      };
      req.onerror = () => resolve({ ...DEFAULT_PREFS });
      tx.oncomplete = () => db.close();
    } catch {
      db.close();
      resolve({ ...DEFAULT_PREFS });
    }
  });
}

export async function idbSetPrefs(prefs: SearchPrefs): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PREFS_STORE, "readwrite");
      tx.objectStore(PREFS_STORE).put(prefs, "search");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function idbPatchPrefs(
  patch: Partial<SearchPrefs>,
): Promise<SearchPrefs> {
  const current = await idbGetPrefs();
  const next: SearchPrefs = {
    defaultBang: patch.defaultBang ?? current.defaultBang,
    customBangs: patch.customBangs ?? current.customBangs,
    customSearxUrl:
      patch.customSearxUrl !== undefined
        ? patch.customSearxUrl
        : current.customSearxUrl,
    frecency: patch.frecency ?? current.frecency,
    bangPrefix: patch.bangPrefix ?? current.bangPrefix,
  };
  await idbSetPrefs(next);
  return next;
}
