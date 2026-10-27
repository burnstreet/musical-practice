import type { Note, RoleId, Song } from '../../core/content'
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

/** Staff page (4 bars) for the playhead; flips when the playhead enters bar 4k. */
export const pageOf = (bars: number[], t: number) => Math.floor(Math.max(0, bars.filter((b) => b <= t).length - 1) / 4)

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

/** Treble staff, 4 bars per page. No-op without a context (happy-dom). */
export function draw(ctx: CanvasRenderingContext2D | null, state: DrawState): void {
  if (!ctx) return
  const { w, h } = fit(ctx)
  const { song, roles, names, t } = state
  const s = h / 112 // artboard: 112 px tall, lines at 30..70
  const gap = 10 * s
  const y = (step: number) => 70 * s - (step * gap) / 2
  const fifths = keyFifths(song.key)
  const startX = 46 * s + Math.abs(fifths) * 8 * s
  const barW = (w - 4 - startX) / 4
  const page = pageOf(song.bars, t)
  const barQ = (song.timeSig[0] * 4) / song.timeSig[1]

  // Lines, bar lines, clef, key signature
  ctx.strokeStyle = ctx.fillStyle = COLORS.muted
  ctx.globalAlpha = 0.7
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 5; i++) ctx.moveTo(4, y(i * 2)), ctx.lineTo(w - 4, y(i * 2))
  for (let i = 1; i <= 4; i++) ctx.moveTo(startX + i * barW, y(8)), ctx.lineTo(startX + i * barW, y(0))
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

  const notes = song.notes.filter((n) => n.bar >= page * 4 && n.bar < page * 4 + 4)
  const x = (n: Note) => startX + (n.bar - page * 4) * barW + barW * (0.12 + (0.76 * n.beat) / barQ)
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

  // Role name above each run of same-role notes
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 ${11 * s}px ${FONT}`
  for (let i = 0; i < notes.length; ) {
    let j = i
    while (j + 1 < notes.length && notes[j + 1].role === notes[i].role) j++
    ctx.fillStyle = colour(notes[i])
    ctx.fillText(names[notes[i].role] ?? notes[i].role, (x(notes[i]) + x(notes[j])) / 2, 18 * s)
    i = j + 1
  }

  for (const n of notes) {
    const nx = x(n)
    const { step, acc } = staffPos(n.midi, fifths)
    const ny = y(step)
    const up = step < 4
    const stemX = nx + (up ? 5 : -5) * s
    ctx.strokeStyle = ctx.fillStyle = colour(n)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let st = -2; st >= step; st -= 2) ctx.moveTo(nx - 9 * s, y(st)), ctx.lineTo(nx + 9 * s, y(st)) // ledger lines below
    for (let st = 10; st <= step; st += 2) ctx.moveTo(nx - 9 * s, y(st)), ctx.lineTo(nx + 9 * s, y(st)) // and above
    ctx.moveTo(stemX, ny)
    ctx.lineTo(stemX, ny + (up ? -28 : 28) * s)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(nx, ny, 5.5 * s, 4 * s, -Math.PI / 9, 0, 2 * Math.PI)
    ctx.fill()
    if (acc) {
      ctx.font = `${14 * s}px ${MUSIC}`
      ctx.textBaseline = 'middle'
      ctx.fillText(GLYPH[acc], nx - 13 * s, ny)
      ctx.textBaseline = 'alphabetic'
    }
    ctx.font = `${n === current && mine(n) ? 700 : 400} ${12 * s}px ${FONT}`
    ctx.fillText(n.syllable, nx, 100 * s)
  }
}
