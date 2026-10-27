import type { RoleId, Song } from '../../core/content'
import type { Tolerance } from '../../core/scorer'
import type { PitchFrame } from '../../core/types'

/** What the practice screen hands both canvases on every update. */
export interface DrawState {
  song: Song
  /** The singer's role set: "my" notes are the ones whose role is in here. */
  roles: RoleId[]
  /** Song time of the playhead in seconds. */
  t: number
  /** Pitch frames of the last 1.5 s (song time), oldest first; `midi: null` breaks the sung line. */
  frames: PitchFrame[]
  tolerance: Tolerance
}

/** Treble staff, 4 bars per page. Ticket 16 draws; no-op without a context (happy-dom). */
export function draw(ctx: CanvasRenderingContext2D | null, state: DrawState): void {
  if (!ctx) return
  void state
}
