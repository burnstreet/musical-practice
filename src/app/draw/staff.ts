import { arcTarget, type Note, type RoleId, type Song, visibleNotes } from '../../core/content'
import type { Tolerance } from '../../core/scorer'
import type { PitchFrame } from '../../core/types'

/** What the practice screen hands both canvases on every update. */
export interface DrawState {
  song: Song
  /** The singer's role set: "my" notes are the ones whose role is in here. */
  roles: RoleId[]
  /** Display names of the library roles, for the labels above the staff. */
  names: Partial<Record<RoleId, string>>
  /** Song time of the playhead in seconds. */
  t: number
  /** Pitch frames of the last 1.5 s (by scoring stamp `t`, the heard time), oldest first; `midi: null` breaks the sung line. */
  frames: PitchFrame[]
  tolerance: Tolerance
  /** Active repeat: everything outside start…end is dimmed; flags [time, label] mark it. Drawing only. */
  repeat?: Marks | null
  /** A colour per role (the editor); roles without one, and the player, use accent for mine and other for the rest. */
  colours?: Partial<Record<RoleId, string>>
  /** Bars per page, fixed (the editor's zoom); without it `staffPages` picks them. */
  bars?: number
}

/** Colour of a note, syllable or rest: its role's colour when `colours` has one, else mine or other. */
export function noteColour(role: RoleId, mine: boolean, colours?: Partial<Record<RoleId, string>>): string {
  return colours?.[role] ?? (mine ? COLORS.accent : COLORS.other)
}

export interface Marks {
  start: number
  end: number
  flags: [number, string][]
}

/** Dims x < from and x > to (canvas `h` high) by painting the card colour over them. */
export function dimOutside(ctx: CanvasRenderingContext2D, left: number, from: number, to: number, right: number, h: number): void {
  ctx.fillStyle = COLORS.surface
  ctx.globalAlpha = 0.6
  if (from > left) ctx.fillRect(left, 0, from - left, h)
  if (to < right) ctx.fillRect(to, 0, right - to, h)
  ctx.globalAlpha = 1
}

/** tokens.css values (a canvas cannot use custom properties directly); `select` = the editor's selection orange, as in its roll. */
export const COLORS = {
  bg: '#1F5FAB',
  select: '#F08C14',
  accent: '#C8E05A',
  other: '#A9D3F7',
  muted: '#CFE0F5',
  line: '#3F78BF',
  surface: '#17498C',
  text: '#FFFFFF',
}
export const FONT = "'DM Sans', system-ui, sans-serif"
const MUSIC = "'Noto Music', 'Segoe UI Symbol', 'Apple Symbols', serif"

const MAJOR: Record<string, number> = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  'F#': 6,
  'C#': 7,
  'G#': 8,
  'D#': 9,
  'A#': 10,
  F: -1,
  Bb: -2,
  Eb: -3,
  Ab: -4,
  Db: -5,
  Gb: -6,
  Cb: -7,
}
const LETTERS = 'CDEFGAB'
const NATURAL = [0, 2, 4, 5, 7, 9, 11]
const SHARP_ORDER = 'FCGDAEB'
const FLAT_ORDER = 'BEADGCF'
/** Staff steps (from E4) of the key signature glyphs, treble clef. */
const SHARP_STEPS = [8, 5, 9, 6, 3, 7, 4]
const FLAT_STEPS = [4, 7, 3, 6, 2, 5, 1]
const GLYPH = { '#': '♯', b: '♭', n: '♮' }

/** Key signature of `song.key` (`F`, `Ebm`): sharps positive, flats negative. */
export function keyFifths(key: string): number {
  const minor = key.endsWith('m')
  return (MAJOR[minor ? key.slice(0, -1) : key] ?? 0) - (minor ? 3 : 0)
}

const shifts = new WeakMap<Song, number>()

/**
 * Semitones (0 or a multiple of 12) the staff writes a song above its sounding pitch: songs whose middle note lies
 * below B3 are drawn as for a treble clef with an 8 underneath, so low voices stay on the lines.
 */
export function octaveShift(song: Song): number {
  let shift = shifts.get(song)
  if (shift === undefined) {
    const midis = song.notes
      .filter((n) => !n.spoken)
      .map((n) => n.midi)
      .sort((a, b) => a - b)
    const median = midis.length ? midis[midis.length >> 1] : 64
    shift = median < 59 ? 12 * Math.ceil((59 - median) / 12) : 0
    shifts.set(song, shift)
  }
  return shift
}

/** Staff position of a note as written: a spoken note (no pitch) on the middle line, else its midi plus `octaveShift`. */
export function notePos(n: Note, song: Song, fifths: number): ReturnType<typeof staffPos> {
  return n.spoken ? { step: 4, acc: '' } : staffPos(n.midi + octaveShift(song), fifths)
}

/**
 * Treble staff position of a midi in a key: `step` 0 = bottom line E4, 2 per line.
 * `acc` = accidental to print ('n' = natural), '' when the key signature covers it.
 * shortcut: black keys spelled sharp in sharp keys, flat otherwise (no E#/Cb); upgrade if a song in F#/Gb shows up.
 */
export function staffPos(midi: number, fifths: number): { step: number; acc: '' | '#' | 'b' | 'n' } {
  const pc = ((midi % 12) + 12) % 12
  const oct = Math.floor(midi / 12) - 1
  const keyAcc = (l: string) =>
    fifths > 0 && SHARP_ORDER.slice(0, fifths).includes(l) ? '#' : fifths < 0 && FLAT_ORDER.slice(0, -fifths).includes(l) ? 'b' : ''
  let i = NATURAL.indexOf(pc)
  let acc: '' | '#' | 'b' | 'n'
  if (i >= 0) acc = keyAcc(LETTERS[i]) ? 'n' : ''
  else {
    const alt = fifths >= 0 ? '#' : 'b'
    i = NATURAL.indexOf(alt === '#' ? pc - 1 : pc + 1)
    acc = keyAcc(LETTERS[i]) === alt ? '' : alt
  }
  return { step: (oct - 4) * 7 + i - 2, acc }
}

/** Most bars per staff page for the canvas CSS width: one per 150 px, 2…4 (phone 2, sideways 3, wide 4). */
export const barsPerPage = (cssWidth: number): number => Math.max(2, Math.min(4, Math.floor(cssWidth / 150)))

/** Staff page (`per` bars) for the playhead; flips when the playhead enters bar per·k. */
export const pageOf = (bars: number[], t: number, per: number) => Math.floor(Math.max(0, bars.filter((b) => b <= t).length - 1) / per)

/** Written values in quarters, sixteenth to whole, dotted up to the dotted half. */
const VALUES = [0.25, 0.5, 1, 2, 4].flatMap((base) => (base < 4 ? [false, true] : [false]).map((dot) => ({ base, dot })))
/** Written value for a `dur` in quarters: the nearest value by ratio (1.4 → dotted quarter, 5 → whole). */
export function noteValue(dur: number): { base: number; dot: boolean } {
  const off = (v: { base: number; dot: boolean }) => Math.abs(Math.log((v.base * (v.dot ? 1.5 : 1)) / dur))
  return VALUES.reduce((a, v) => (off(v) < off(a) ? v : a))
}

/** Rest values, longest first; a value only starts on a multiple of itself from the bar start. No dotted rests. */
const REST_VALUES = [2, 1, 0.5, 0.25]
const snap = (beat: number) => Math.round(beat * 4) / 4
/**
 * Rests of one bar (beats in quarters from the bar start) for the spans no note covers. `len` of a note = its written
 * value. Gap ends snap to the sixteenth grid, so gaps under 1/8 beat vanish. An empty bar gets one whole-bar rest.
 */
export function restsIn(notes: { beat: number; len: number }[], barQ: number): { beat: number; len: number }[] {
  if (!notes.length) return [{ beat: 0, len: barQ }]
  const rests: { beat: number; len: number }[] = []
  let covered = 0
  const fill = (from: number, to: number) => {
    let p = snap(from)
    const end = Math.min(snap(to), barQ)
    while (p < end) {
      const v = REST_VALUES.find((v) => p + v <= end && Math.abs(p / v - Math.round(p / v)) < 1e-9)!
      rests.push({ beat: p, len: v })
      p += v
    }
  }
  for (const n of [...notes].sort((a, b) => a.beat - b.beat)) {
    if (n.beat > covered) fill(covered, n.beat)
    covered = Math.max(covered, n.beat + n.len)
  }
  fill(covered, barQ)
  return rests
}

/** Engraver-style spacing: room grows with duration ^ 0.6, not linearly. */
const SPACING = 0.6
/**
 * x offsets (0..width) of the distinct sorted onsets (beats) of one bar. Segments: the lead-in before the first onset
 * (room for a rest), then each onset to the next or the bar end. Each gets room ∝ its time ^ SPACING, but at least
 * `mins[segment]` (length onsets + 1); short segments take their minimum, long ones give it up. Minimums that do not
 * fit are scaled down together.
 */
export function layoutBar(onsets: number[], barQ: number, width: number, mins: number[]): number[] {
  if (!onsets.length) return []
  const total = mins.reduce((a, v) => a + v, 0)
  const min = total > width ? mins.map((v) => (v * width) / total) : mins
  const weights = [Math.max(0, onsets[0]), ...onsets.map((o, i) => Math.max(0, (onsets[i + 1] ?? Math.max(barQ, o)) - o))].map((d) => d ** SPACING)
  const fixed = weights.map(() => false)
  let scale = 0
  for (;;) {
    const free = width - min.reduce((a, v, i) => a + (fixed[i] ? v : 0), 0)
    const freeWeight = weights.reduce((a, w, i) => a + (fixed[i] ? 0 : w), 0)
    scale = freeWeight > 0 ? free / freeWeight : 0
    const short = weights.findIndex((w, i) => !fixed[i] && w * scale < min[i])
    if (short < 0) break
    fixed[short] = true
  }
  const room = weights.map((w, i) => (fixed[i] ? min[i] : w * scale))
  const xs: number[] = []
  let x = room[0]
  onsets.forEach((_, i) => {
    xs.push(x)
    x += room[i + 1]
  })
  return xs
}

/** One distinct onset of a page: its bar, beat, syllable width at the normal font (0 = none), accidental in front. */
export interface PageOnset {
  bar: number
  beat: number
  label: number
  acc: boolean
}
/** px: head = closest heads, +acc before an accidental; pad = bar line to first head; tail = last head to bar line; sep = between labels. */
export interface PageOptions {
  barQ: number
  width: number
  /** Room left of the page start (clef, key) a first label may use. */
  leftRoom: number
  head: number
  acc: number
  pad: number
  tail: number
  sep: number
  empty: number
  minScale: number
}
export interface PageLayout {
  /** Per page bar: start and width, from the page start. */
  barX: number[]
  barW: number[]
  /** Per onset, from the page start. */
  xs: number[]
  /** Lyric font factor. */
  scale: number
  /** Every head and label fits without squeezing. */
  fits: boolean
}

/** Minimum segments per bar ([lead, …segments], [] for an empty bar) so heads and labels of `L` (label widths) fit. */
function pageMins(bars: number[], onsets: PageOnset[], L: number[], o: PageOptions): number[][] {
  const n = onsets.length
  const need = (k: number) => Math.max(o.head + (onsets[k + 1].acc ? o.acc : 0), (L[k] + L[k + 1]) / 2 + o.sep)
  const left = n ? L[0] / 2 + o.sep / 2 - o.leftRoom : 0
  const right = n ? L[n - 1] / 2 + o.sep / 2 : 0
  const out: number[][] = []
  let k = 0
  let lead = Math.max(o.pad, left)
  for (const b of bars) {
    const idx: number[] = []
    while (k < n && onsets[k].bar === b) idx.push(k++)
    if (!idx.length) {
      out.push([])
      continue
    }
    const m = [lead, ...idx.slice(0, -1).map(need)]
    const last = idx.at(-1)!
    if (last + 1 < n) {
      // the gap over the bar line is split between this tail and the next lead
      const gap = need(last)
      lead = Math.max(o.pad, gap / 2)
      m.push(Math.max(o.tail, gap - lead))
    } else m.push(Math.max(o.tail, right))
    out.push(m)
  }
  return out
}

/**
 * Lays out one staff page so every syllable is drawn on one row and none overlaps another: minimum distances cover
 * heads and half of each neighbour's label, bar widths follow their minimum widths. Too dense: shrink the lyric font
 * down to `minScale`. Still too dense: squeezed (`fits` false; the page split gives such a page fewer bars).
 */
export function layoutPage(bars: number[], onsets: PageOnset[], o: PageOptions): PageLayout {
  const sum = (xs: number[]) => xs.reduce((a, v) => a + v, 0)
  const build = (scale: number): PageLayout => {
    const mins = pageMins(
      bars,
      onsets,
      onsets.map((p) => p.label * scale),
      o,
    )
    const need = mins.map((m) => (m.length ? sum(m) : o.empty))
    const barW = need.map((m) => (o.width * m) / sum(need))
    const barX = barW.map((_, i) => sum(barW.slice(0, i)))
    const xs = bars.flatMap((b, i) =>
      layoutBar(
        onsets.filter((p) => p.bar === b).map((p) => p.beat),
        o.barQ,
        barW[i],
        mins[i],
      ).map((x) => barX[i] + x),
    )
    return { barX, barW, xs, scale, fits: sum(need) <= o.width + 1e-6 }
  }
  let last = build(1)
  for (const scale of [0, 0.25, 0.5, 0.75, 1].map((i) => 1 - i * (1 - o.minScale))) {
    last = build(scale)
    if (last.fits) return last
  }
  return last
}

/** Pages as [first bar, bar count]: each takes up to `max` bars, fewer while its layout does not `fit`, at least 1. */
export function splitPages(barCount: number, max: number, fits: (first: number, count: number) => boolean): [number, number][] {
  const pages: [number, number][] = []
  for (let first = 0; first < barCount; ) {
    let count = Math.min(max, barCount - first)
    while (count > 1 && !fits(first, count)) count--
    pages.push([first, count])
    first += count
  }
  return pages
}

/** The page holding the bar of song time `t`; 1 ms early counts, as a seek to a bar start can land a hair before it. */
export function pageAt(pages: [number, number][], bars: number[], t: number): [number, number] {
  const bar = Math.max(0, bars.filter((b) => b <= t + 0.001).length - 1)
  return pages.find(([first, count]) => bar < first + count) ?? pages[pages.length - 1]
}

/** x of song time `t` between (time, x) points sorted by time: linear between neighbours, clamped to the ends; a later point at the same time wins. */
export function playheadX(points: [number, number][], t: number): number {
  const i = points.findIndex(([pt]) => pt > t)
  if (i === -1) return points[points.length - 1][1]
  if (i === 0) return points[0][1]
  const [[t0, x0], [t1, x1]] = [points[i - 1], points[i]]
  return x0 + ((t - t0) / (t1 - t0)) * (x1 - x0)
}

/** Sizes the backing store to the element times devicePixelRatio and clears; returns the CSS size. */
export function fit(ctx: CanvasRenderingContext2D): { w: number; h: number } {
  const c = ctx.canvas
  const dpr = globalThis.devicePixelRatio || 1
  const w = c.clientWidth
  const h = c.clientHeight
  const [bw, bh] = [Math.round(w * dpr), Math.round(h * dpr)]
  if (c.width !== bw || c.height !== bh) [c.width, c.height] = [bw, bh]
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return { w, h }
}

/** Artboard heights: one lyric row, or two when the page staggers its syllables (the canvas gets class `tall`). */
/**
 * Rest glyphs by length in quarters (4 = whole-bar rest) and where their ink sits: whole hangs from the fourth line,
 * half sits on the middle line, the others centre on a staff step. Placed by measured ink, as system music fonts differ.
 */
const RESTS: Record<number, { glyph: string; anchor: 'top' | 'bottom' | 'centre'; step: number }> = {
  4: { glyph: '\u{1D13B}', anchor: 'top', step: 6 },
  2: { glyph: '\u{1D13C}', anchor: 'bottom', step: 4 },
  1: { glyph: '\u{1D13D}', anchor: 'centre', step: 4 },
  0.5: { glyph: '\u{1D13E}', anchor: 'centre', step: 4 },
  0.25: { glyph: '\u{1D13F}', anchor: 'centre', step: 3 },
}
/** Artboard height: the drawing scales with the canvas height. */
export const BASE = 112

/** Onsets of bars first…first+count−1, sorted: notes sharing a beat, and rests (no syllable) in the gaps of each bar. */
export function pageContent(song: Song, roles: RoleId[], first: number, count: number) {
  const barQ = (song.timeSig[0] * 4) / song.timeSig[1]
  const mine = (n: Note) => roles.includes(n.role)
  const bars = Array.from({ length: count }, (_, i) => first + i)
  const notes = visibleNotes(song.notes, roles).filter((n) => n.bar >= first && n.bar < first + count)
  const written = (n: Note) => noteValue(n.dur).base * (noteValue(n.dur).dot ? 1.5 : 1)
  const keys = [...new Set(notes.map((n) => `${n.bar}:${n.beat}`))]
  const onsets: { bar: number; beat: number; here: Note[]; rest?: { len: number; voice: Note | undefined } }[] = [
    ...keys.map((k) => {
      const here = notes.filter((n) => `${n.bar}:${n.beat}` === k)
      return { bar: here[0].bar, beat: here[0].beat, here }
    }),
    ...bars.flatMap((bar) => {
      const inBar = notes.filter((n) => n.bar === bar)
      return restsIn(
        inBar.map((n) => ({ beat: n.beat, len: written(n) })),
        barQ,
      ).map((r) => {
        // the rest belongs to the voice that just stopped (mine first), else to the one about to start
        const before = inBar.filter((n) => n.beat + written(n) <= r.beat + 1e-9)
        const end = Math.max(...before.map((n) => n.beat + written(n)))
        const ended = before.filter((n) => n.beat + written(n) === end)
        const voice = ended.find(mine) ?? ended[0] ?? inBar.find(mine) ?? inBar[0]
        return { bar, beat: r.beat, here: [], rest: { len: r.len, voice } }
      })
    }),
  ].sort((a, b) => a.bar - b.bar || a.beat - b.beat)
  /** The note whose syllable an onset shows: mine first; none for a rest. */
  const lyric = onsets.map(({ here }) => here.find(mine) ?? here[0])
  return { bars, notes, onsets, lyric }
}

/** Page layout of `content` on a canvas `w` wide at drawing scale `s`; measures the syllables in the bold lyric font. */
export function measurePage(ctx: CanvasRenderingContext2D, song: Song, content: ReturnType<typeof pageContent>, w: number, s: number) {
  const fifths = keyFifths(song.key)
  ctx.font = `700 ${12 * s}px ${FONT}` // measured bold: the current note's syllable is drawn bold
  const startX = 46 * s + Math.abs(fifths) * 8 * s
  const page = layoutPage(
    content.bars,
    content.onsets.map(({ bar, beat, here }, k) => ({
      bar,
      beat,
      label: content.lyric[k]?.syllable ? ctx.measureText(content.lyric[k].syllable).width : 0,
      acc: here.some((n) => notePos(n, song, fifths).acc !== ''),
    })),
    {
      barQ: (song.timeSig[0] * 4) / song.timeSig[1],
      width: w - 4 - startX,
      leftRoom: startX - 4,
      head: 20 * s, // a flag reaches 11 px right of its head, a rest or head 6 px left of its x
      acc: 12 * s,
      pad: 18 * s,
      tail: 10 * s,
      sep: 4 * s,
      empty: 40 * s,
      minScale: 10 / 12,
    },
  )
  return { s, startX, ...page }
}

/**
 * (song time, x) of a page's start, each onset and its end, for `playheadX`; bars past the song's end (last page) continue at the last bar's length.
 * A note onset sits at its notes' sung start (singers drift off the bar grid); a rest at its place in the bar, kept between its neighbours.
 */
export function pagePoints(song: Song, content: ReturnType<typeof pageContent>, L: ReturnType<typeof measurePage>): [number, number][] {
  const barQ = (song.timeSig[0] * 4) / song.timeSig[1]
  const nb = song.bars.length
  const lastLen = nb > 1 ? song.bars[nb - 1] - song.bars[nb - 2] : 2
  const barStart = (b: number) => song.bars[b] ?? song.bars[nb - 1] + (b - nb + 1) * lastLen
  const [first, count] = [content.bars[0], content.bars.length]
  const [t0, t1] = [barStart(first), barStart(first + count)]
  const sung = content.onsets.map(({ here }) => (here.length ? Math.min(...here.map((n) => n.start)) : null))
  let prev = t0
  const onsets = content.onsets.map(({ bar, beat }, k): [number, number] => {
    const next = sung.slice(k).find((t) => t != null) ?? t1
    const grid = Math.min(Math.max(barStart(bar) + (beat / barQ) * (barStart(bar + 1) - barStart(bar)), prev), next)
    prev = sung[k] ?? grid
    return [prev, L.startX + L.xs[k]]
  })
  return [[t0, L.startX + L.barX[0]], ...onsets, [t1, L.startX + L.barX[count - 1] + L.barW[count - 1]]]
}

/** Page split per song, canvas size, roles and font state; measuring every page each frame would be too slow. */
const pageCache = new WeakMap<Song, Map<string, [number, number][]>>()
/** Pages of up to `barsPerPage` bars whose syllables fit on one row (fewer bars where they do not); `fixed` bars each when given, squeezed if need be. */
export function staffPages(ctx: CanvasRenderingContext2D, song: Song, roles: RoleId[], w: number, h: number, fixed?: number): [number, number][] {
  const key = `${w}|${h}|${roles.join()}|${globalThis.document?.fonts?.status}|${fixed ?? ''}`
  const bySize = pageCache.get(song) ?? new Map<string, [number, number][]>()
  pageCache.set(song, bySize)
  let pages = bySize.get(key)
  if (!pages) {
    const fits = (first: number, count: number) => measurePage(ctx, song, pageContent(song, roles, first, count), w, h / BASE).fits
    pages = splitPages(song.bars.length, fixed ?? barsPerPage(w), fixed ? () => true : fits)
    bySize.set(key, pages)
  }
  return pages
}

/** Treble staff, pages of `staffPages`, lyric-aware spacing on one row. Returns the page drawn; no-op without a context (happy-dom). */
export function draw(ctx: CanvasRenderingContext2D | null, state: DrawState): [number, number] | null {
  if (!ctx) return null
  const { song, roles, names, t } = state
  const fifths = keyFifths(song.key)
  const shift = octaveShift(song)
  const barQ = (song.timeSig[0] * 4) / song.timeSig[1]
  const mine = (n: Note) => roles.includes(n.role)
  const { w, h } = fit(ctx)
  const shown = pageAt(staffPages(ctx, song, roles, w, h, state.bars), song.bars, t)
  const [first, per] = shown
  const content = pageContent(song, roles, first, per)
  const { bars, notes, onsets, lyric } = content
  const index = new Map(onsets.map((o, k) => [`${o.bar}:${o.beat}`, k]))
  const at = (n: Note) => index.get(`${n.bar}:${n.beat}`)!
  const L = measurePage(ctx, song, content, w, h / BASE)
  const { s, startX } = L
  const gap = 10 * s
  const y = (step: number) => 70 * s - (step * gap) / 2

  // Lines, clef, key signature
  ctx.strokeStyle = ctx.fillStyle = COLORS.muted
  ctx.globalAlpha = 0.7
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    ctx.moveTo(4, y(i * 2))
    ctx.lineTo(w - 4, y(i * 2))
  }
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${48 * s}px ${MUSIC}`
  ctx.fillText('\u{1D11E}', 6 * s, y(0))
  if (shift) {
    ctx.font = `700 ${11 * s}px ${FONT}` // the "8" under the clef: written an octave above the sound
    ctx.textAlign = 'center'
    ctx.fillText('8', 15 * s, y(-2.5))
    ctx.textAlign = 'left'
  }
  ctx.font = `${16 * s}px ${MUSIC}`
  ctx.textBaseline = 'middle'
  const sig = fifths > 0 ? SHARP_STEPS : FLAT_STEPS
  for (let i = 0; i < Math.min(7, Math.abs(fifths)); i++) ctx.fillText(GLYPH[fifths > 0 ? '#' : 'b'], 40 * s + i * 8 * s, y(sig[i]))

  // Bar lines at every bar start after the first and at the page end, bar numbers over each bar's start
  ctx.strokeStyle = COLORS.text
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (const x of [...L.barX.slice(1), L.barX.at(-1)! + L.barW.at(-1)!]) {
    ctx.moveTo(startX + x, y(8))
    ctx.lineTo(startX + x, y(0))
  }
  ctx.stroke()
  ctx.fillStyle = COLORS.muted
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${10 * s}px ${FONT}`
  bars.forEach((b, i) => {
    ctx.fillText(String(b + 1), startX + L.barX[i] + 3 * s, 27 * s)
  })

  const x = (n: Note) => startX + L.xs[at(n)]
  const colour = (n: Note) => noteColour(n.role, mine(n), state.colours)
  const sounding = notes.filter((n) => n.start <= t && t < n.end)
  const current = sounding.find(mine) ?? sounding[0]

  if (current) {
    ctx.fillStyle = colour(current)
    ctx.globalAlpha = 0.2
    ctx.beginPath()
    ctx.roundRect(x(current) - 17 * s, 22 * s, 34 * s, 56 * s, 8 * s)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // Playhead, dashed as in the piano roll: moves from onset to onset, so the singer sees the next entry coming
  const points = pagePoints(song, content, L)
  const px = playheadX(points, t)
  ctx.strokeStyle = COLORS.text
  ctx.lineWidth = 1.5
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  ctx.moveTo(px, 22 * s)
  ctx.lineTo(px, 78 * s)
  ctx.stroke()
  ctx.setLineDash([])

  // Role name above each run of same-role notes; one that would overprint the previous is left out
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 ${11 * s}px ${FONT}`
  let right = -Infinity
  for (let i = 0; i < notes.length; ) {
    let j = i
    while (j + 1 < notes.length && notes[j + 1].role === notes[i].role) j++
    const label = names[notes[i].role] ?? notes[i].role
    const cx = (x(notes[i]) + x(notes[j])) / 2
    const half = ctx.measureText(label).width / 2
    if (cx - half > right + 4 * s) {
      ctx.fillStyle = colour(notes[i])
      ctx.fillText(label, cx, 18 * s)
      right = cx + half
    }
    i = j + 1
  }

  for (const n of notes) {
    const nx = x(n)
    const { step, acc } = notePos(n, song, fifths)
    const ny = y(step)
    const { base, dot } = noteValue(n.dur)
    const up = step < 4
    const stemX = nx + (up ? 5 : -5) * s
    const tip = ny + (up ? -28 : 28) * s
    const rx = (base === 4 ? 6.5 : 5.5) * s
    ctx.strokeStyle = ctx.fillStyle = colour(n)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let st = -2; st >= step; st -= 2) {
      ctx.moveTo(nx - rx - 3.5 * s, y(st)) // ledger lines below
      ctx.lineTo(nx + rx + 3.5 * s, y(st))
    }
    for (let st = 10; st <= step; st += 2) {
      ctx.moveTo(nx - rx - 3.5 * s, y(st)) // and above
      ctx.lineTo(nx + rx + 3.5 * s, y(st))
    }
    if (base < 4) {
      ctx.moveTo(stemX, ny)
      ctx.lineTo(stemX, tip)
    }
    ctx.stroke()
    // flags: one for an eighth, two for a sixteenth, on the right of the stem, curling back to the head
    const flags = base === 0.5 ? 1 : base === 0.25 ? 2 : 0
    const dir = up ? 1 : -1
    ctx.lineWidth = 1.8 * s
    for (let k = 0; k < flags; k++) {
      const fy = tip + dir * k * 6 * s
      ctx.beginPath()
      ctx.moveTo(stemX, fy)
      ctx.bezierCurveTo(stemX + 1 * s, fy + dir * 6 * s, stemX + 8 * s, fy + dir * 8 * s, stemX + 6 * s, fy + dir * 16 * s)
      ctx.stroke()
    }
    // head: a slash for a spoken note (rhythm only), hollow for half and whole
    ctx.beginPath()
    if (n.spoken) {
      ctx.lineWidth = 2.5 * s
      ctx.moveTo(nx - rx, ny + gap / 2)
      ctx.lineTo(nx + rx, ny - gap / 2)
      ctx.stroke()
    } else {
      ctx.ellipse(nx, ny, rx, 4 * s, base === 4 ? -Math.PI / 18 : -Math.PI / 9, 0, 2 * Math.PI)
      if (base >= 2) {
        ctx.lineWidth = 1.6 * s
        ctx.stroke()
      } else ctx.fill()
    }
    if (dot) {
      ctx.beginPath()
      ctx.arc(nx + rx + 4 * s, step % 2 === 0 ? y(step + 1) : ny, 1.7 * s, 0, 2 * Math.PI) // a dot on a line sits in the space above
      ctx.fill()
    }
    if (acc) {
      ctx.font = `${14 * s}px ${MUSIC}`
      ctx.textBaseline = 'middle'
      ctx.fillText(GLYPH[acc], nx - 13 * s, ny)
      ctx.textBaseline = 'alphabetic'
    }
  }

  // Ties and slurs: an arc to the next note of the same role, below the heads when the stem points up, else above;
  // over a page turn the arc runs out at the page end and comes in at the next page's start
  ctx.lineWidth = 1.5 * s
  const all = visibleNotes(song.notes, roles)
  const follow = (n: Note) => all[arcTarget(all, all.indexOf(n))] as Note | undefined
  const [pageL, pageR] = [startX, startX + L.barX.at(-1)! + L.barW.at(-1)!]
  const arc = (n: Note, x0: number, x1: number, a: number, b: number) => {
    const dir = a < 4 ? 1 : -1
    const [y0, y1] = [y(a) + dir * 6 * s, y(b) + dir * 6 * s]
    ctx.strokeStyle = colour(n)
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.bezierCurveTo(x0 + (x1 - x0) / 3, y0 + dir * 6 * s, x1 - (x1 - x0) / 3, y1 + dir * 6 * s, x1, y1)
    ctx.stroke()
  }
  for (const n of all) {
    const next = n.slur || n.tie ? follow(n) : undefined
    const [from, to] = [notes.includes(n), next && notes.includes(next)]
    if (!next || (!from && !to)) continue
    const [a, b] = [notePos(n, song, fifths).step, notePos(next, song, fifths).step]
    if (from && to) arc(n, x(n) + 6 * s, x(next) - 6 * s, a, b)
    else if (from) arc(n, x(n) + 6 * s, pageR, a, a)
    else arc(n, pageL, x(next) - 6 * s, b, b)
  }

  // Rests, faint in the colour of their voice; a whole-bar rest hangs from the fourth line, centred in the bar
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${32 * s}px ${MUSIC}`
  const ink = (m: TextMetrics) => m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
  ctx.font = `${(32 * s * 2.8 * gap) / (ink(ctx.measureText(RESTS[1].glyph)) || 2.8 * gap)}px ${MUSIC}` // quarter rest ink = 2.8 spaces
  ctx.globalAlpha = 0.6
  onsets.forEach(({ bar, rest }, k) => {
    if (!rest) return
    const i = bar - first
    const whole = rest.len >= barQ || rest.len >= 4
    const { glyph, anchor, step } = RESTS[whole ? 4 : rest.len]
    const m = ctx.measureText(glyph)
    const [a, d] = [m.actualBoundingBoxAscent, m.actualBoundingBoxDescent]
    const base = anchor === 'top' ? y(step) + a : anchor === 'bottom' ? y(step) - d : y(step) + (a - d) / 2
    ctx.fillStyle = rest.voice ? colour(rest.voice) : COLORS.muted
    ctx.fillText(glyph, whole ? startX + L.barX[i] + L.barW[i] / 2 : startX + L.xs[k], base)
  })
  ctx.globalAlpha = 1

  // Syllables: one per onset, all of them, on one row
  lyric.forEach((n, k) => {
    if (!n?.syllable) return
    ctx.font = `${n === current && mine(n) ? 700 : 400} ${12 * s * L.scale}px ${FONT}`
    ctx.fillStyle = colour(n)
    ctx.fillText(n.syllable, startX + L.xs[k], 100 * s)
  })

  // Repeat: the page outside the range dimmed, a line at the range start when it is on this page
  if (state.repeat) {
    const { start, end } = state.repeat
    const [left, right] = [points[0], points.at(-1)!]
    dimOutside(ctx, left[1], playheadX(points, start), playheadX(points, end), right[1], h) // playheadX clamps to the page
    if (start >= left[0] && start < right[0]) {
      ctx.strokeStyle = COLORS.accent
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX(points, start), 22 * s)
      ctx.lineTo(playheadX(points, start), 78 * s)
      ctx.stroke()
    }
  }
  return shown
}
