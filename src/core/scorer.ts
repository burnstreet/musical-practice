import type { Note, PitchFrame } from './content'

export type Tolerance = 75 | 50 | 30

export interface NoteResult { note: Note; sung: boolean; cents: number | null; hit: boolean; maxAbsCents: number | null }

export function foldCents(sungMidi: number, targetMidi: number): number {
  const d = (sungMidi - targetMidi) * 100
  return d - 1200 * Math.ceil((d - 600) / 1200)
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
