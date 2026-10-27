import type { Song, SongMeta } from './content'

export interface PitchFrame {
  /** Song time the singer reacted to (latency compensated): scoring and session. */
  t: number
  /** Song time the frame was measured at, minus only the detection delay: the live line and readout. */
  at: number
  midi: number | null
  clarity: number
  rms: number
}
export interface LoadedSong {
  meta: SongMeta
  song: Song
  voices: Blob
  backing: Blob
}
