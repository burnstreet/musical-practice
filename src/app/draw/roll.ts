import type { DrawState } from './staff'

/** Piano roll, 5 s window, playhead at 1/3. Ticket 16 draws; no-op without a context (happy-dom). */
export function draw(ctx: CanvasRenderingContext2D | null, state: DrawState): void {
  if (!ctx) return
  void state
}
