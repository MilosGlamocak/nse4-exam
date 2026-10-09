import { signal } from '@preact/signals';

/**
 * Persistence layer. IndexedDB is preferred (exhibit images as data URIs can be big),
 * localStorage is the fallback, memory the last resort. Every access is wrapped in try/catch.
 * The in-progress session is additionally mirrored synchronously into localStorage.
 */
export type BackendKind = 'indexeddb' | 'localstorage' | 'memory';

interface Backend {
  kind: BackendKind;
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

const DB_NAME = 'nse4-exam';
const STORE = 'kv';
const LS_PREFIX = 'nse4:';

export const storageKind = signal<BackendKind>('memory');
export const storageError = signal<string | null>(null);

function idbBackend(): Promise<Backend> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB nije dostupan'));
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      return reject(e);
    }
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB greška'));
    req.onblocked = () => reject(new Error('IndexedDB blokiran'));
    req.onsuccess = () => {
      const db = req.result;
      const tx = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
        new Promise<T>((res, rej) => {
          const t = db.transaction(STORE, mode);
          const r = fn(t.objectStore(STORE));
          t.oncomplete = () => res(r.result);
          t.onerror = () => rej(t.error ?? new Error('IndexedDB transakcija'));
          t.onabort = () => rej(t.error ?? new Error('IndexedDB transakcija prekinuta'));
        });
      resolve({
        kind: 'indexeddb',
        get: (k) => tx('readonly', (s) => s.get(k)),
        set: async (k, v) => {
          await tx('readwrite', (s) => s.put(v, k));
        },
        del: async (k) => {
          await tx('readwrite', (s) => s.delete(k));
        },
      });
    };
  });
}

function lsBackend(): Backend {
  // probe (throws when blocked)
  localStorage.setItem(LS_PREFIX + '__probe', '1');
  localStorage.removeItem(LS_PREFIX + '__probe');
  return {
    kind: 'localstorage',
    get: async (k) => {
      const s = localStorage.getItem(LS_PREFIX + k);
      return s == null ? undefined : JSON.parse(s);
    },
    set: async (k, v) => localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)),
    del: async (k) => localStorage.removeItem(LS_PREFIX + k),
  };
}

function memBackend(): Backend {
  const m = new Map<string, unknown>();
  return {
    kind: 'memory',
    get: async (k) => m.get(k),
    set: async (k, v) => void m.set(k, v),
    del: async (k) => void m.delete(k),
  };
}

let backend: Backend = memBackend();

export async function initStorage(): Promise<void> {
  try {
    backend = await idbBackend();
    await backend.set('__probe', 1);
    await backend.del('__probe');
  } catch (e1) {
    try {
      backend = lsBackend();
    } catch (e2) {
      backend = memBackend();
      storageError.value = 'Čuvanje podataka u pregledaču nije dostupno – podaci će se izgubiti zatvaranjem taba. Redovno radi backup!';
      void e1;
      void e2;
    }
  }
  storageKind.value = backend.kind;
  try {
    // ask the browser not to evict our data under storage pressure
    void navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
}

export async function loadKey<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await backend.get(key);
    return v === undefined || v === null ? fallback : (v as T);
  } catch (e) {
    storageError.value = 'Čitanje iz skladišta nije uspelo: ' + (e as Error).message;
    return fallback;
  }
}

export async function saveKey(key: string, value: unknown): Promise<void> {
  try {
    await backend.set(key, value);
    if (storageError.value?.startsWith('Čuvanje')) storageError.value = null;
  } catch (e) {
    storageError.value = 'Čuvanje nije uspelo (' + ((e as Error).name || 'greška') + '). Napravi backup i oslobodi prostor.';
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await backend.del(key);
  } catch {
    /* ignore */
  }
}

/** Synchronous mirror for the in-progress session (survives a refresh even if an async write is lost). */
export function lsWrite(key: string, value: unknown): void {
  try {
    if (value == null) localStorage.removeItem(LS_PREFIX + 'mirror:' + key);
    else localStorage.setItem(LS_PREFIX + 'mirror:' + key, JSON.stringify(value));
  } catch {
    /* quota or blocked: ignore, IndexedDB copy still exists */
  }
}

export function lsRead<T>(key: string): T | undefined {
  try {
    const s = localStorage.getItem(LS_PREFIX + 'mirror:' + key);
    return s == null ? undefined : (JSON.parse(s) as T);
  } catch {
    return undefined;
  }
}
