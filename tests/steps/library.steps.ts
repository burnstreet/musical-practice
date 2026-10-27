import 'fake-indexeddb/auto'
import { createHash } from 'node:crypto'
import { expect } from 'vitest'
import { steps } from '../gherkin'
import { createLibrary } from '../../src/core/library'
import { openDb } from '../../src/core/db'
import type { Vault, VaultState } from '../../src/core/vault'
import type { Manifest } from '../../src/core/content'
import { encryptWith } from '../fakes/crypto'

const KEY = crypto.subtle.importKey('raw', new Uint8Array(32).fill(3), 'AES-GCM', false, ['encrypt', 'decrypt'])
const enc = (t: string | Uint8Array) => (typeof t === 'string' ? new TextEncoder().encode(t) : t)

const encrypt = async (plain: Uint8Array) => encryptWith(await KEY, plain)

const fakeVault = (st: VaultState): Vault => {
  const hooks: (() => Promise<void>)[] = []
  return {
    init: async () => st,
    unlock: async () => 'ok',
    state: () => st,
    decrypt: async (c) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: c.slice(0, 12) }, await KEY, c.slice(12)),
    lock: async () => { for (const h of hooks) await h() },
    onWipe: (fn) => void hooks.push(fn),
  }
}

const NOTES = { id: 'x', bpm: 100, key: 'C', timeSig: [4, 4], bars: [0, 2], notes: [{ start: 0, end: 1, midi: 60, syllable: 'la', role: 'chor', phrase: 0, bar: 1, beat: 1, dur: 1 }], phrases: [{ index: 0, label: 'A', start: 0, end: 1 }] }
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').slice(0, 16)

interface Server { manifest: Manifest; files: Map<string, ArrayBuffer>; ids: Record<string, { notes: string; voices: string; backing: string }>; fetched: string[]; failures: Map<string, number>; down: boolean }

/** Builds a server for the given song numbers. notesIds overrides a song's notes file id. */
async function build(nums: string[], notesIds: Record<string, string> = {}): Promise<Server> {
  const files = new Map<string, ArrayBuffer>()
  const ids: Server['ids'] = {}
  const put = async (plain: Uint8Array, id = hash(plain)) => { files.set(id, await encrypt(plain)); return id }
  for (const n of nums) {
    ids[n] = {
      notes: await put(enc(JSON.stringify({ ...NOTES, id: n })), notesIds[n]),
      voices: await put(enc(`voices-${n}`)),
      backing: await put(enc(`backing-${n}`)),
    }
  }
  const lib = { roles: [{ id: 'chor', name: 'Chor', sings: true }], songs: nums.map((n, i) => ({ id: n, number: i + 1, title: `Song ${n}`, durationSec: 10, roles: ['chor'], files: ids[n] })) }
  const library = await put(enc(JSON.stringify(lib)))
  const files$ = Object.fromEntries([...files].map(([id, c]) => [id, c.byteLength]))
  const manifest: Manifest = { format: 1, build: 'x', keyId: '0123456789abcdef', salt: Buffer.alloc(16, 7).toString('base64'), iterations: 1000, library, songCount: nums.length, totalBytes: Object.values(files$).reduce((a, b) => a + b, 0), files: files$ }
  return { manifest, files, ids, fetched: [], failures: new Map(), down: false }
}

const serverFetch = (ctx: any) => (async (url: string) => {
  const s: Server = ctx.server
  if (s.down) throw new TypeError('offline')
  if (url.endsWith('manifest.json')) return new Response(JSON.stringify(s.manifest))
  const id = url.match(/([0-9a-f]{16})\.bin$/)![1]
  s.fetched.push(id)
  const left = s.failures.get(id) ?? 0
  if (left > 0) { s.failures.set(id, left - 1); throw new TypeError('network') }
  const body = s.files.get(id)
  return body ? new Response(body) : new Response(null, { status: 404 })
}) as typeof fetch

let n = 0
const setup = (ctx: any, st: VaultState = 'unlocked') => {
  ctx.vault = fakeVault(st)
  ctx.db = () => openDb(`gu-test-${ctx.dbName ??= ++n}`)
  ctx.events = []
  ctx.lib = createLibrary({ vault: ctx.vault, fetch: serverFetch(ctx), retryDelayMs: 0, db: ctx.db })
  ctx.lib.onProgress((p: any) => ctx.events.push(p))
}
const withSongs = async (ctx: any, nums: string[], st: VaultState = 'unlocked') => { ctx.server = await build(nums); setup(ctx, st) }
const storedIds = async (ctx: any): Promise<string[]> => {
  const db = await ctx.db()
  const keys = await new Promise<string[]>((res, rej) => { const r = db.transaction('files').objectStore('files').getAllKeys(); r.onsuccess = () => res(r.result as string[]); r.onerror = () => rej(r.error) })
  db.close()
  return keys
}

export default steps(({ Given, When, Then }) => {
  Given(/^a server manifest with songCount (\d+) and totalBytes (\d+)$/, async (ctx, c, t) => {
    ctx.server = await build([])
    Object.assign(ctx.server.manifest, { songCount: +c, totalBytes: +t })
    setup(ctx, 'locked')
  })
  Given(/^the server is unreachable and no cached manifest$/, async (ctx) => {
    ctx.server = await build([])
    ctx.server.down = true
    setup(ctx, 'locked')
  })
  Given(/^an unlocked vault and a manifest with 2 songs of 3 files each plus the library$/, (ctx) => withSongs(ctx, ['01', '02']))
  Given(/^an unlocked vault and a manifest with songs "01" and "02"$/, (ctx) => withSongs(ctx, ['01', '02']))
  Given(/^a completed sync$/, async (ctx) => { await withSongs(ctx, ['01', '02']); await ctx.lib.sync() })
  Given(/^a completed sync where song "01" notes had id "([0-9a-f]{16})"$/, async (ctx, id) => {
    ctx.server = await build(['01', '02'], { '01': id })
    setup(ctx)
    await ctx.lib.sync()
  })
  Given(/^fetching the voices file of song "02" fails 4 times$/, async (ctx) => {
    await withSongs(ctx, ['01', '02'])
    ctx.server.failures.set(ctx.server.ids['02'].voices, 4)
  })
  Given(/^a locked vault$/, (ctx) => withSongs(ctx, ['01', '02'], 'locked'))

  When(/^I fetch the manifest( while locked)?$/, async (ctx) => { ctx.result = await ctx.lib.fetchManifest() })
  When(/^I sync$/, async (ctx) => { await ctx.lib.sync() })
  When(/^sync has stored the library and all files of "01"$/, async (ctx) => {
    ctx.lib.onProgress((p: any) => { if (!ctx.snap && p.readySongs.includes('01')) ctx.snap = [ctx.lib.isReady('01'), ctx.lib.isReady('02')] })
    await ctx.lib.sync()
  })
  When(/^I sync again with the same manifest$/, async (ctx) => { ctx.server.fetched = []; await ctx.lib.sync() })
  When(/^the manifest now lists notes id "([0-9a-f]{16})" for song "01" and I sync$/, async (ctx, id) => {
    ctx.server = Object.assign(await build(['01', '02'], { '01': id }), { fetched: [] })
    await ctx.lib.sync()
  })
  When(/^I get song "01"$/, async (ctx) => { ctx.loaded = await ctx.lib.getSong('01') })
  When(/^wipe runs$/, async (ctx) => { ctx.ids = ctx.lib.songs().map((s: any) => s.id); await ctx.vault.lock() })

  Then(/^sizeInfo gives songCount (\d+) and totalBytes (\d+)$/, (ctx, c, t) => {
    expect(ctx.lib.sizeInfo()).toEqual({ songCount: +c, totalBytes: +t })
  })
  Then(/^I get null and sizeInfo gives null$/, (ctx) => {
    expect(ctx.result).toBeNull()
    expect(ctx.lib.sizeInfo()).toBeNull()
  })
  Then(/^progress events arrive with doneBytes rising to totalBytes$/, (ctx) => {
    const bytes = ctx.events.map((e: any) => e.doneBytes)
    expect(bytes.length).toBeGreaterThanOrEqual(7)
    expect(bytes).toEqual([...bytes].sort((a, b) => a - b))
    expect(bytes[0]).toBeLessThan(bytes.at(-1))
    expect(bytes.at(-1)).toBe(ctx.server.manifest.totalBytes)
  })
  Then(/^readySongs ends as both song ids and done is true$/, (ctx) => {
    const last = ctx.events.at(-1)
    expect(last.readySongs).toEqual(['01', '02'])
    expect(last.done).toBe(true)
  })
  Then(/^isReady\("01"\) is true and isReady\("02"\) is false$/, (ctx) => { expect(ctx.snap).toEqual([true, false]) })
  Then(/^no file is fetched$/, (ctx) => { expect(ctx.server.fetched).toEqual([]) })
  Then(/^only "([0-9a-f]{16})" is fetched and "([0-9a-f]{16})" is deleted from the store$/, async (ctx, fresh, old) => {
    // library file id changes with its content, so it is fetched too; the song files are what must be minimal
    expect(ctx.server.fetched.filter((id: string) => id !== ctx.server.manifest.library)).toEqual([fresh])
    const keys = await storedIds(ctx)
    expect(keys).toContain(fresh)
    expect(keys).not.toContain(old)
  })
  Then(/^done is true with an error, readySongs contains "01" but not "02"$/, (ctx) => {
    const last = ctx.events.at(-1)
    expect(last.done).toBe(true)
    expect(last.error).toBeTruthy()
    expect(last.readySongs).toContain('01')
    expect(last.readySongs).not.toContain('02')
  })
  Then(/^a later sync fetches only the missing file$/, async (ctx) => {
    ctx.server.fetched = []
    await ctx.lib.sync()
    expect(ctx.server.fetched).toEqual([ctx.server.ids['02'].voices])
    expect(ctx.events.at(-1).readySongs).toEqual(['01', '02'])
  })
  Then(/^I receive parsed notes, a voices Blob and a backing Blob of type audio\/mpeg$/, (ctx) => {
    expect(ctx.loaded.song.notes).toHaveLength(1)
    expect(ctx.loaded.meta.id).toBe('01')
    for (const b of [ctx.loaded.voices, ctx.loaded.backing]) {
      expect(b).toBeInstanceOf(Blob)
      expect(b.type).toBe('audio/mpeg')
    }
  })
  Then(/^songs\(\) is empty and getSong throws$/, async (ctx) => {
    expect(ctx.lib.songs()).toEqual([])
    await expect(ctx.lib.getSong('01')).rejects.toThrow()
  })
  Then(/^isReady is false for every song and the file store is empty$/, async (ctx) => {
    expect(ctx.ids).toEqual(['01', '02'])
    for (const id of ctx.ids) expect(ctx.lib.isReady(id)).toBe(false)
    expect(await storedIds(ctx)).toEqual([])
  })
})
