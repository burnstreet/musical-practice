// Editor view: the player's staff with a phrase band and a section band on its bar grid.
// Built as a second vite entry (`vite build --mode editor` -> web/lib/editor-view.js) for the vanilla editor in web/.

import { BASE, COLORS, draw, FONT, measurePage, pageContent, pagePoints, playheadX, staffPages } from '../app/draw/staff'

export { playheadX }

import { nearestBar } from '../app/repeat'
import type { Note, RoleId, Section, Song } from '../core/content'

/** A note as the editor JSON holds it (web/data/NN.json). */
export interface RawNote {
  start: number
  end: number
  midi: number
  lyric?: string | null
  syllable?: string
  role?: string
  phrase?: number
  phraseStart?: boolean
  beat?: number
  dur?: number
}
export interface RawSong {
  id: string
  notes: RawNote[]
}
export interface BandPhrase {
  number: number
  text: string
  start: number
  end: number
  /** Indices into the raw notes. */
  notes: number[]
}

const words = (n: RawNote) => n.syllable || n.lyric || ''

/** Phrases as the builder will derive them: split at phraseStart flags when any note has one, else grouped by `phrase`. */
export function phrasesOf(notes: RawNote[]): BandPhrase[] {
  const order = notes.map((_, i) => i).sort((a, b) => notes[a].start - notes[b].start)
  const flags = notes.some((n) => n.phraseStart)
  const out: BandPhrase[] = []
  let key: unknown
  for (const i of order) {
    const n = notes[i]
    if (!flags && n.phrase == null) continue
    const starts = out.length === 0 || (flags ? n.phraseStart : n.phrase !== key)
    key = n.phrase
    if (starts) out.push({ number: out.length + 1, text: '', start: n.start, end: n.end, notes: [] })
    const p = out.at(-1)!
    p.notes.push(i)
    p.end = Math.max(p.end, n.end)
    p.text = [p.text, words(n)].filter(Boolean).join(' ')
  }
  return out
}

/** The raw song in the player's shape, notes in raw order (index i = raw note i); each note in the grid bar nearest its start minus its beat. `beats` per bar, quarter beats. */
export function staffSong(raw: RawSong, bars: number[], key = 'C', beats = 4): Song {
  const quarter = (bars.length > 1 ? bars[1] - bars[0] : 2) / beats
  const notes: Note[] = raw.notes.map((n) => ({
    start: n.start,
    end: n.end,
    midi: n.midi,
    syllable: words(n),
    role: (n.role ?? '') as RoleId,
    phrase: 0,
    bar: nearestBar(bars, n.start - (n.beat ?? 0) * quarter),
    beat: n.beat ?? 0,
    dur: n.dur ?? 1,
  }))
  return { id: raw.id, bpm: 60 / quarter, key, timeSig: [beats, 4], bars, notes, phrases: [], sections: [] }
}

/** Song time at `x` between (time, x) points sorted by x: the inverse of `playheadX`, clamped to the ends. */
export function timeAt(points: [number, number][], x: number): number {
  const i = points.findIndex(([, px]) => px > x)
  if (i === -1) return points[points.length - 1][0]
  if (i === 0) return points[0][0]
  const [[t0, x0], [t1, x1]] = [points[i - 1], points[i]]
  return t0 + ((x - x0) / (x1 - x0)) * (t1 - t0)
}

/** Where a selection turns the view: the start of its first bar when no selected note is on the page, else null (stay). */
export function turnFor(song: Song, page: { first: number; count: number }, selected: Set<number>): number | null {
  const bars = [...selected].map((i) => song.notes[i]?.bar).filter((b) => b != null)
  if (!bars.length || bars.some((b) => b >= page.first && b < page.first + page.count)) return null
  return song.bars[Math.min(...bars)]
}

export interface View {
  song: Song
  phrases: BandPhrase[]
  sections: Section[]
  /** Roll playhead: the page holding it is shown. */
  t: number
  /** Selected raw note indices. */
  selected: Set<number>
  /** Selected band item, outlined. */
  pick?: { kind: 'phrase' | 'section'; index: number } | null
  names?: Record<string, string>
  /** A colour per role for notes, syllables and rests on the staff. */
  colours?: Record<string, string>
}
export interface Page {
  first: number
  count: number
  /** Song start of the previous and next page, null at the ends. */
  prev: number | null
  next: number | null
  /** x on the staff and band canvases of song time t (note onsets at their sung start). */
  xOf: (t: number) => number
  /** The roll's axis: (time, x) of the page's bar lines and its end; time runs linear inside each bar (`playheadX`, `timeAt`). */
  grid: [number, number][]
  /** Staff heads: x and the raw note indices sounding there. */
  heads: { x: number; notes: number[] }[]
}

/** Band rows on the band canvas, px. */
export const BAND = { phrase: [2, 26], section: [30, 54] } as const

/** Draws staff and bands for the page holding `v.t`; returns its geometry for hit tests. Null without contexts. */
export function drawView(staff: CanvasRenderingContext2D | null, bands: CanvasRenderingContext2D | null, v: View): Page | null {
  if (!staff || !bands) return null
  const { song } = v
  const shown = draw(staff, {
    song,
    roles: [],
    names: (v.names ?? {}) as Partial<Record<RoleId, string>>,
    colours: v.colours as Partial<Record<RoleId, string>> | undefined,
    t: v.t,
    frames: [],
    tolerance: 50,
  })
  if (!shown) return null
  const [first, count] = shown
  const w = staff.canvas.clientWidth
  const h = staff.canvas.clientHeight
  const content = pageContent(song, [], first, count)
  const L = measurePage(staff, song, content, w, h / BASE)
  const points = pagePoints(song, content, L)
  const xOf = (t: number) => playheadX(points, t)
  const grid: [number, number][] = [
    points[0],
    ...content.bars.slice(1).map((b, i): [number, number] => [song.bars[b], L.startX + L.barX[i + 1]]),
    points.at(-1)!,
  ]
  const heads = content.onsets.map((o, k) => ({ x: L.startX + L.xs[k], notes: o.here.map((n) => song.notes.indexOf(n)) })).filter((hd) => hd.notes.length)

  // selected notes on the staff: an outline around their heads
  const s = h / BASE
  staff.strokeStyle = COLORS.select
  staff.lineWidth = 2
  for (const hd of heads)
    if (hd.notes.some((i) => v.selected.has(i))) {
      staff.beginPath()
      staff.roundRect(hd.x - 12 * s, 24 * s, 24 * s, 54 * s, 6 * s)
      staff.stroke()
    }

  drawBands(bands, v, xOf, points[0][0], points.at(-1)![0], w)

  const pages = staffPages(staff, song, [], w, h)
  const at = pages.findIndex(([f]) => f === first)
  const prev = at > 0 ? song.bars[pages[at - 1][0]] : null
  const next = at >= 0 && at < pages.length - 1 ? song.bars[pages[at + 1][0]] : null
  return { first, count, prev, next, xOf, grid, heads }
}

function drawBands(ctx: CanvasRenderingContext2D, v: View, xOf: (t: number) => number, t0: number, t1: number, w: number) {
  const c = ctx.canvas
  const dpr = globalThis.devicePixelRatio || 1
  const [bw, bh] = [Math.round(w * dpr), Math.round(c.clientHeight * dpr)]
  if (c.width !== bw || c.height !== bh) [c.width, c.height] = [bw, bh]
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, c.clientHeight)
  ctx.font = `12px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const row = (items: { start: number; end: number; label: string; flag: boolean; picked: boolean }[], [y0, y1]: readonly [number, number], fill: string) => {
    for (const it of items) {
      if (it.end <= t0 || it.start >= t1) continue
      const x0 = xOf(Math.max(it.start, t0))
      const x1 = xOf(Math.min(it.end, t1))
      ctx.fillStyle = it.picked ? COLORS.accent : fill
      ctx.beginPath()
      ctx.roundRect(x0 + 1, y0, Math.max(2, x1 - x0 - 2), y1 - y0, 5)
      ctx.fill()
      if (it.flag && it.start >= t0) {
        ctx.fillStyle = COLORS.accent
        ctx.fillRect(x0, y0 - 2, 2, y1 - y0 + 4)
      }
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0 + 4, y0, Math.max(0, x1 - x0 - 8), y1 - y0)
      ctx.clip()
      ctx.fillStyle = it.picked ? COLORS.surface : COLORS.text
      ctx.fillText(it.label, x0 + 6, (y0 + y1) / 2)
      ctx.restore()
    }
  }
  const pick = (kind: string, i: number) => v.pick?.kind === kind && v.pick.index === i
  row(
    v.phrases.map((p, i) => ({ start: p.start, end: p.end, label: `${p.number} ${p.text}`, flag: true, picked: pick('phrase', i) })),
    BAND.phrase,
    COLORS.line,
  )
  row(
    v.sections.map((s, i) => ({ start: s.start, end: s.end, label: s.name, flag: false, picked: pick('section', i) })),
    BAND.section,
    COLORS.bg,
  )
}
