import type { Song, SongMeta } from './content'

export interface PitchFrame {
  t: number
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
