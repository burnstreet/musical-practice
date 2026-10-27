/** Shared IndexedDB open: database `gu` v3 with stores `vault`, `files`, `meta`, `history`. Upgrade keeps existing stores. */
export function openDb(name = 'gu'): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name, 3)
    r.onupgradeneeded = () => {
      for (const s of ['vault', 'files', 'meta', 'history']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s)
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export const done = <T>(req: IDBRequest<T>) => new Promise<T>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })

/** One request in one transaction on one store; the connection is closed afterwards. */
export async function withStore<T>(open: () => Promise<IDBDatabase>, store: string, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try { return await done(f(db.transaction(store, mode).objectStore(store))) } finally { db.close() }
}

