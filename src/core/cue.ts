import type { RoleId } from './content'
import type { Script, ScriptItem } from './types'

export type CueState = 'playing' | 'direction' | 'song' | 'waiting' | 'speaking' | 'prompting' | 'paused' | 'done'
export interface CueOptions {
  roles: RoleId[]
  hardTimeoutMs: number
  directionMs: number
  showDirections: boolean
  repeat: CueRepeat | null
}
/** Item ids within one scene. */
export interface CueRepeat {
  sceneId: string
  from?: string
  to?: string
}
export type CueEvent =
  | { type: 'audioEnded' }
  | { type: 'speechStart' }
  | { type: 'speechEnd' }
  | { type: 'tap' }
  | { type: 'skip' }
  | { type: 'back' }
  | { type: 'prompt' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'tick' }
export type CueEffect = { type: 'play'; itemIds: string[] } | { type: 'stop' } | { type: 'mic'; on: boolean } | { type: 'missed' }
export interface Cue {
  state: CueState
  sceneId: string
  turn: Turn
  next: Turn // turn that tap or audio end enters, repeat applied; [] after the last scene
  effects: CueEffect[]
  position(): { sceneId: string; itemId: string }
}

export const CUE_DEFAULTS = { hardTimeoutMs: 20000, directionMs: 2500 }

/** A turn: one item, or several consecutive lines of my roles. */
export type Turn = ScriptItem[]

/** Where the cue stands: scene index `si` in the script, turn index `ti` in that scene. */
interface TurnPos {
  si: number
  ti: number
}
/** What a cue carries besides its public fields. */
interface CueRun extends TurnPos {
  script: Script
  opts: CueOptions
  since: number // clock of entering the turn
}
const runs = new WeakMap<Cue, CueRun>()

const isMyLine = (i: ScriptItem, roles: RoleId[]) => i.type === 'line' && roles.includes(i.role)

/** Items in turns: my consecutive lines join one turn, everything else is a turn of its own. */
export function groupTurns(items: ScriptItem[], roles: RoleId[]): Turn[] {
  const out: Turn[] = []
  for (const i of items) {
    const last = out.at(-1)
    if (last && isMyLine(i, roles) && isMyLine(last[0], roles)) last.push(i)
    else out.push([i])
  }
  return out
}

type Setup = Pick<CueRun, 'script' | 'opts'>

const turnsOf = ({ script, opts }: Setup, si: number): Turn[] =>
  groupTurns(
    script.scenes[si].items.filter((i) => opts.showDirections || i.type !== 'direction'),
    opts.roles,
  )
const isMine = (x: CueRun, t: Turn) => isMyLine(t[0], x.opts.roles)
const lineRole = (t: Turn) => (t[0].type === 'line' ? t[0].role : undefined)
const ids = (t: Turn) => t.map((i) => i.id)
const mic = (on: boolean): CueEffect => ({ type: 'mic', on })

/** Position past the end of a scene continues with the next scene; null after the last one. */
function resolve(x: Setup, si: number, ti: number): TurnPos | null {
  let turns = turnsOf(x, si)
  while (ti >= turns.length) {
    si++
    ti = 0
    if (si >= x.script.scenes.length) return null
    turns = turnsOf(x, si)
  }
  return { si, ti }
}

/** The repeat as turn indexes `first`..`last` in scene `si`; null without one. */
function rangeOf(x: Setup): { si: number; first: number; last: number } | null {
  const r = x.opts.repeat
  const si = x.script.scenes.findIndex((s) => s.id === r?.sceneId)
  if (!r || si < 0) return null
  const items = x.script.scenes[si].items
  const indexOr = (id: string | undefined, end: number) => {
    const k = items.findIndex((i) => i.id === id)
    return k < 0 ? end : k
  }
  const lo = indexOr(r.from, 0)
  const hi = indexOr(r.to, items.length - 1)
  const inRange = turnsOf(x, si).map((t) =>
    t.some((i) => {
      const k = items.indexOf(i)
      return lo <= k && k <= hi
    }),
  )
  const first = inRange.indexOf(true)
  return first < 0 ? null : { si, first, last: inRange.lastIndexOf(true) }
}

/** A forward move from `x` to `to`: past the end of the range it wraps to the range's first turn. */
function wrap(x: CueRun, to: TurnPos | null): TurnPos | null {
  const r = rangeOf(x)
  if (!r || x.si !== r.si || x.ti > r.last || (to && to.si === r.si && to.ti <= r.last)) return to
  return { si: r.si, ti: r.first }
}
const ahead = (x: CueRun) => wrap(x, resolve(x, x.si, x.ti + 1))

/** First item of the range's first turn, last item of its last turn; null without a range. */
export function repeatRange(script: Script, opts: CueOptions): { from: string; to: string } | null {
  const r = rangeOf({ script, opts })
  if (!r) return null
  const turns = turnsOf({ script, opts }, r.si)
  return { from: turns[r.first][0].id, to: turns[r.last].at(-1)!.id }
}

function make(x: CueRun, state: CueState, turn: Turn, effects: CueEffect[]): Cue {
  const sceneId = x.script.scenes[x.si].id
  const to = state === 'done' ? null : ahead(x)
  const next = to ? turnsOf(x, to.si)[to.ti] : []
  const cue: Cue = { state, sceneId, turn, next, effects, position: () => ({ sceneId, itemId: turn[0]?.id ?? '' }) }
  runs.set(cue, x)
  return cue
}

function enter(x: CueRun, to: TurnPos | null, now: number, effects: CueEffect[] = []): Cue {
  if (!to) return make(x, 'done', [], [...effects, mic(false)])
  const y = { ...x, ...to, since: now }
  const turn = turnsOf(y, to.si)[to.ti]
  if (isMine(y, turn)) return make(y, 'waiting', turn, [...effects, mic(true)])
  const first = turn[0]
  if (first.type === 'line') return make(y, 'playing', turn, [...effects, mic(false), { type: 'play', itemIds: ids(turn) }])
  return make(y, first.type, turn, [...effects, mic(false)])
}

const stopIf = (c: Cue): CueEffect[] => (c.state === 'playing' || c.state === 'prompting' ? [{ type: 'stop' }] : [])

export function cueStart(script: Script, opts: CueOptions, at: { sceneId: string; itemId?: string; paused?: boolean }, now: number): Cue {
  const x: CueRun = {
    script,
    opts,
    si: Math.max(
      0,
      script.scenes.findIndex((s) => s.id === at.sceneId),
    ),
    ti: 0,
    since: now,
  }
  const ti = turnsOf(x, x.si).findIndex((t) => t.some((i) => i.id === at.itemId))
  const to = resolve(x, x.si, Math.max(0, ti))
  if (at.paused && to) return make({ ...x, ...to }, 'paused', turnsOf(x, to.si)[to.ti], [])
  return enter(x, to, now)
}

export function cueStep(cue: Cue, ev: CueEvent, now: number): Cue {
  const x = runs.get(cue)!
  const next = (pre: CueEffect[] = []) => enter(x, ahead(x), now, pre)
  const { state } = cue
  switch (ev.type) {
    case 'audioEnded':
      if (state === 'playing') return next()
      if (state === 'prompting') return make({ ...x, since: now }, 'waiting', cue.turn, [mic(true)])
      break
    case 'speechStart':
      if (state === 'waiting') return make(x, 'speaking', cue.turn, [])
      break
    case 'speechEnd':
      if (state === 'speaking') return next()
      break
    case 'tick':
      if (state === 'direction' && now - x.since >= x.opts.directionMs) return next()
      if (state === 'waiting' && now - x.since >= x.opts.hardTimeoutMs) return next([{ type: 'missed' }])
      break
    case 'tap':
    case 'skip':
      if (ev.type === 'skip' && state === 'playing') {
        const role = lineRole(cue.turn)
        let to = resolve(x, x.si, x.ti + 1)
        for (let n = 0; to && role !== undefined && n < 10000; n++) {
          const t = turnsOf(x, to.si)[to.ti]
          if (lineRole(t) !== role) break
          to = resolve(x, to.si, to.ti + 1)
        }
        return enter(x, wrap(x, to), now, stopIf(cue))
      }
      if (state === 'direction' || state === 'song' || state === 'waiting' || state === 'speaking') return next()
      break
    case 'back': {
      if (state === 'done' || state === 'paused') break
      let to: TurnPos = { si: x.si, ti: x.ti }
      if (x.ti > 0) to = { si: x.si, ti: x.ti - 1 }
      else
        for (let s = x.si - 1; s >= 0; s--) {
          const n = turnsOf(x, s).length
          if (n) {
            to = { si: s, ti: n - 1 }
            break
          }
        }
      return enter(x, to, now, stopIf(cue))
    }
    case 'prompt':
      if (state === 'waiting' || state === 'speaking') return make(x, 'prompting', cue.turn, [mic(false), { type: 'play', itemIds: ids(cue.turn) }])
      break
    case 'pause':
      if (state !== 'done' && state !== 'paused') return make(x, 'paused', cue.turn, [{ type: 'stop' }, mic(false)])
      break
    case 'resume':
      if (state === 'paused') return enter(x, x, now)
      break
  }
  return make(x, cue.state, cue.turn, [])
}

export function hintText(text: string, mode: 'show' | 'hide' | 'start'): string {
  if (mode === 'show') return text
  if (mode === 'hide') return ''
  const tokens = text.match(/\[[^\]]*\]|[^\s[]+/g) ?? []
  const isWord = (t: string) => !t.startsWith('[')
  if (tokens.filter(isWord).length <= 3) return text
  let end = 0
  for (let i = 0, n = 0; n < 3; i++) if (isWord(tokens[i]) && ++n) end = i + 1
  return `${tokens.slice(0, end).join(' ')} …`
}
