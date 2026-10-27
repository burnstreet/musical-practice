import { parseLibrary, parseManifest, parseSong, type Library as LibraryData, type Manifest, type Role, type Song, type SongMeta } from './content'
import { openDb, withStore } from './db'
import type { LoadedSong } from './types'
import type { Vault } from './vault'

export type { LoadedSong }
export interface DownloadProgress { doneBytes: number; totalBytes: number; readySongs: string[]; done: boolean; error?: string }

export interface Library {
  fetchManifest(): Promise<Manifest | null>
  sizeInfo(): { songCount: number; totalBytes: number } | null
  sync(): Promise<void>
  onProgress(fn: (p: DownloadProgress) => void): void
  songs(): SongMeta[]
  roles(): Role[]
  isReady(songId: string): boolean
  getSong(songId: string): Promise<LoadedSong>
  wipe(): Promise<void>
}

export interface LibraryDeps {
  vault: Vault
  fetch?: typeof fetch
  baseUrl?: string
  retryDelayMs?: number
  db?: () => Promise<IDBDatabase>
}

const RETRIES = 3

export function createLibrary(deps: LibraryDeps): Library {
  const { vault, baseUrl = 'content', retryDelayMs = 2000, db = openDb } = deps
  const doFetch = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const listeners: ((p: DownloadProgress) => void)[] = []
  let manifest: Manifest | null = null
  let data: LibraryData | null = null
  let stored = new Set<string>()

  const idb = <T>(store: string, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => withStore(db, store, mode, f)
  const read = async (id: string) => (await idb('files', 'readonly', (s) => s.get(id))) as ArrayBuffer
  const plain = async (id: string) => vault.decrypt(await read(id))
  const unlocked = () => vault.state() === 'unlocked'

  async function load() {
    stored = new Set(await idb('files', 'readonly', (s) => s.getAllKeys()) as string[])
    data = null
    if (!unlocked() || !manifest || !stored.has(manifest.library)) return
    try { data = parseLibrary(JSON.parse(new TextDecoder().decode(await plain(manifest.library)))) } catch { /* unreadable library counts as none */ }
  }

  const ready = (s: SongMeta) => Object.values(s.files).every((id) => stored.has(id))
  const readySongs = () => (unlocked() ? (data?.songs ?? []).filter(ready).map((s) => s.id) : [])

  async function download(id: string): Promise<ArrayBuffer | null> {
    for (let i = 0; i <= RETRIES; i++) {
      try {
        const r = await doFetch(`${baseUrl}/${id}.bin`)
        if (r.ok) return await r.arrayBuffer()
      } catch { /* retry */ }
      if (i < RETRIES) await new Promise((r) => setTimeout(r, retryDelayMs))
    }
    return null
  }

  const lib: Library = {
    async fetchManifest() {
      let fresh: Manifest | null = null
      try {
        const r = await doFetch(`${baseUrl}/manifest.json`)
        if (r.ok) fresh = parseManifest(await r.json())
      } catch { /* offline or invalid: fall back to cache */ }
      if (fresh) await idb('meta', 'readwrite', (s) => s.put(fresh, 'manifest'))
      manifest = fresh ?? ((await idb('meta', 'readonly', (s) => s.get('manifest'))) as Manifest | undefined) ?? null
      await load()
      return fresh
    },
    sizeInfo: () => (manifest ? { songCount: manifest.songCount, totalBytes: manifest.totalBytes } : null),
    async sync() {
      await lib.fetchManifest()
      const m = manifest
      const emit = (p: Partial<DownloadProgress>) => listeners.forEach((l) => l({ doneBytes, totalBytes: m?.totalBytes ?? 0, readySongs: readySongs(), done: false, ...p }))
      let doneBytes = 0
      if (!m) return emit({ done: true, error: 'no manifest' })
      const failed: string[] = []
      const fetchFile = async (id: string) => {
        if (!stored.has(id)) {
          const bytes = await download(id)
          if (!bytes) return void failed.push(id)
          await idb('files', 'readwrite', (s) => s.put(bytes, id)) // ciphertext only
          stored.add(id)
        }
        doneBytes += m.files[id] ?? 0
        emit({})
      }
      await fetchFile(m.library)
      await load()
      for (const s of data?.songs ?? []) for (const id of [s.files.notes, s.files.voices, s.files.backing]) await fetchFile(id)
      for (const id of stored) if (!(id in m.files)) await idb('files', 'readwrite', (s) => s.delete(id))
      await load()
      emit({ done: true, error: failed.length ? `failed: ${failed.join(', ')}` : undefined })
    },
    onProgress: (fn) => void listeners.push(fn),
    songs: () => (unlocked() ? (data?.songs ?? []) : []),
    roles: () => (unlocked() ? (data?.roles ?? []) : []),
    isReady: (id) => lib.songs().some((s) => s.id === id && ready(s)),
    async getSong(id) {
      const meta = lib.songs().find((s) => s.id === id)
      if (!meta || !ready(meta)) throw new Error(`song ${id} not ready`)
      const song = parseSong(JSON.parse(new TextDecoder().decode(await plain(meta.files.notes))))
      const blob = async (fid: string) => new Blob([await plain(fid)], { type: 'audio/mpeg' })
      return { meta, song, voices: await blob(meta.files.voices), backing: await blob(meta.files.backing) }
    },
    async wipe() {
      await idb('files', 'readwrite', (s) => s.clear())
      await idb('meta', 'readwrite', (s) => s.clear())
      manifest = null
      data = null
      stored = new Set()
    },
  }
  vault.onWipe(lib.wipe)
  return lib
}
