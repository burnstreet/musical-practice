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
export type ScriptItem =
  | { id: string; type: 'line'; role: string; text: string; audio: string }
  | { id: string; type: 'direction'; text: string }
  | { id: string; type: 'song'; songId: string }
export interface Scene {
  id: string
  title: string
  items: ScriptItem[]
}
export interface Script {
  scenes: Scene[]
}
export interface LoadedSong {
  meta: SongMeta
  song: Song
  voices: Blob
  backing: Blob
}
export interface LoadedScript {
  script: Script
  audio(itemId: string): Promise<Blob>
}
