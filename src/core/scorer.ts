import type { Note, RoleId, Song } from './content'
import type { PitchFrame } from './types'

export type Tolerance = 75 | 50 | 30
export type Tendency = 'high' | 'low' | 'ok'

export interface NoteResult {
  note: Note
  sung: boolean
  cents: number | null
  hit: boolean
  maxAbsCents: number | null
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
  scoredNotes: number
  hits: number
  hitPct: number
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
  if (!cents.length) return { note, sung: false, cents: null, hit: false, maxAbsCents: null }
  const within = cents.filter((c) => Math.abs(c) <= tol).length
  return { note, sung: true, cents: median(cents), hit: within * 2 >= cents.length, maxAbsCents: Math.max(...cents.map(Math.abs)) }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** framesByNote: song note index -> frames of that entered note. Only entered notes of `roles` are scored. */
export function scorePass(song: Song, roles: RoleId[], framesByNote: Map<number, PitchFrame[]>, tol: Tolerance): PassResult {
  const scored = song.notes.flatMap((note, i) =>
    roles.includes(note.role) && framesByNote.has(i) ? [{ note, frames: considered(note, framesByNote.get(i)!) }] : [],
  )
  const notes = scored.map(({ note, frames }) => scoreNote(note, frames, tol))
  const all = scored.flatMap(({ note, frames }) => frames.map((f) => ({ cents: foldCents(f.midi, note.midi), midi: Math.round(f.midi) })))
  const meanCents = mean(all.map((f) => f.cents))
  const hits = notes.filter((n) => n.hit).length
  const midis = all.map((f) => f.midi)

  const byPhrase = new Map<number, NoteResult[]>()
  for (const r of notes) byPhrase.set(r.note.phrase, [...(byPhrase.get(r.note.phrase) ?? []), r])
  const phrases: PhraseResult[] = [...byPhrase]
    .sort(([a], [b]) => a - b)
    .map(([index, rs]) => ({
      index,
      label: song.phrases[index]?.label ?? '',
      notes: rs.length,
      sung: rs.filter((r) => r.sung).length,
      hits: rs.filter((r) => r.hit).length,
      meanCents: mean(rs.flatMap((r) => (r.cents === null ? [] : [r.cents]))),
    }))
  // largest |meanCents| (unsung phrase counts as 0), then more misses, then lower index (sort is stable)
  const worst = [...phrases].sort((a, b) => Math.abs(b.meanCents ?? 0) - Math.abs(a.meanCents ?? 0) || b.notes - b.hits - (a.notes - a.hits))[0]

  return {
    notes,
    phrases,
    scoredNotes: notes.length,
    hits,
    hitPct: notes.length ? Math.round((100 * hits) / notes.length) : 0,
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
  const max = Math.round(Math.max(0, ...rs.map((r) => r.maxAbsCents ?? 0)))
  const m = p.meanCents ?? 0
  if (m <= -tol / 2) return `Phrase ${n} ist zu tief. Ab „${syl}“ rutscht die Stimme um bis zu ${max} Cent ab. Übe die Stelle langsamer.`
  if (m >= tol / 2) return `Phrase ${n} ist zu hoch. Ab „${syl}“ steigt die Stimme um bis zu ${max} Cent. Übe die Stelle langsamer.`
  if (p.hits < p.notes) return `In Phrase ${n} fehlen ${p.notes - p.hits} Töne, ab „${syl}“. Sing die Stelle erst mit Voicetrack.`
  return 'Alles getroffen. Versuch das Lied einmal ohne Voicetrack.'
}
