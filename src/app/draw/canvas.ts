import type { RoleId, Song } from '../../core/content'
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
  /** Song time at the playhead's spot while the singer browses (paused); unset: `t`, the view follows the playhead. */
  view?: number
  /** Pitch frames of the last 2 s (by scoring stamp `t`, the heard time), oldest first; `midi: null` breaks the sung line. */
  frames: PitchFrame[]
  /** Semitones the roll adds to every sung pitch: the singer's octave for the song. Unset: each frame folds to its nearest note. */
  octave?: number | null
  tolerance: Tolerance
  /** Active repeat: everything outside start…end is dimmed; flags [time, label] mark it. Drawing only. */
  repeat?: Marks | null
  /** A colour per role (the editor); roles without one, and the player, use accent for mine and other for the rest. */
  colours?: Partial<Record<RoleId, string>>
  /** Bars per page, fixed (the editor's zoom); without it `staffPages` picks them. */
  bars?: number
  /** The player: one endless row moving past a fixed playhead instead of pages. */
  scroll?: boolean
}

export interface Marks {
  start: number
  end: number
  flags: [number, string][]
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

/** Dims x < from and x > to (canvas `h` high) by painting the surface colour over them. */
export function dimOutside(ctx: CanvasRenderingContext2D, left: number, from: number, to: number, right: number, h: number): void {
  ctx.fillStyle = COLORS.surface
  ctx.globalAlpha = 0.6
  if (from > left) ctx.fillRect(left, 0, from - left, h)
  if (to < right) ctx.fillRect(to, 0, right - to, h)
  ctx.globalAlpha = 1
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
