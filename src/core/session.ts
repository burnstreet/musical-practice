import { type Note, type RoleId, type Song, visibleNotes } from './content'
import { type PassResult, scorePass, type Tolerance } from './scorer'
import type { PitchFrame } from './types'

/** Routes pitch frames into entered notes of the role set and keeps the passes of one session. */
export class Session {
  private entered = new Map<number, PitchFrame[]>() // song note index -> frames, in order of entry
  private done: PassResult[] = []
  /** My visible notes: a unison copy of another of my roles is not mine twice. */
  private mine: Set<Note>

  constructor(
    private song: Song,
    private roles: RoleId[],
    private tol: Tolerance,
  ) {
    this.mine = new Set(visibleNotes(song.notes, roles).filter((n) => roles.includes(n.role)))
  }

  myNotes(): Note[] {
    return [...this.mine]
  }

  /** noteIndex is the index in song.notes. Re-entering discards earlier frames. */
  enter(noteIndex: number): void {
    const n = this.song.notes[noteIndex]
    if (!n || !this.mine.has(n)) return
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
