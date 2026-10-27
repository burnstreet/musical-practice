import { expect } from 'vitest'
import { steps } from '../gherkin'
import { foldCents, scoreNote, scorePass, type Tolerance } from '../../src/core/scorer'
import { Session } from '../../src/core/session'
import type { Note, RoleId, Song } from '../../src/core/content'
import type { PitchFrame } from '../../src/core/types'

const note = (start: number, end: number, midi: number, o: Partial<Note> = {}): Note =>
  ({ start, end, midi, syllable: 'la', role: 'maria' as RoleId, phrase: 0, bar: 0, beat: 0, dur: 1, ...o })
/** Frames with the given midis spread evenly over [from, to]. */
const frames = (midis: (number | null)[], from = 1.1, to = 2.0): PitchFrame[] =>
  midis.map((midi, i) => ({ t: Math.min(to, from + ((to - from) * i) / Math.max(1, midis.length - 1)), midi, clarity: 0.9, rms: 0.1 }))
const times = (n: number, midi: number | null) => Array<number | null>(n).fill(midi)
const value = (v: string) => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v)

/** Song fixture: note i spans [1+2i, 2+2i], midi 67, phrase and role as given. */
const song = (spec: { phrase?: number; role?: RoleId; syllable?: string }[]): Song => {
  const notes = spec.map((o, i) => note(1 + 2 * i, 2 + 2 * i, 67, { phrase: 0, ...o }))
  const count = Math.max(...notes.map((n) => n.phrase)) + 1
  const phrases = Array.from({ length: count }, (_, index) => ({ index, label: `P${index + 1}`, start: 0, end: 0 }))
  return { id: '08', bpm: 90, key: 'F', timeSig: [4, 4], bars: [0], notes, phrases }
}
/** Frames over the scored window of n, one per deviation in cents. */
const sing = (n: Note, cents: number[]) => frames(cents.map((c) => n.midi + c / 100), n.start + 0.1, n.end)
const enter = (ctx: any, i: number, cents: number[] = []) => ctx.byNote.set(i, sing(ctx.song.notes[i], cents))
const pass = (ctx: any, tol = 50) => { ctx.tol = tol; ctx.result = scorePass(ctx.song, ctx.roles, ctx.byNote, tol as Tolerance) }

// Frames per note for "note cents 10, -10, -60, -40". Not uniform on purpose: with 6 frames all at -40 that note
// would be a hit at tolerance 50 and hitPct would be 75. Medians are 10, -10, -60, -40; only the first two notes have
// at least half their frames within ±50; the frame mean over all 24 frames is -25; phrase 1 max |cents| is 65.
const STATS = [[-35, -35, 10, 10, 10, 20], [-10, -10, -10, -10, -10, -10], [-65, -60, -60, -60, -60, -55], [-60, -60, -60, -20, -20, 60]]
const statsSong = (ctx: any) => {
  ctx.song = song([{ phrase: 0 }, { phrase: 0 }, { phrase: 1 }, { phrase: 1 }]); ctx.roles = ['maria']; ctx.byNote = new Map()
}
const statsFrames = (ctx: any) => STATS.forEach((c, i) => enter(ctx, i, c))

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
  Given(/^a song with 4 maria notes in phrases 0,0,1,1 and roles \[maria\]$/, statsSong)
  Given(/^frames giving note cents 10, -10, -60, -40 with 6 frames each$/, statsFrames)
  When(/^I score the pass with tolerance (\d+)$/, (ctx, tol) => pass(ctx, +tol))
  When(/^I score the pass$/, (ctx) => pass(ctx))
  Then(/^phrase (\d+) meanCents is (-?\d+) and phrase (\d+) meanCents is (-?\d+)$/, (ctx, a, ca, b, cb) => {
    const mean = (i: string) => ctx.result.phrases.find((p: any) => p.index === +i).meanCents
    expect(mean(a)).toBeCloseTo(+ca, 6)
    expect(mean(b)).toBeCloseTo(+cb, 6)
  })

  Given(/^the pass above where note 3 has syllable "(.*)" and maxAbsCents (\d+)$/, (ctx, syl, max) => {
    statsSong(ctx); ctx.song.notes[2].syllable = syl; statsFrames(ctx); pass(ctx)
    expect(ctx.result.notes[2].maxAbsCents).toBeCloseTo(+max, 6)
  })
  Given(/^a pass where every scored note is a hit with \|cents\| under 10$/, (ctx) => {
    statsSong(ctx); [5, -5, 8, 0].forEach((c, i) => enter(ctx, i, Array(6).fill(c))); pass(ctx)
  })
  Given(/^a pass where phrase 0 has cents near 0 and 2 of 4 notes unsung, first unsung syllable "(.*)"$/, (ctx, syl) => {
    ctx.song = song([{}, { syllable: syl }, {}, {}]); ctx.roles = ['maria']; ctx.byNote = new Map()
    enter(ctx, 0, [2, 2, 2]); enter(ctx, 1); enter(ctx, 2, [-3, -3, -3]); enter(ctx, 3); pass(ctx)
  })
  Then(/^tip is "(.*)"$/, (ctx, tip) => { expect(ctx.result.tip).toBe(tip) })

  Given(/^a song with maria and josef notes and roles \[maria\]$/, (ctx) => {
    ctx.song = song([{}, { role: 'josef' }, {}, { role: 'josef' }]); ctx.roles = ['maria']; ctx.byNote = new Map()
  })
  Given(/^frames inside josef notes only$/, (ctx) => { [0, 2].forEach((i) => enter(ctx, i)); [1, 3].forEach((i) => enter(ctx, i, [0, 0, 0])) })
  Then(/^scoredNotes counts only entered maria notes and josef frames change nothing$/, (ctx) => {
    expect(ctx.result.scoredNotes).toBe(2)
    expect(ctx.result).toMatchObject({ hits: 0, meanCents: null, rangeMidi: null })
    const mariaOnly = new Map<number, PitchFrame[]>([...ctx.byNote].filter(([i]) => i % 2 === 0))
    expect(ctx.result).toEqual(scorePass(ctx.song, ctx.roles, mariaOnly, 50))
  })
  Given(/^a song with 10 maria notes and only notes 1-4 entered$/, (ctx) => {
    ctx.song = song(Array(10).fill({})); ctx.roles = ['maria']; ctx.byNote = new Map()
    for (const i of [0, 1, 2, 3]) enter(ctx, i)
  })
  Given(/^target midi 67 and frames at midi 55 and 57$/, (ctx) => {
    ctx.song = song([{}]); ctx.roles = ['maria']; ctx.byNote = new Map([[0, frames([55, 57])]])
  })
  Then(/^rangeMidi is \[(\d+), (\d+)\]$/, (ctx, lo, hi) => { expect(ctx.result.rangeMidi).toEqual([+lo, +hi]) })

  Given(/^a session with note 0 \[1.0,2.0\] midi 67$/, (ctx) => { ctx.session = new Session(song([{}]), ['maria'], 50) })
  When(/^I start a pass, enter note 0, feed frames at 60, enter note 0 again, feed frames at 67, end the pass$/, (ctx) => {
    const s: Session = ctx.session
    s.startPass(); s.enter(0); frames(times(10, 60)).forEach((f) => s.frame(f))
    s.enter(0); frames(times(10, 67)).forEach((f) => s.frame(f)); ctx.result = s.endPass()
  })
  Then(/^note 0 is a hit$/, (ctx) => { expect(ctx.result.notes[0].hit).toBe(true) })

  Given(/^a session$/, (ctx) => { ctx.song = song(Array(5).fill({})); ctx.session = new Session(ctx.song, ['maria'], 50) })
  When(/^I complete passes with hitPct (.*)$/, (ctx, list) => {
    const s: Session = ctx.session
    for (const pct of list.split(', ').map(Number)) {
      s.startPass()
      ctx.song.notes.forEach((n: Note, i: number) => { s.enter(i); if (i < pct / 20) sing(n, [0, 0, 0]).forEach((f) => s.frame(f)) })
      s.endPass()
    }
  })
  Then(/^trend is \[(.*)\] and the pass number is (\d+)$/, (ctx, list, n) => {
    expect(ctx.session.trend()).toEqual(list.split(', ').map(Number))
    expect(ctx.session.passes().length).toBe(+n)
  })
  When(/^I start a pass and end it without entering a note$/, (ctx) => { ctx.session.startPass(); ctx.result = ctx.session.endPass() })
  Then(/^endPass returns null and passes\(\) is empty$/, (ctx) => {
    expect(ctx.result).toBeNull()
    expect(ctx.session.passes()).toEqual([])
  })

  // "sung is true, hit is true, cents is 10", "hitPct is 50, meanCents is -25, tendency is low" etc., checked against ctx.result
  Then(/^(\w+ is [^\s,]+(?:(?:, | and )\w+ is [^\s,]+)*)$/, (ctx, all) => {
    for (const [, k, v] of all.matchAll(/(\w+) is ([^\s,]+)/g)) {
      const want = value(v)
      if (typeof want === 'number') expect(ctx.result[k]).toBeCloseTo(want, 6)
      else expect(ctx.result[k]).toBe(want)
    }
  })
})
