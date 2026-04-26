"use client";

/**
 * Persists a user's intent from the public landing page through the auth
 * flow and into /start so we can auto-submit on their behalf.
 *
 * - Prompt text lives in localStorage (sync read on /start mount).
 * - Files live in IndexedDB because they are Blob/File objects that are not
 *   serializable into a string and can be larger than the localStorage cap.
 *   File is structured-cloneable, so it round-trips through IDB natively.
 *
 * Both stores are best-effort: if either fails (private mode, quota, etc.)
 * the helper silently degrades. The caller should always handle the case
 * where nothing is recovered.
 */

const PROMPT_KEY = "landing-starter-prompt";
const DB_NAME = "sunset-handoff";
const DB_VERSION = 1;
const STORE_NAME = "files";
const FILES_KEY = "landing-starter-files";

export interface LandingHandoff {
  prompt: string;
  files: File[];
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!isBrowser()) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function putFiles(files: File[]): Promise<void> {
  await withStore("readwrite", (store) => store.put(files, FILES_KEY));
}

async function getFiles(): Promise<File[]> {
  const raw = await withStore<unknown>("readonly", (store) =>
    store.get(FILES_KEY)
  );
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is File => f instanceof File);
}

async function deleteFiles(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(FILES_KEY));
}

/**
 * Save a prompt + optional files for the next /start mount to consume.
 * Safe to call from any client component; never throws.
 */
export async function saveLandingHandoff(
  prompt: string,
  files: File[] = []
): Promise<void> {
  if (!isBrowser()) return;
  const trimmed = prompt.trim();
  try {
    if (trimmed) {
      window.localStorage.setItem(PROMPT_KEY, trimmed);
    } else {
      window.localStorage.removeItem(PROMPT_KEY);
    }
  } catch {
    // localStorage may be unavailable (private mode); continue with files.
  }
  if (files.length > 0) {
    await putFiles(files).catch(() => undefined);
  } else {
    await deleteFiles().catch(() => undefined);
  }
}

/**
 * Read and clear the pending handoff in one step.
 * Returns null if there is nothing to consume.
 */
export async function consumeLandingHandoff(): Promise<LandingHandoff | null> {
  if (!isBrowser()) return null;

  let prompt = "";
  try {
    prompt = window.localStorage.getItem(PROMPT_KEY)?.trim() ?? "";
    if (prompt) {
      window.localStorage.removeItem(PROMPT_KEY);
    }
  } catch {
    prompt = "";
  }

  let files: File[] = [];
  try {
    files = await getFiles();
    if (files.length > 0) {
      await deleteFiles().catch(() => undefined);
    }
  } catch {
    files = [];
  }

  if (!prompt && files.length === 0) return null;
  return { prompt, files };
}

/**
 * Clear any pending handoff without consuming it (e.g. user opens the
 * landing in a fresh tab and wants to start over).
 */
export async function clearLandingHandoff(): Promise<void> {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(PROMPT_KEY);
  } catch {
    // ignore
  }
  await deleteFiles().catch(() => undefined);
}
