import { expect } from 'vitest'
import { steps } from '../gherkin'
import { foldCents, scoreNote, type Tolerance } from '../../src/core/scorer'
import type { Note, PitchFrame, RoleId } from '../../src/core/content'

const note = (start: number, end: number, midi: number, o: Partial<Note> = {}): Note =>
  ({ start, end, midi, syllable: 'la', role: 'maria' as RoleId, phrase: 0, bar: 0, beat: 0, dur: 1, ...o })
/** Frames with the given midis spread evenly over [from, to]. */
const frames = (midis: (number | null)[], from = 1.1, to = 2.0): PitchFrame[] =>
  midis.map((midi, i) => ({ t: Math.min(to, from + ((to - from) * i) / Math.max(1, midis.length - 1)), midi, clarity: 0.9, rms: 0.1 }))
const times = (n: number, midi: number | null) => Array<number | null>(n).fill(midi)
const value = (v: string) => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : +v)

export default steps(({ Given, When, Then }) => {
  Given(/^target midi ([\d.]+) and sung midi ([\d.]+)$/, (ctx, t, s) => { ctx.target = +t; ctx.sung = +s })
  When(/^I fold$/, (ctx) => { ctx.result = { cents: foldCents(ctx.sung, ctx.target) } })
  Then(/^cents is \d+ folded to (-?\d+)$/, (ctx, c) => { expect(ctx.result.cents).toBeCloseTo(+c, 6) })

  Given(/^note \[1.0,2.0\] midi 67 and 10 voiced frames at 67.1 between 1.1 and 2.0$/, (ctx) => {
    ctx.note = note(1, 2, 67); ctx.frames = frames(times(10, 67.1))
  })
  Given(/^note \[1.0,2.0\] midi 67, 3 frames at midi 60 before 1.1, and 10 frames at 67 after$/, (ctx) => {
    ctx.note = note(1, 2, 67); ctx.frames = [...frames(times(3, 60), 1.0, 1.09), ...frames(times(10, 67), 1.1, 2.0)]
  })
  Given(/^note \[1.0,2.0\] midi 67 and 10 frames, 6 at 68 and 4 at 67$/, (ctx) => {
    ctx.note = note(1, 2, 67); ctx.frames = frames([...times(6, 68), ...times(4, 67)])
  })
  Given(/^note \[1.0,2.0\] midi 67 and frames with midi null only$/, (ctx) => {
    ctx.note = note(1, 2, 67); ctx.frames = frames(times(10, null))
  })
  Given(/^note \[1.0,2.0\] midi 67 and 10 frames at 67.6$/, (ctx) => {
    ctx.note = note(1, 2, 67); ctx.frames = frames(times(10, 67.6))
  })
  When(/^I score the note with tolerance (\d+)$/, (ctx, tol) => { ctx.result = scoreNote(ctx.note, ctx.frames, +tol as Tolerance) })
  // "sung is true, hit is true, cents is 10" and friends, checked against ctx.result
  Then(/^((?:sung|hit|cents) is \S+(?:(?:, | and )(?:sung|hit|cents) is \S+)*)$/, (ctx, all) => {
    for (const [, k, v] of all.matchAll(/(\w+) is (\S+?)(?=,|$| )/g)) {
      const want = value(v)
      if (typeof want === 'number') expect(ctx.result[k]).toBeCloseTo(want, 6)
      else expect(ctx.result[k]).toBe(want)
    }
  })
})
