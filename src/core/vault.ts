import type { Manifest } from './content'

export type VaultState = 'locked' | 'unlocked' | 'password-changed'
export type UnlockResult = 'ok' | 'wrong-password' | 'no-manifest'

export interface Vault {
  init(manifest: Manifest | null): Promise<VaultState>
  unlock(password: string, manifest: Manifest, libraryCipher: ArrayBuffer): Promise<UnlockResult>
  state(): VaultState
  decrypt(cipher: ArrayBuffer): Promise<ArrayBuffer>
  lock(): Promise<void>
  onWipe(fn: () => Promise<void>): void
}

export interface VaultRecord { key: CryptoKey; keyId: string }
export interface VaultStore {
  get(): Promise<VaultRecord | undefined>
  put(rec: VaultRecord): Promise<void>
  delete(): Promise<void>
}

const REC = 'current'
const done = <T>(req: IDBRequest<T>) => new Promise<T>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })

/** Default store: IndexedDB database `gu`, object store `vault`, one record under key "current". */
export function idbStore(): VaultStore {
  const open = () => new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('gu', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('vault')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const tx = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open()
    try { return await done(f(db.transaction('vault', mode).objectStore('vault'))) } finally { db.close() }
  }
  return {
    get: () => tx('readonly', (s) => s.get(REC)),
    put: async (rec) => void (await tx('readwrite', (s) => s.put(rec, REC))),
    delete: async () => void (await tx('readwrite', (s) => s.delete(REC))),
  }
}

const open = (key: CryptoKey, cipher: ArrayBuffer) =>
  crypto.subtle.decrypt({ name: 'AES-GCM', iv: cipher.slice(0, 12) }, key, cipher.slice(12))

export function createVault(store: VaultStore = idbStore()): Vault {
  let key: CryptoKey | null = null
  let st: VaultState = 'locked'
  const hooks: (() => Promise<void>)[] = []
  return {
    async init(manifest) {
      const rec = await store.get()
      if (rec && manifest && rec.keyId !== manifest.keyId) {
        await store.delete()
        key = null
        st = 'password-changed'
      } else if (rec) {
        key = rec.key
        st = 'unlocked'
      } else {
        key = null
        st = 'locked'
      }
      return st
    },
    async unlock(password, manifest, libraryCipher) {
      if (!manifest) return 'no-manifest'
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
      const salt = Uint8Array.from(atob(manifest.salt), (c) => c.charCodeAt(0))
      const derived = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: manifest.iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
      try { await open(derived, libraryCipher) } catch { return 'wrong-password' }
      await store.put({ key: derived, keyId: manifest.keyId })
      key = derived
      st = 'unlocked'
      return 'ok'
    },
    state: () => st,
    async decrypt(cipher) {
      if (!key) throw new Error('vault locked')
      return open(key, cipher)
    },
    async lock() {
      await store.delete()
      key = null
      st = 'locked'
      for (const h of hooks) await h()
    },
    onWipe: (fn) => void hooks.push(fn),
  }
}
