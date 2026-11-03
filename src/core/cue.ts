import type { RoleId } from './content'
import type { Script, ScriptItem } from './types'

export type CueState = 'playing' | 'direction' | 'song' | 'waiting' | 'speaking' | 'prompting' | 'paused' | 'done'
export interface CueOptions {
  roles: RoleId[]
  hardTimeoutMs: number
  directionMs: number
  showDirections: boolean
  loopScene: boolean
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
  turn: ScriptItem[]
  effects: CueEffect[]
  position(): { sceneId: string; itemId: string }
}

export const CUE_DEFAULTS = { hardTimeoutMs: 20000, directionMs: 2500 }

interface At {
  si: number
  ti: number
}
interface Ctx extends At {
  script: Script
  opts: CueOptions
  since: number // clock of entering the turn
}
const ctxs = new WeakMap<Cue, Ctx>()

const turnsOf = ({ script, opts }: Ctx, si: number): ScriptItem[][] => {
  const mine = (i: ScriptItem) => i.type === 'line' && opts.roles.includes(i.role)
  const out: ScriptItem[][] = []
  for (const i of script.scenes[si].items.filter((i) => opts.showDirections || i.type !== 'direction')) {
    const last = out.at(-1)
    if (last && mine(i) && mine(last[0])) last.push(i)
    else out.push([i])
  }
  return out
}
const isMine = (x: Ctx, t: ScriptItem[]) => t[0].type === 'line' && x.opts.roles.includes(t[0].role)
const lineRole = (t: ScriptItem[]) => (t[0].type === 'line' ? t[0].role : undefined)
const ids = (t: ScriptItem[]) => t.map((i) => i.id)
const mic = (on: boolean): CueEffect => ({ type: 'mic', on })

/** Position past the end of a scene continues with the loop or the next scene; null after the last one. */
function resolve(x: Ctx, si: number, ti: number): At | null {
  let turns = turnsOf(x, si)
  while (ti >= turns.length) {
    si += x.opts.loopScene && turns.length ? 0 : 1
    ti = 0
    if (si >= x.script.scenes.length) return null
    turns = turnsOf(x, si)
  }
  return { si, ti }
}

function make(x: Ctx, state: CueState, turn: ScriptItem[], effects: CueEffect[]): Cue {
  const sceneId = x.script.scenes[x.si].id
  const cue: Cue = { state, sceneId, turn, effects, position: () => ({ sceneId, itemId: turn[0]?.id ?? '' }) }
  ctxs.set(cue, x)
  return cue
}

function enter(x: Ctx, to: At | null, now: number, effects: CueEffect[] = []): Cue {
  if (!to) return make(x, 'done', [], [...effects, mic(false)])
  const y = { ...x, ...to, since: now }
  const turn = turnsOf(y, to.si)[to.ti]
  if (isMine(y, turn)) return make(y, 'waiting', turn, [...effects, mic(true)])
  const first = turn[0]
  if (first.type === 'line') return make(y, 'playing', turn, [...effects, mic(false), { type: 'play', itemIds: ids(turn) }])
  return make(y, first.type, turn, [...effects, mic(false)])
}

const stopIf = (c: Cue): CueEffect[] => (c.state === 'playing' || c.state === 'prompting' ? [{ type: 'stop' }] : [])

export function cueStart(script: Script, opts: CueOptions, at: { sceneId: string; itemId?: string }, now: number): Cue {
  const x: Ctx = {
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
  return enter(x, resolve(x, x.si, Math.max(0, ti)), now)
}

export function cueStep(cue: Cue, ev: CueEvent, now: number): Cue {
  const x = ctxs.get(cue)!
  const next = (pre: CueEffect[] = []) => enter(x, resolve(x, x.si, x.ti + 1), now, pre)
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
        return enter(x, to, now, stopIf(cue))
      }
      if (state === 'direction' || state === 'song' || state === 'waiting' || state === 'speaking') return next()
      break
    case 'back': {
      if (state === 'done' || state === 'paused') break
      let to: At = { si: x.si, ti: x.ti }
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
