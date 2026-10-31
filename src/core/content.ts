export type { PitchFrame } from './types'

// Role ids are defined by the production (builder config), not by the app.
export type RoleId = string
const ROLE_ID = /^[a-z][a-z0-9_-]*$/

export interface Manifest {
  format: 1 | 2
  build: string
  keyId: string
  salt: string
  iterations: number
  library: string
  songCount: number
  totalBytes: number
  files: Record<string, number>
}
export interface Role {
  id: RoleId
  name: string
  sings: boolean
}
export interface SongMeta {
  id: string
  number: number
  title: string
  durationSec: number
  roles: RoleId[]
  files: { voices: string; backing: string; notes: string }
}
export interface Library {
  roles: Role[]
  songs: SongMeta[]
}
export interface Note {
  start: number
  end: number
  midi: number
  syllable: string
  role: RoleId
  phrase: number
  bar: number
  beat: number
  dur: number
  /** Spoken or rapped: rhythm and syllable only, `midi` ignored, never scored. */
  spoken?: boolean
  /** A slur starts here: the staff draws an arc to the next note of the same role. */
  slur?: boolean
  /** Tied to the next note of the same role (same pitch): drawn with an arc, scored together as one note. */
  tie?: boolean
}
export interface Phrase {
  index: number
  label: string
  start: number
  end: number
}
export interface Section {
  name: string
  start: number
  end: number
}
export interface Song {
  id: string
  bpm: number
  key: string
  timeSig: [number, number]
  bars: number[]
  notes: Note[]
  phrases: Phrase[]
  /** Empty when the file has none. */
  sections: Section[]
}
export interface Span {
  start: number
  end: number
}

export class ContentError extends Error {
  constructor(
    public field: string,
    message = `invalid ${field}`,
  ) {
    super(message)
  }
}

const ID = /^[0-9a-f]{16}$/
const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
function need(ok: boolean, field: string): void {
  if (!ok) throw new ContentError(field)
}

export function parseManifest(json: unknown): Manifest {
  need(isObj(json), 'manifest')
  const m = json as Record<string, any>
  need(m.format === 1 || m.format === 2, 'format')
  need(isStr(m.build), 'build')
  need(isStr(m.keyId) && ID.test(m.keyId), 'keyId')
  need(isStr(m.salt) && /^[A-Za-z0-9+/]{22}==$/.test(m.salt), 'salt') // 16 bytes = 22 chars + ==
  need(isNum(m.iterations), 'iterations')
  need(isStr(m.library) && ID.test(m.library), 'library')
  need(isNum(m.songCount), 'songCount')
  need(isNum(m.totalBytes), 'totalBytes')
  need(isObj(m.files) && Object.entries(m.files).every(([id, n]) => ID.test(id) && isNum(n)), 'files')
  return m as Manifest
}

export function parseLibrary(input: unknown): Library {
  const json = input as Record<string, any>
  need(isObj(input) && Array.isArray(json.roles) && Array.isArray(json.songs), 'library')
  for (const r of json.roles) need(isObj(r) && isStr(r.id) && ROLE_ID.test(r.id) && isStr(r.name) && typeof r.sings === 'boolean', 'roles')
  const inLibrary = new Set<string>(json.roles.map((r: Role) => r.id))
  for (const s of json.songs) {
    need(isObj(s) && isStr(s.id) && isNum(s.number) && isStr(s.title) && isNum(s.durationSec), 'songs')
    need(Array.isArray(s.roles) && s.roles.every((r: unknown) => isStr(r) && inLibrary.has(r)), 'roles')
    need(isObj(s.files) && ['voices', 'backing', 'notes'].every((k) => isStr(s.files[k]) && ID.test(s.files[k])), 'files')
  }
  return { roles: json.roles, songs: [...json.songs].sort((a, b) => a.number - b.number) }
}

export function parseSong(input: unknown): Song {
  const json = input as Record<string, any>
  need(isObj(input) && isStr(json.id) && isNum(json.bpm) && isStr(json.key), 'song')
  need(Array.isArray(json.timeSig) && json.timeSig.length === 2 && json.timeSig.every(isNum), 'timeSig')
  need(Array.isArray(json.bars) && json.bars.every(isNum), 'bars')
  need(Array.isArray(json.notes) && Array.isArray(json.phrases), 'song')
  const used = new Set<number>()
  json.notes.forEach((n: any, i: number) => {
    need(isObj(n) && isNum(n.start) && isNum(n.end) && n.end > n.start, 'notes')
    need(Number.isInteger(n.midi) && n.midi >= 36 && n.midi <= 96, 'notes')
    need(isStr(n.role) && isStr(n.syllable) && isNum(n.bar) && isNum(n.beat) && isNum(n.dur), 'notes')
    need(n.spoken === undefined || typeof n.spoken === 'boolean', 'notes')
    need(n.slur === undefined || typeof n.slur === 'boolean', 'notes')
    need(n.tie === undefined || typeof n.tie === 'boolean', 'notes')
    need(i === 0 || n.start >= json.notes[i - 1].start, 'notes')
    need(Number.isInteger(n.phrase) && n.phrase >= 0 && n.phrase < json.phrases.length, 'phrase')
    used.add(n.phrase)
  })
  json.phrases.forEach((p: any, i: number) => {
    need(isObj(p) && isStr(p.label) && isNum(p.start) && isNum(p.end), 'phrases')
    need(used.has(i), 'phrase')
  })
  const sections = json.sections ?? []
  need(Array.isArray(sections), 'sections')
  sections.forEach((s: any, i: number) => {
    need(isObj(s) && isStr(s.name) && s.name !== '' && isNum(s.start) && isNum(s.end) && s.end > s.start, 'sections')
    need(i === 0 || s.start >= sections[i - 1].end, 'sections')
  })
  return { ...json, sections } as Song
}

/** Notes staff, roll and session use: my unison duplicates once, other roles hidden while I sing. Order kept. */
export function visibleNotes(notes: Note[], roles: RoleId[]): Note[] {
  const mine = notes.filter((n) => roles.includes(n.role))
  const seen = new Set<string>()
  return notes.filter((n) => {
    if (!roles.includes(n.role)) return !mine.some((m) => m.start < n.end && n.start < m.end)
    const key = `${n.start}|${n.end}|${n.midi}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Index of the note a tie or slur of `notes[i]` leads to, -1 if none: the later note of its role whose start is nearest
 * to its end. Not simply the next one, as aligned notes can overlap and a later note may start first.
 */
export function arcTarget(notes: Note[], i: number): number {
  let best = -1
  const gap = (k: number) => Math.abs(notes[k].start - notes[i].end)
  for (let k = i + 1; k < notes.length; k++) if (notes[k].role === notes[i].role && (best < 0 || gap(k) < gap(best))) best = k
  return best
}

/**
 * The notes with every tie chain joined for scoring: its first note spans to the chain's end (`dur` summed), `tiedIn`
 * holds the indices of the notes tied into it. Indices and order kept.
 */
export function joinTies(notes: Note[]): { notes: Note[]; tiedIn: Set<number> } {
  const out = [...notes]
  const tiedIn = new Set<number>()
  // backwards, so a chain's middle note already reaches the chain's end when its head takes it over
  for (let i = notes.length - 1; i >= 0; i--) {
    if (!notes[i].tie) continue
    const j = arcTarget(notes, i)
    if (j < 0 || notes[j].midi !== notes[i].midi) continue
    out[i] = { ...notes[i], end: out[j].end, dur: notes[i].dur + out[j].dur }
    tiedIn.add(j)
  }
  return { notes: out, tiedIn }
}

/** A syllable without its trailing `-`, and whether its word goes on (see content-format). A lone `-` stays. */
export function splitHyphen(syllable: string): { text: string; hyphen: boolean } {
  const hyphen = syllable.length > 1 && syllable.endsWith('-')
  return { text: hyphen ? syllable.slice(0, -1) : syllable, hyphen }
}

/** Syllables in order as words: one ending in `-` runs on into the next, the others are separated by a space. */
export function joinSyllables(syllables: string[]): string {
  let out = ''
  for (const s of syllables.filter(Boolean)) out = !out ? s : splitHyphen(out).hyphen ? splitHyphen(out).text + s : `${out} ${s}`
  return out
}

export function roleSpans(notes: Note[], roles: RoleId[]): Span[] {
  const spans: Span[] = []
  for (const n of notes.filter((n) => roles.includes(n.role)).sort((a, b) => a.start - b.start)) {
    const last = spans.at(-1)
    if (last && n.start - last.end < 0.5) last.end = Math.max(last.end, n.end)
    else spans.push({ start: n.start, end: n.end })
  }
  return spans
}
