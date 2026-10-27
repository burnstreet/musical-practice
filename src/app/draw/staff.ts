import { type Note, type RoleId, type Song, visibleNotes } from '../../core/content'
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
  /** Pitch frames of the last 1.5 s (song time), oldest first; `midi: null` breaks the sung line. */
  frames: PitchFrame[]
  tolerance: Tolerance
}

/** tokens.css values (a canvas cannot use custom properties directly). */
export const COLORS = { accent: '#C8E05A', other: '#A9D3F7', muted: '#CFE0F5', line: '#3F78BF', surface: '#17498C', text: '#FFFFFF' }
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

/** Bars per staff page for the canvas CSS width: 2 on a phone, else 4. Canvas and the practice header both use it. */
export const barsPerPage = (cssWidth: number): 2 | 4 => (cssWidth < 560 ? 2 : 4)

/** Staff page (`per` bars) for the playhead; flips when the playhead enters bar per·k. */
export const pageOf = (bars: number[], t: number, per: number) => Math.floor(Math.max(0, bars.filter((b) => b <= t).length - 1) / per)

/** Written values in quarters, sixteenth to whole, dotted up to the dotted half. */
const VALUES = [0.25, 0.5, 1, 2, 4].flatMap((base) => (base < 4 ? [false, true] : [false]).map((dot) => ({ base, dot })))
/** Written value for a `dur` in quarters: the nearest value by ratio (1.4 → dotted quarter, 5 → whole). */
export function noteValue(dur: number): { base: number; dot: boolean } {
  const off = (v: { base: number; dot: boolean }) => Math.abs(Math.log((v.base * (v.dot ? 1.5 : 1)) / dur))
  return VALUES.reduce((a, v) => (off(v) < off(a) ? v : a))
}

/** Engraver-style spacing: room grows with duration ^ 0.6, not linearly. */
const SPACING = 0.6
/**
 * x offsets (0..width) of the distinct sorted onsets (beats) of one bar. Each onset gets room for the time to the next
 * onset or the bar end, raised to SPACING; a rest before the first onset keeps its room. No onset is closer than
 * `minGap` to the next (less when even that does not fit): short notes take the minimum, long ones give it up.
 */
export function layoutBar(onsets: number[], barQ: number, width: number, minGap: number): number[] {
  if (!onsets.length) return []
  const gap = Math.min(minGap, width / onsets.length)
  const lead = Math.max(0, onsets[0]) ** SPACING
  const weights = onsets.map((o, i) => Math.max(0, (onsets[i + 1] ?? Math.max(barQ, o)) - o) ** SPACING)
  const fixed = weights.map(() => false)
  let scale = 0
  for (;;) {
    const free = width - gap * fixed.filter(Boolean).length
    const freeWeight = lead + weights.reduce((a, w, i) => a + (fixed[i] ? 0 : w), 0)
    scale = freeWeight > 0 ? free / freeWeight : 0
    const short = weights.findIndex((w, i) => !fixed[i] && w * scale < gap)
    if (short < 0) break
    fixed[short] = true
  }
  const xs: number[] = []
  let x = lead * scale
  weights.forEach((w, i) => {
    xs.push(x)
    x += fixed[i] ? gap : w * scale
  })
  return xs
}

/** Font size for a label `textWidth` wide at `size` in `room` px: shrunk to fit, null below `min` (skip it). */
export function labelSize(textWidth: number, room: number, size: number, min: number): number | null {
  const fit = textWidth <= room ? size : (size * room) / textWidth
  return fit >= min - 1e-9 ? fit : null
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

/** Room after a bar line before the first head (accidental), and the closest two onsets may get (head + dot). */
const PAD = 16
const MIN_GAP = 22

/** Treble staff, `barsPerPage` bars per page. No-op without a context (happy-dom). */
export function draw(ctx: CanvasRenderingContext2D | null, state: DrawState): void {
  if (!ctx) return
  const { w, h } = fit(ctx)
  const { song, roles, names, t } = state
  const s = h / 112 // artboard: 112 px tall, lines at 30..70
  const gap = 10 * s
  const y = (step: number) => 70 * s - (step * gap) / 2
  const fifths = keyFifths(song.key)
  const startX = 46 * s + Math.abs(fifths) * 8 * s
  const per = barsPerPage(w)
  const barW = (w - 4 - startX) / per
  const page = pageOf(song.bars, t, per)
  const barQ = (song.timeSig[0] * 4) / song.timeSig[1]

  // Lines, bar lines, clef, key signature
  ctx.strokeStyle = ctx.fillStyle = COLORS.muted
  ctx.globalAlpha = 0.7
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    ctx.moveTo(4, y(i * 2))
    ctx.lineTo(w - 4, y(i * 2))
  }
  for (let i = 1; i <= per; i++) {
    ctx.moveTo(startX + i * barW, y(8))
    ctx.lineTo(startX + i * barW, y(0))
  }
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${48 * s}px ${MUSIC}`
  ctx.fillText('\u{1D11E}', 6 * s, y(0))
  ctx.font = `${16 * s}px ${MUSIC}`
  ctx.textBaseline = 'middle'
  const sig = fifths > 0 ? SHARP_STEPS : FLAT_STEPS
  for (let i = 0; i < Math.min(7, Math.abs(fifths)); i++) ctx.fillText(GLYPH[fifths > 0 ? '#' : 'b'], 40 * s + i * 8 * s, y(sig[i]))

  const first = page * per
  const notes = visibleNotes(song.notes, roles).filter((n) => n.bar >= first && n.bar < first + per)
  // x per (bar, beat): spacing laid out bar by bar
  const at = new Map<string, number>()
  for (let b = first; b < first + per; b++) {
    const onsets = [...new Set(notes.filter((n) => n.bar === b).map((n) => n.beat))].sort((p, q) => p - q)
    const xs = layoutBar(onsets, barQ, barW - PAD * s, MIN_GAP * s)
    onsets.forEach((o, i) => {
      at.set(`${b}:${o}`, startX + (b - first) * barW + PAD * s + xs[i])
    })
  }
  const x = (n: Note) => at.get(`${n.bar}:${n.beat}`)!
  const mine = (n: Note) => roles.includes(n.role)
  const colour = (n: Note) => (mine(n) ? COLORS.accent : COLORS.other)
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
    const { step, acc } = staffPos(n.midi, fifths)
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
    // head: hollow for half and whole
    ctx.beginPath()
    ctx.ellipse(nx, ny, rx, 4 * s, base === 4 ? -Math.PI / 18 : -Math.PI / 9, 0, 2 * Math.PI)
    if (base >= 2) {
      ctx.lineWidth = 1.6 * s
      ctx.stroke()
    } else ctx.fill()
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

  // Syllables: one per onset (mine first), centred, shrunk to the room between neighbours or left out
  const heads = [...new Set(notes.map(x))].sort((p, q) => p - q)
  heads.forEach((hx, i) => {
    const here = notes.filter((n) => x(n) === hx)
    const n = here.find(mine) ?? here[0]
    if (!n.syllable) return
    const room = Math.min(2 * hx, hx - (heads[i - 1] ?? -Infinity), (heads[i + 1] ?? Infinity) - hx, 2 * (w - hx)) - 2 * s
    const weight = n === current && mine(n) ? 700 : 400
    ctx.font = `${weight} ${12 * s}px ${FONT}`
    const size = labelSize(ctx.measureText(n.syllable).width, room, 12 * s, 9 * s)
    if (size === null) return
    ctx.font = `${weight} ${size}px ${FONT}`
    ctx.fillStyle = colour(n)
    ctx.fillText(n.syllable, hx, 100 * s)
  })
}
