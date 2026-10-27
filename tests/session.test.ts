import { expect, it } from 'vitest'
import type { Note, Song } from '../src/core/content'
import { Session } from '../src/core/session'

const note = (start: number, role: Note['role']): Note => ({ start, end: start + 1, midi: 67, syllable: 'la', role, phrase: 0, bar: 0, beat: 0, dur: 1 })
const song: Song = {
  id: '08',
  bpm: 90,
  key: 'F',
  timeSig: [4, 4],
  bars: [0],
  notes: [note(1, 'maria'), note(3, 'josef')],
  phrases: [{ index: 0, label: 'P1', start: 0, end: 4 }],
}
const f = (t: number) => ({ t, at: t, midi: 67, clarity: 0.9, rms: 0.1 })

it('frame ignores frames outside entered notes and frames of other roles', () => {
  const s = new Session(song, ['maria'], 50)
  s.startPass()
  s.frame(f(1.5)) // maria note not entered yet
  s.enter(0)
  s.enter(1) // josef: not mine
  s.frame(f(2.5)) // between notes
  s.frame(f(3.5)) // inside josef note
  const r = s.endPass()!
  expect(r.scoredNotes).toBe(1)
  expect(r.notes[0].sung).toBe(false)
  expect(s.myNotes()).toEqual([song.notes[0]])
})
