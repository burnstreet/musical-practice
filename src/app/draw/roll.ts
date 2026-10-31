import { type Note, visibleNotes } from '../../core/content'
import { foldCents, noteName } from '../../core/scorer'
import { COLORS, type DrawState, dimOutside, FONT, fit } from './staff'

/** Playhead at 30 % of the window. */
const BEHIND_SHARE = 0.3
const MIN_ROWS = 10
/** Lyric strip under the rows, px. */
const LYRICS = 22
const MARGIN = 2

/** Inclusive midi range of the rows: notes ±2 semitones, padded to at least 10 rows (G4 area when empty). */
export function rowRange(midis: number[]): [number, number] {
  let lo = midis.length ? Math.min(...midis) - MARGIN : 67
  let hi = midis.length ? Math.max(...midis) + MARGIN : 67
  const short = MIN_ROWS - (hi - lo + 1)
  if (short > 0) [lo, hi] = [lo - Math.ceil(short / 2), hi + Math.floor(short / 2)]
  return [lo, hi]
}

/** Sung midi folded into the octave of my note nearest in time to `t` (the one sounding, if any). */
export function foldToTargetOctave(midi: number, t: number, mine: Note[]): number {
  const gap = (n: Note) => Math.max(n.start - t, t - n.end, 0)
  const target = mine.reduce<Note | null>((a, n) => (!a || gap(n) < gap(a) ? n : a), null)
  return target ? target.midi + foldCents(midi, target.midi) / 100 : midi
}

/** Seconds the roll shows at a canvas width: 72 px per second, 5…8 s (a wider screen shows more of what comes). */
export const rollWindow = (cssWidth: number) => Math.min(8, Math.max(5, cssWidth / 72))

/**
 * Syllable positions in the lyric strip: each at its note's start, pushed right just enough to keep `gap` px after the
 * previous one, so none is left out or overprinted. `widths` in the same order as `xs` (sorted by start).
 */
export function lyricXs(xs: number[], widths: number[], gap: number): number[] {
  const out: number[] = []
  xs.forEach((x, i) => {
    out.push(i ? Math.max(x, out[i - 1] + widths[i - 1] + gap) : x)
  })
  return out
}

/** Piano roll, window of `rollWindow`, playhead at 30 %, lyric strip at the bottom. No-op without a context (happy-dom). */
export function draw(ctx: CanvasRenderingContext2D | null, state: DrawState): void {
  if (!ctx) return
  const { w, h: full } = fit(ctx)
  const h = full - LYRICS
  const { song, roles, t, frames } = state
  const span = rollWindow(w)
  const t0 = t - span * BEHIND_SHARE
  const t1 = t0 + span
  const x = (time: number) => ((time - t0) / (t1 - t0)) * w
  const notes = visibleNotes(song.notes, roles)
  const inView = notes.filter((n) => n.end > t0 && n.start < t1)
  const sungInView = inView.filter((n) => !n.spoken) // a spoken note has no pitch: no bar, no row, only its syllable
  const mineInView = sungInView.filter((n) => roles.includes(n.role))
  const [lo, hi] = rowRange((mineInView.length ? mineInView : sungInView).map((n) => n.midi))
  const rowH = h / (hi - lo + 1)
  const y = (midi: number) => (hi - midi + 0.5) * rowH // centre of the row

  // Rows and labels
  ctx.strokeStyle = COLORS.line
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let r = 0; r <= hi - lo + 1; r++) {
    ctx.moveTo(34, r * rowH)
    ctx.lineTo(w, r * rowH)
  }
  ctx.stroke()
  ctx.fillStyle = COLORS.muted
  ctx.font = `${Math.min(11, rowH * 0.7)}px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let m = lo; m <= hi; m++) ctx.fillText(noteName(m), 2, y(m))

  // Target bars: others dashed, mine with elapsed fill
  const barH = Math.max(2, rowH - 4)
  const rect = (n: Note, x0: number, x1: number) => {
    ctx.beginPath()
    ctx.roundRect(x0, y(n.midi) - barH / 2, Math.max(0, x1 - x0), barH, Math.min(8, barH / 2))
  }
  ctx.lineWidth = 2
  for (const n of sungInView.filter((n) => !roles.includes(n.role))) {
    rect(n, x(n.start), x(n.end))
    ctx.setLineDash([4, 4])
    ctx.globalAlpha = 0.12
    ctx.fillStyle = ctx.strokeStyle = COLORS.other
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.fillStyle = ctx.strokeStyle = COLORS.accent
  for (const n of mineInView) {
    const done = n.end <= t
    rect(n, x(n.start), x(n.end))
    ctx.globalAlpha = done ? 0.9 : n.start <= t ? 0.3 : 0.18
    ctx.fill()
    if (!done) {
      ctx.globalAlpha = n.start <= t ? 1 : 0.7
      ctx.stroke()
      if (n.start <= t) {
        ctx.globalAlpha = 0.9
        rect(n, x(n.start), x(t))
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }

  // Lyric strip: one syllable per onset (mine first), from the window's left edge; the sounding one of mine bold
  const onsets = [...inView].sort((a, b) => a.start - b.start || +roles.includes(b.role) - +roles.includes(a.role))
  const sung = onsets.filter((n, i) => n.syllable && (i === 0 || n.start !== onsets[i - 1].start))
  const font = (n: Note) => `${roles.includes(n.role) && n.start <= t && t < n.end ? 700 : 400} 12px ${FONT}`
  const widths = sung.map((n) => {
    ctx.font = font(n)
    return ctx.measureText(n.syllable).width
  })
  const lx = lyricXs(
    sung.map((n) => x(n.start)),
    widths,
    6,
  )
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  sung.forEach((n, i) => {
    ctx.font = font(n)
    ctx.fillStyle = roles.includes(n.role) ? COLORS.accent : COLORS.other
    ctx.fillText(n.syllable, lx[i], full - 6)
  })

  // Repeat: outside the range dimmed, a flag with its name (A and B for A–B) at its edges
  if (state.repeat) {
    const clamp = (v: number) => Math.min(w, Math.max(0, v))
    dimOutside(ctx, 0, clamp(x(state.repeat.start)), clamp(x(state.repeat.end)), w, full)
    ctx.font = `700 11px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    for (const [time, label] of state.repeat.flags) {
      const fx = x(time)
      ctx.fillStyle = ctx.strokeStyle = COLORS.accent
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(fx, 0)
      ctx.lineTo(fx, full)
      ctx.stroke()
      ctx.beginPath()
      ctx.roundRect(fx, 0, ctx.measureText(label).width + 10, 16, [0, 4, 4, 0])
      ctx.fill()
      ctx.fillStyle = COLORS.surface
      ctx.fillText(label, fx + 5, 2)
    }
  }

  // Playhead
  ctx.strokeStyle = COLORS.text
  ctx.lineWidth = 1.5
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  ctx.moveTo(x(t), 0) // same axis as notes and sung line (30 %)
  ctx.lineTo(x(t), full)
  ctx.stroke()
  ctx.setLineDash([])

  // Sung line: dark outline under a 4 px white line, null frames break it
  const mine = notes.filter((n) => roles.includes(n.role) && !n.spoken)
  const pts = frames.map((f) => (f.midi === null ? null : [x(f.t), y(foldToTargetOctave(f.midi, f.t, mine))]))
  ctx.lineCap = ctx.lineJoin = 'round'
  for (const [colour, width] of [
    [COLORS.surface, 8],
    [COLORS.text, 4],
  ] as const) {
    ctx.strokeStyle = colour
    ctx.lineWidth = width
    ctx.beginPath()
    pts.forEach((p, i) => {
      if (p) {
        if (pts[i - 1]) ctx.lineTo(p[0], p[1])
        else ctx.moveTo(p[0], p[1])
      }
    })
    ctx.stroke()
  }
  const last = pts.at(-1)
  if (last) {
    ctx.beginPath()
    ctx.arc(last[0], last[1], 7, 0, 2 * Math.PI)
    ctx.fillStyle = COLORS.text
    ctx.fill()
    ctx.strokeStyle = COLORS.surface
    ctx.lineWidth = 3
    ctx.stroke()
  }
}
