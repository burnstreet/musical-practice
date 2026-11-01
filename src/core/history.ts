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

/** Sums of one day; averages are sums divided by counts. */
export interface DaySummary {
  /** Local date YYYY-MM-DD. */
  day: string
  passes: number
  notes: number
  hits: number
  /** meanCents summed over the passes that have one. */
  centsSum: number
  centsPasses: number
  entries: number
  cleanEntries: number
  /** By section name. */
  sections: Record<string, { notes: number; hits: number }>
}

export interface History {
  record(songId: string, roles: RoleId[], passes: PassResult[]): Promise<void>
  list(songId: string, roles: RoleId[]): Promise<SessionSummary[]>
  badge(songId: string, roles: RoleId[]): Promise<number | null>
  recordPass(songId: string, roles: RoleId[], pass: PassResult): Promise<void>
  days(songId: string, roles: RoleId[]): Promise<DaySummary[]>
  wipe(): Promise<void>
}

/** One bar of the Verlauf: a day, or a week (Monday first) for span 'all'. Values null when nothing counted. */
export interface DayBar {
  day: string
  hitPct: number | null
  cents: number | null
  cleanPct: number | null
  sections: Record<string, number>
}

const MAX = 20
const MAX_DAYS = 400
const DAY_MS = 86_400_000
const keyOf = (songId: string, roles: RoleId[]) => `${songId}|${[...roles].sort().join(',')}`
export const localDay = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Dates as UTC midnight, so steps of 24 h never cross a DST change.
const ms = (day: string) => Date.parse(`${day}T00:00:00Z`)
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10)
const monday = (t: number) => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS
const pct = (k: number, n: number) => (n ? Math.round((100 * k) / n) : null)

export function dayBars(days: DaySummary[], span: 'week' | 'month' | 'all', today: string): DayBar[] {
  const end = ms(today)
  const step = span === 'all' ? 7 * DAY_MS : DAY_MS
  const last = span === 'all' ? monday(end) : end
  const first = span === 'all' ? monday(Math.min(end, ...days.map((d) => ms(d.day)))) : end - (span === 'week' ? 6 : 27) * DAY_MS
  const bars: DayBar[] = []
  for (let t = first; t <= last; t += step) {
    const sum = { notes: 0, hits: 0, centsSum: 0, centsPasses: 0, entries: 0, cleanEntries: 0 }
    const sections: Record<string, { notes: number; hits: number }> = {}
    for (const d of days.filter((d) => ms(d.day) >= t && ms(d.day) < t + step)) {
      for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += d[k]
      for (const [name, s] of Object.entries(d.sections)) {
        const was = sections[name] ?? { notes: 0, hits: 0 }
        sections[name] = { notes: was.notes + s.notes, hits: was.hits + s.hits }
      }
    }
    bars.push({
      day: dayOf(t),
      hitPct: pct(sum.hits, sum.notes),
      cents: sum.centsPasses ? sum.centsSum / sum.centsPasses : null,
      cleanPct: pct(sum.cleanEntries, sum.entries),
      sections: Object.fromEntries(Object.entries(sections).flatMap(([name, s]) => (s.notes ? [[name, pct(s.hits, s.notes)!]] : []))),
    })
  }
  return bars
}

export function createHistory(deps: { vault?: Vault; db?: () => Promise<IDBDatabase>; now?: () => string; today?: () => string } = {}): History {
  const open = deps.db ?? (() => openDb())
  const now = deps.now ?? (() => new Date().toISOString())
  const today = deps.today ?? localDay
  // Each key's days newest first, under the key plus '|days'.
  const days: History['days'] = async (songId, roles) =>
    (await withStore<DaySummary[] | undefined>(open, 'history', 'readonly', (s) => s.get(`${keyOf(songId, roles)}|days`))) ?? []
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
    days,
    async recordPass(songId, roles, pass) {
      const all = await days(songId, roles)
      const day = today()
      const d: DaySummary =
        all[0]?.day === day ? all.shift()! : { day, passes: 0, notes: 0, hits: 0, centsSum: 0, centsPasses: 0, entries: 0, cleanEntries: 0, sections: {} }
      const entries = pass.notes.filter((n) => n.entry)
      d.passes++
      d.notes += pass.scoredNotes
      d.hits += pass.hits
      if (pass.meanCents !== null) {
        d.centsSum += pass.meanCents
        d.centsPasses++
      }
      d.entries += entries.length
      d.cleanEntries += entries.filter((n) => n.entry!.clean).length
      for (const s of pass.sections) {
        const sum = d.sections[s.label] ?? { notes: 0, hits: 0 }
        d.sections[s.label] = { notes: sum.notes + s.notes, hits: sum.hits + s.hits }
      }
      // shortcut: read-then-write as in record
      await withStore(open, 'history', 'readwrite', (s) => s.put([d, ...all].slice(0, MAX_DAYS), `${keyOf(songId, roles)}|days`))
    },
    wipe: () => withStore(open, 'history', 'readwrite', (s) => s.clear()).then(() => {}),
  }
  deps.vault?.onWipe(h.wipe)
  return h
}
