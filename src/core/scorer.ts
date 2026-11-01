import type { Note, RoleId, Song } from './content'
import type { PitchFrame } from './types'

export type Tolerance = 75 | 50 | 30
export type Tendency = 'high' | 'low' | 'ok'

/** How the singer came in after a rest (Einsatz). */
export interface Entry {
  ms: number | null
  cents: number | null
  timing: 'early' | 'ok' | 'late' | null
  approach: 'below' | 'ok' | 'above' | null
  clean: boolean
  /** [ms from note start, folded cents] of voiced frames around the start, for the picture. */
  curve: [number, number][]
}
export interface NoteResult {
  note: Note
  sung: boolean
  cents: number | null
  hit: boolean
  maxAbsCents: number | null
  /** null: not an entry. */
  entry: Entry | null
}
export interface PhraseResult {
  index: number
  label: string
  notes: number
  sung: number
  hits: number
  meanCents: number | null
}
export interface PassResult {
  notes: NoteResult[]
  phrases: PhraseResult[]
  /** Like phrases, per `song.sections` entry; `index` into it, `label` its name. */
  sections: PhraseResult[]
  scoredNotes: number
  hits: number
  hitPct: number
  /** Sung notes not hit, below / at or above the target. */
  low: number
  high: number
  meanCents: number | null
  tendency: Tendency
  rangeMidi: [number, number] | null
  worstPhrase: number | null
  tip: string
}

export function foldCents(sungMidi: number, targetMidi: number): number {
  const d = (sungMidi - targetMidi) * 100
  return d - 1200 * Math.ceil((d - 600) / 1200)
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
/** English note name with sharps, without octave (octaves are folded everywhere). Rounds fractional midi. */
export function noteName(midi: number): string {
  const m = Math.round(midi)
  return NAMES[((m % 12) + 12) % 12]
}

export interface LiveDeviation {
  note: Note
  sungMidiFolded: number
  cents: number
  level: 'ok' | 'slight' | 'far'
}

/** Live readout: the latest voiced frame (`t`) within 150 ms before the heard time `t` vs my note sounding at that moment. Cents rounded. */
export function liveDeviation(song: Song, roles: RoleId[], t: number, frames: PitchFrame[], tol: Tolerance): LiveDeviation | null {
  const sung = [...frames].reverse().find((f) => f.midi !== null && f.t >= t - 0.15 && f.t <= t)
  const note = sung && [...song.notes].reverse().find((n) => roles.includes(n.role) && n.start <= sung.t && sung.t <= n.end)
  if (!note || !sung || note.spoken) return null
  const cents = Math.round(foldCents(sung.midi!, note.midi))
  const level = Math.abs(cents) <= 15 ? 'ok' : Math.abs(cents) <= tol ? 'slight' : 'far'
  return { note, sungMidiFolded: note.midi + cents / 100, cents, level }
}

/** Voiced frames after the onset grace of 0.1 s. */
const considered = (note: Note, frames: PitchFrame[]) =>
  frames.filter((f): f is PitchFrame & { midi: number } => f.midi !== null && f.t >= note.start + 0.1 && f.t <= note.end)

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function scoreNote(note: Note, frames: PitchFrame[], tol: Tolerance): NoteResult {
  const cents = considered(note, frames).map((f) => foldCents(f.midi, note.midi))
  if (!cents.length) return { note, sung: false, cents: null, hit: false, maxAbsCents: null, entry: null }
  const within = cents.filter((c) => Math.abs(c) <= tol).length
  return { note, sung: true, cents: median(cents), hit: within * 2 >= cents.length, maxAbsCents: Math.max(...cents.map(Math.abs)), entry: null }
}

/** Seconds before a note's start whose frames still belong to its entry. */
export const ENTRY_PRE = 0.3

/** After a rest: nothing of my roles sounds within a quarter before note i; a new phrase needs only a gap over 0.05 s. */
function isEntry(song: Song, roles: RoleId[], i: number): boolean {
  const n = song.notes[i]
  const before = song.notes.filter((m, k) => k !== i && roles.includes(m.role) && m.start < n.start)
  if (!before.length) return true
  const last = before.reduce((a, b) => (b.end > a.end ? b : a))
  const gap = n.start - last.end
  return gap >= (n.end - n.start) / n.dur - 1e-6 || (gap > 0.05 && last.phrase !== n.phrase)
}

function entry(note: Note, frames: PitchFrame[], tol: Tolerance): Entry {
  const at = (f: PitchFrame) => f.t - note.start
  const voiced = frames.filter((f): f is PitchFrame & { midi: number } => f.midi !== null && at(f) >= -ENTRY_PRE).sort((a, b) => a.t - b.t)
  const curve = voiced.filter((f) => at(f) <= 0.6).map((f): [number, number] => [Math.round(at(f) * 1000), Math.round(foldCents(f.midi, note.midi))])
  const onset = voiced[0]
  if (!onset || at(onset) > 0.5) return { ms: null, cents: null, timing: null, approach: null, clean: false, curve }
  const ms = Math.round(at(onset) * 1000)
  const cents = median(voiced.filter((f) => f.t <= onset.t + 0.1).map((f) => foldCents(f.midi, note.midi)))
  const timing = ms < -80 ? 'early' : ms > 80 ? 'late' : 'ok'
  const approach = cents < -tol ? 'below' : cents > tol ? 'above' : 'ok'
  return { ms, cents, timing, approach, clean: timing === 'ok' && approach === 'ok', curve }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

const stats = (index: number, label: string, rs: NoteResult[]): PhraseResult => ({
  index,
  label,
  notes: rs.length,
  sung: rs.filter((r) => r.sung).length,
  hits: rs.filter((r) => r.hit).length,
  meanCents: mean(rs.flatMap((r) => (r.cents === null ? [] : [r.cents]))),
})

/** framesByNote: song note index -> frames of that entered note. Only entered notes of `roles` are scored. */
export function scorePass(song: Song, roles: RoleId[], framesByNote: Map<number, PitchFrame[]>, tol: Tolerance): PassResult {
  const scored = song.notes.flatMap((note, i) =>
    roles.includes(note.role) && framesByNote.has(i) ? [{ note, i, raw: framesByNote.get(i)!, frames: considered(note, framesByNote.get(i)!) }] : [],
  )
  const notes = scored.map(({ note, i, raw, frames }) => ({ ...scoreNote(note, frames, tol), entry: isEntry(song, roles, i) ? entry(note, raw, tol) : null }))
  const all = scored.flatMap(({ note, frames }) => frames.map((f) => ({ cents: foldCents(f.midi, note.midi), midi: Math.round(f.midi) })))
  const meanCents = mean(all.map((f) => f.cents))
  const hits = notes.filter((n) => n.hit).length
  const midis = all.map((f) => f.midi)
  const missed = notes.filter((n) => n.sung && !n.hit)

  const byPhrase = new Map<number, NoteResult[]>()
  for (const r of notes) byPhrase.set(r.note.phrase, [...(byPhrase.get(r.note.phrase) ?? []), r])
  const phrases = [...byPhrase].sort(([a], [b]) => a - b).map(([index, rs]) => stats(index, song.phrases[index]?.label ?? '', rs))
  const sections = song.sections.flatMap((s, index) => {
    const rs = notes.filter((r) => s.start <= r.note.start && r.note.start < s.end)
    return rs.length ? [stats(index, s.name, rs)] : []
  })
  // largest |meanCents| (unsung phrase counts as 0), then more misses, then lower index (sort is stable)
  const worst = [...phrases].sort((a, b) => Math.abs(b.meanCents ?? 0) - Math.abs(a.meanCents ?? 0) || b.notes - b.hits - (a.notes - a.hits))[0]

  return {
    notes,
    phrases,
    sections,
    scoredNotes: notes.length,
    hits,
    hitPct: notes.length ? Math.round((100 * hits) / notes.length) : 0,
    low: missed.filter((n) => n.cents! < 0).length,
    high: missed.filter((n) => n.cents! >= 0).length,
    meanCents,
    tendency: meanCents === null ? 'ok' : meanCents > 15 ? 'high' : meanCents < -15 ? 'low' : 'ok',
    rangeMidi: midis.length ? [Math.min(...midis), Math.max(...midis)] : null,
    worstPhrase: worst?.index ?? null,
    tip: worst ? tip(worst, byPhrase.get(worst.index)!, tol) : 'Keine Töne gesungen.',
  }
}

function tip(p: PhraseResult, rs: NoteResult[], tol: Tolerance): string {
  const n = p.index + 1
  // shortcut: falls back to the phrase's first note when no note is off or unsung (only reachable by a flat/sharp mean within tol)
  const syl = (rs.find((r) => r.cents !== null && Math.abs(r.cents) > tol) ?? rs.find((r) => !r.sung) ?? rs[0]).note.syllable
  const m = p.meanCents ?? 0
  if (m <= -tol / 2) return `Phrase ${n} ist zu tief. Ab „${syl}“ rutscht die Stimme ab. Übe die Stelle langsamer.`
  if (m >= tol / 2) return `Phrase ${n} ist zu hoch. Ab „${syl}“ steigt die Stimme. Übe die Stelle langsamer.`
  if (p.hits < p.notes) return `In Phrase ${n} fehlen ${p.notes - p.hits} Töne, ab „${syl}“. Sing die Stelle erst mit Voicetrack.`
  return 'Alles getroffen. Versuch das Lied einmal ohne Voicetrack.'
}
