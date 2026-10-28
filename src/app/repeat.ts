import type { Range } from '../core/audio-engine'
import { type Phrase, type RoleId, roleSpans, type Section, type Song, type Span } from '../core/content'

/** Length of the bar that holds `t` (the last bar uses the one before it). */
function barLength(bars: number[], t: number): number {
  const i = Math.max(0, bars.filter((b) => b <= t).length - 1)
  return i + 1 < bars.length ? bars[i + 1] - bars[i] : i > 0 ? bars[i] - bars[i - 1] : Infinity
}

/** Role spans of my roles, merged when the gap between two is below one bar (the bar that holds the gap start). For skip and the Einsatz repeat. */
export function ownSpans(song: Pick<Song, 'bars' | 'notes'>, roles: RoleId[]): Span[] {
  const merged: Span[] = []
  for (const s of roleSpans(song.notes, roles)) {
    const last = merged.at(-1)
    if (last && s.start - last.end < barLength(song.bars, last.end)) last.end = Math.max(last.end, s.end)
    else merged.push({ ...s })
  }
  return merged
}

/** Index of the bar line nearest to `t` (0 without bars). */
export function nearestBar(bars: number[], t: number): number {
  return bars.reduce((best, b, i) => (Math.abs(b - t) < Math.abs(bars[best] - t) ? i : best), 0)
}

/** The bar line nearest to `t`. */
export function snapToBar(bars: number[], t: number): number {
  return bars[nearestBar(bars, t)] ?? 0
}

/** Phrase repeat range: exactly the phrase, no lead-in. */
export const rangeOfPhrase = (p: Phrase): Range => ({ start: p.start, end: p.end, phrase: p })

/** Abschnitt or Einsatz repeat range: restarts from the lead-in. */
export const leadInRange = (s: Span): Range => ({ start: s.start, end: s.end, leadIn: true })

/** The phrase holding `now`, else the next one, else the last. */
export function phraseRange(song: Song, now: number): Range {
  return rangeOfPhrase(song.phrases.find((x) => x.end > now) ?? song.phrases.at(-1)!)
}

/** The section holding `now`, else the next one; null when none is left. */
export function sectionAt(song: Song, now: number): Section | null {
  return song.sections.find((s) => s.end > now) ?? null
}

/** The own span holding `now`, else the next one; null when none is left. */
export function einsatzRange(song: Song, roles: RoleId[], now: number): Range | null {
  const s = ownSpans(song, roles).find((x) => x.end > now)
  return s ? leadInRange(s) : null
}

/** A–B from two points already snapped to bar lines: swapped when B < A, B on A's bar line moves to the next one (or the song end). */
export function abRange(bars: number[], a: number, b: number, songEnd: number): Range {
  const [start, end] = a <= b ? [a, b] : [b, a]
  return { start, end: end > start ? end : (bars.find((x) => x > start) ?? songEnd) }
}
