import type { Dataset } from '../../types';

/** A dataset the user loaded. Lives in this browser's IndexedDB only; nothing is uploaded anywhere. */
export interface StoredDataset {
  id: string;
  name: string;
  fileName: string;
  createdAt: string;
  dataset: Dataset;
}

const DB_NAME = 'report-monitor';
const STORE = 'datasets';
const ACTIVE_KEY = 'rm.activeSource';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB error'));
  });
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error('IndexedDB error'));
        };
      }),
  );
}

/** Newest first. Returns an empty list when the browser blocks storage (private window, blocked site data). */
export async function listStored(): Promise<StoredDataset[]> {
  try {
    const all = await run<StoredDataset[]>('readonly', (store) => store.getAll());
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/** Resolves to false when the browser refuses to store (the dataset is then only kept for this visit). */
export async function saveStored(item: StoredDataset): Promise<boolean> {
  try {
    await run('readwrite', (store) => store.put(item));
    return true;
  } catch {
    return false;
  }
}

export async function deleteStored(id: string): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(id));
  } catch {
    /* nothing to remove */
  }
}

export function readActiveSource(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function writeActiveSource(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* the choice is simply not remembered */
  }
}

export function newDatasetId(): string {
  return `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
