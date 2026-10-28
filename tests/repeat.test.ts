import { expect, it } from 'vitest'
import { ownSpans } from '../src/app/repeat'
import type { Note } from '../src/core/content'

const note = (start: number, end: number): Note => ({ midi: 74, start, end, role: 'maria', phrase: 0, syllable: 'la', bar: 0, beat: 0, dur: 1 })
const bars = Array.from({ length: 30 }, (_, i) => i * 2)

it('own spans less than one bar apart merge, wider gaps stay', () => {
  const song = { bars, notes: [note(10, 14), note(15, 20), note(26, 30)] }
  expect(ownSpans(song, ['maria'])).toEqual([
    { start: 10, end: 20 },
    { start: 26, end: 30 },
  ])
})

it('the gap is measured against the bar that holds its start', () => {
  const song = { bars: [0, 4, 6, 8, 10, 12, 14, 16], notes: [note(0, 3.5), note(5, 6.5), note(8.5, 9), note(10.5, 12)] }
  // gap 3.5-5 lies in a 4 s bar (merge); gap 6.5-8.5 in a 2 s bar (gap 2, not below one bar); gap 9-10.5 merges
  expect(ownSpans(song, ['maria'])).toEqual([
    { start: 0, end: 6.5 },
    { start: 8.5, end: 12 },
  ])
})

it('an empty role set has no spans', () => {
  expect(ownSpans({ bars, notes: [note(10, 14)] }, [])).toEqual([])
})
