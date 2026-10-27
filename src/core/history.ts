import type { RoleId } from './content'
import { openDb, withStore } from './db'
import type { PassResult } from './scorer'
import type { Vault } from './vault'

export interface SessionSummary {
  at: string
  passes: number
  bestHitPct: number
  lastHitPct: number
}

export interface History {
  record(songId: string, roles: RoleId[], passes: PassResult[]): Promise<void>
  list(songId: string, roles: RoleId[]): Promise<SessionSummary[]>
  badge(songId: string, roles: RoleId[]): Promise<number | null>
  wipe(): Promise<void>
}

const MAX = 20
const keyOf = (songId: string, roles: RoleId[]) => songId + '|' + [...roles].sort().join(',')

export function createHistory(deps: { vault?: Vault; db?: () => Promise<IDBDatabase>; now?: () => string } = {}): History {
  const open = deps.db ?? (() => openDb())
  const now = deps.now ?? (() => new Date().toISOString())
  // Each key holds its sessions newest first.
  const list: History['list'] = async (songId, roles) =>
    (await withStore<SessionSummary[] | undefined>(open, 'history', 'readonly', (s) => s.get(keyOf(songId, roles)))) ?? []
  const h: History = {
    list,
    async record(songId, roles, passes) {
      if (!passes.length) return
      const hits = passes.map((p) => p.hitPct)
      const entry: SessionSummary = { at: now(), passes: passes.length, bestHitPct: Math.max(...hits), lastHitPct: hits.at(-1)! }
      // shortcut: read-then-write in two transactions; fine for one user, upgrade if sessions can overlap.
      const next = [entry, ...(await list(songId, roles))].slice(0, MAX)
      await withStore(open, 'history', 'readwrite', (s) => s.put(next, keyOf(songId, roles)))
    },
    async badge(songId, roles) {
      return (await list(songId, roles))[0]?.lastHitPct ?? null
    },
    wipe: () => withStore(open, 'history', 'readwrite', (s) => s.clear()).then(() => {}),
  }
  deps.vault?.onWipe(h.wipe)
  return h
}
