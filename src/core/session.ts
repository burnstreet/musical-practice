import type { Note, PitchFrame, RoleId, Song } from './content'
import { scorePass, type PassResult, type Tolerance } from './scorer'

/** Routes pitch frames into entered notes of the role set and keeps the passes of one session. */
export class Session {
  private entered = new Map<number, PitchFrame[]>() // song note index -> frames, in order of entry
  private done: PassResult[] = []

  constructor(private song: Song, private roles: RoleId[], private tol: Tolerance) {}

  myNotes(): Note[] {
    return this.song.notes.filter((n) => this.roles.includes(n.role))
  }

  /** noteIndex is the index in song.notes. Re-entering discards earlier frames. */
  enter(noteIndex: number): void {
    const n = this.song.notes[noteIndex]
    if (!n || !this.roles.includes(n.role)) return
    this.entered.delete(noteIndex) // re-insert so the latest entry wins when spans touch
    this.entered.set(noteIndex, [])
  }

  frame(f: PitchFrame): void {
    const hit = [...this.entered].reverse().find(([i]) => this.song.notes[i].start <= f.t && f.t <= this.song.notes[i].end)
    hit?.[1].push(f)
  }

  startPass(): void {
    this.entered = new Map()
  }

  endPass(): PassResult | null {
    if (!this.entered.size) return null
    const result = scorePass(this.song, this.roles, this.entered, this.tol)
    this.done.push(result)
    this.entered = new Map()
    return result
  }

  passes(): PassResult[] {
    return [...this.done]
  }

  trend(): number[] {
    return this.done.map((p) => p.hitPct)
  }
}
