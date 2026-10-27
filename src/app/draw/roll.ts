import { type Note, visibleNotes } from '../../core/content'
import { foldCents, noteName } from '../../core/scorer'
import { COLORS, type DrawState, FONT, fit } from './staff'

const BEHIND = 1.5
const AHEAD = 3.5
const MIN_ROWS = 10
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

/** Piano roll, 5 s window, playhead at 30 %. No-op without a context (happy-dom). */
export function draw(ctx: CanvasRenderingContext2D | null, state: DrawState): void {
  if (!ctx) return
  const { w, h } = fit(ctx)
  const { song, roles, t, frames } = state
  const t0 = t - BEHIND
  const t1 = t + AHEAD
  const x = (time: number) => ((time - t0) / (t1 - t0)) * w
  const notes = visibleNotes(song.notes, roles)
  const inView = notes.filter((n) => n.end > t0 && n.start < t1)
  const mineInView = inView.filter((n) => roles.includes(n.role))
  const [lo, hi] = rowRange((mineInView.length ? mineInView : inView).map((n) => n.midi))
  const rowH = h / (hi - lo + 1)
  const y = (midi: number) => (hi - midi + 0.5) * rowH // centre of the row

  // Rows and labels
  ctx.strokeStyle = COLORS.line
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let r = 0; r <= hi - lo + 1; r++) ctx.moveTo(34, r * rowH), ctx.lineTo(w, r * rowH)
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
  for (const n of inView.filter((n) => !roles.includes(n.role))) {
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

  // Playhead
  ctx.strokeStyle = COLORS.text
  ctx.lineWidth = 1.5
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  ctx.moveTo(x(t), 0) // same axis as notes and sung line (BEHIND/(BEHIND+AHEAD) = 30 %)
  ctx.lineTo(x(t), h)
  ctx.stroke()
  ctx.setLineDash([])

  // Sung line: dark outline under a 4 px white line, null frames break it
  const mine = notes.filter((n) => roles.includes(n.role))
  const pts = frames.map((f) => (f.midi === null ? null : [x(f.at), y(foldToTargetOctave(f.midi, f.at, mine))]))
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
