import { expect } from 'vitest'
import { playheadX } from '../../src/app/draw/staff'
import { phrasesOf, staffSong, timeAt, turnFor } from '../../src/editor/view'
// @ts-expect-error plain JS module, no types
import * as ops from '../../web/edit-ops.js'
import { steps } from '../gherkin'

const { addSection, deleteSection, rebarSection, redetectSections, renameSection, sectionBars, setRole, togglePhraseStart, toggleSpoken } = ops

// 20 bars of 2 s; the song ends with the last bar unless a step says otherwise
const grid = (end = 40) => ({ bars: Array.from({ length: 20 }, (_, i) => i * 2), end })
const names = (ctx: any) => ctx.sections.map((s: any) => s.name)
const at = (name: string, start: number, end: number) => ({ name, start, end })

function edit(ctx: any, op: () => unknown) {
  ctx.before = structuredClone(ctx.sections)
  try {
    ctx.sections = op()
  } catch (e) {
    ctx.error = (e as Error).message
  }
}

export default steps(({ Given, When, Then }) => {
  Given(/^a loaded song with notes 1-4 and notes 2-3 selected$/, (ctx) => {
    ctx.song = { notes: [0, 1, 2, 3].map((i) => ({ midi: 60 + i, role: 'maria' })) }
    ctx.selected = new Set([1, 2])
  })
  When(/^I choose role "(\w+)" and press "Rolle setzen"$/, (ctx, role) => {
    setRole(ctx.song.notes, ctx.selected, role)
  })
  Then(/^notes 2 and 3 have role "(\w+)" and notes 1 and 4 are unchanged$/, (ctx, role) => {
    expect(ctx.song.notes.map((n: any) => n.role)).toEqual(['maria', role, role, 'maria'])
  })

  Given(/^note 3 selected without phraseStart$/, (ctx) => {
    ctx.song = { notes: [0, 1, 2].map((i) => ({ midi: 60 + i })) }
    ctx.selected = new Set([2])
  })
  When(/^I press "Phrasenanfang"(?: again)?$/, (ctx) => {
    togglePhraseStart(ctx.song.notes, ctx.selected)
  })
  Then(/^note 3 has phraseStart true$/, (ctx) => {
    expect(ctx.song.notes[2].phraseStart).toBe(true)
  })
  Then(/^note 3 has no phraseStart$/, (ctx) => {
    expect('phraseStart' in ctx.song.notes[2]).toBe(false)
  })

  Given(/^notes 2-3 selected, note 3 already spoken$/, (ctx) => {
    ctx.song = { notes: [0, 1, 2, 3].map((i) => ({ midi: 60 + i, ...(i === 2 ? { spoken: true } : {}) })) }
    ctx.selected = new Set([1, 2])
  })
  When(/^I press "Rap"(?: again)?$/, (ctx) => {
    toggleSpoken(ctx.song.notes, ctx.selected)
  })
  Then(/^notes 2 and 3 are spoken and notes 1 and 4 are not$/, (ctx) => {
    expect(ctx.song.notes.map((n: any) => n.spoken === true)).toEqual([false, true, true, false])
  })
  Then(/^no note is spoken$/, (ctx) => {
    expect(ctx.song.notes.some((n: any) => 'spoken' in n)).toBe(false)
  })

  // sections
  Given(/^(?:a song with )?(?:bars every 2 s over )?20 bars(?: and no sections)?$/, (ctx) => {
    ctx.grid = grid()
    ctx.sections = []
  })
  Given(/^bars every 2 s over 20 bars with the song ending at ([\d.]+)$/, (ctx, end) => {
    ctx.grid = grid(Number(end))
    ctx.sections = []
  })
  Given(/^a section "([^"]+)" from bar (\d+) to bar (\d+)$/, (ctx, name, from, to) => {
    ctx.grid = grid()
    ctx.sections = addSection([], ctx.grid, name, Number(from), Number(to))
  })
  Given(/^a section "([^"]+)"(?: \[([\d.]+),([\d.]+)\])?$/, (ctx, name, start = '4', end = '10') => {
    ctx.grid = grid()
    ctx.sections = [at(name, Number(start), Number(end))]
  })
  Given(/^sections "([^"]+)" and "([^"]+)"(?: and detected sections "([^"]+)" and "([^"]+)" from the builder)?$/, (ctx, a, b, d1, d2) => {
    ctx.grid = grid()
    ctx.sections = [at(a, 0, 4), at(b, 4, 8)]
    if (d1) ctx.detected = [at(d1, 8, 16), at(d2, 16, 24)]
  })

  When(/^I add (?:the section |a section )?(?:"([^"]+)" )?from bar (\d+) to bar (\d+)$/, (ctx, name = 'Abschnitt', from, to) => {
    edit(ctx, () => addSection(ctx.sections, ctx.grid, name, Number(from), Number(to)))
  })
  When(/^I rename it to "([^"]+)"$/, (ctx, name) => {
    edit(ctx, () => renameSection(ctx.sections, 0, name))
  })
  When(/^I set it from bar (\d+) to bar (\d+)$/, (ctx, from, to) => {
    edit(ctx, () => rebarSection(ctx.sections, ctx.grid, 0, Number(from), Number(to)))
  })
  When(/^I delete "([^"]+)"$/, (ctx, name) => {
    edit(ctx, () => deleteSection(ctx.sections, names(ctx).indexOf(name)))
  })
  When(/^I confirm "Abschnitte neu erkennen"$/, async (ctx) => {
    ctx.sections = await redetectSections(
      ctx.sections,
      () => true,
      async () => ctx.detected,
    )
  })
  When(/^I cancel the confirmation of "Abschnitte neu erkennen"$/, async (ctx) => {
    ctx.sections = await redetectSections(
      ctx.sections,
      () => false,
      async () => {
        throw new Error('detect must not run after cancel')
      },
    )
  })

  Then(/^the sections are "([^"]+)" \[([\d.]+),([\d.]+)\]$/, (ctx, name, start, end) => {
    expect(ctx.sections).toEqual([at(name, Number(start), Number(end))])
  })
  Then(/^the section is \[([\d.]+),([\d.]+)\]$/, (ctx, start, end) => {
    expect(ctx.sections.map((s: any) => [s.start, s.end])).toEqual([[Number(start), Number(end)]])
  })
  Then(/^the sections are "([^"]+)" (?:then|and) "([^"]+)"$/, (ctx, a, b) => {
    expect(names(ctx)).toEqual([a, b])
  })
  Then(/^it is named "([^"]+)" and its times are unchanged$/, (ctx, name) => {
    expect(ctx.sections).toEqual([at(name, 4, 10)])
  })
  Then(/^it is \[([\d.]+),([\d.]+)\]$/, (ctx, start, end) => {
    expect(ctx.sections.map((s: any) => [s.start, s.end])).toEqual([[Number(start), Number(end)]])
  })
  Then(/^only "([^"]+)" is left$/, (ctx, name) => {
    expect(names(ctx)).toEqual([name])
  })
  Then(/^the sections are unchanged and the editor shows an error$/, (ctx) => {
    expect(ctx.sections).toEqual(ctx.before)
    expect(ctx.error).toBeTruthy()
  })
  Then(/^its row reads from bar (\d+) to bar (\d+)$/, (ctx, from, to) => {
    expect(sectionBars(ctx.sections[0], ctx.grid)).toEqual({ from: Number(from), to: Number(to) })
  })

  // view
  const lyricNotes = (words: string) => [...words.matchAll(/"([^"]+)"/g)].map((m, i) => ({ start: i, end: i + 0.5, midi: 60, lyric: m[1] }))
  Given(/^notes (.+) where note (\d+) has phraseStart$/, (ctx, words, k) => {
    ctx.notes = lyricNotes(words)
    ctx.notes[Number(k) - 1].phraseStart = true
  })
  Given(/^notes (.+) with phrases ([\d, ]+)$/, (ctx, words, phrases) => {
    ctx.notes = lyricNotes(words)
    phrases.split(', ').forEach((p: string, i: number) => {
      ctx.notes[i].phrase = Number(p)
    })
  })
  Then(/^the phrase band shows "([^"]+)" and "([^"]+)"$/, (ctx, a, b) => {
    expect(phrasesOf(ctx.notes).map((p) => `${p.number} ${p.text}`)).toEqual([a, b])
  })
  Given(/^bars every 2 s, a note at ([\d.]+) s on beat (\d+) and a note at ([\d.]+) s on beat (\d+)$/, (ctx, s1, b1, s2, b2) => {
    const note = (start: string, beat: string) => ({ start: Number(start), end: Number(start) + 0.4, midi: 60, beat: Number(beat), dur: 1 })
    ctx.song = staffSong({ id: 't', notes: [note(s1, b1), note(s2, b2)] }, grid().bars)
  })
  Given(/^a song in (\d)\/4 with bars every ([\d.]+) s and a note at ([\d.]+) s on beat (\d+)$/, (ctx, beats, len, start, beat) => {
    const bars = Array.from({ length: 10 }, (_, i) => i * Number(len))
    const note = { start: Number(start), end: Number(start) + 0.4, midi: 60, beat: Number(beat), dur: 1 }
    ctx.song = staffSong({ id: 't', notes: [note] }, bars, 'C', Number(beats))
  })
  Then(/^the staff reads (\d)\/4 at (\d+) bpm and puts the note in bar (\d+)$/, (ctx, beats, bpm, bar) => {
    expect(ctx.song.timeSig).toEqual([Number(beats), 4])
    expect(ctx.song.bpm).toBeCloseTo(Number(bpm))
    expect(ctx.song.notes[0].bar + 1).toBe(Number(bar))
  })
  Given(/^staff bar lines at x (.+) for (.+)$/, (ctx, xs, ts) => {
    const nums = (s: string) => s.match(/[\d.]+/g)!.map(Number)
    ctx.points = nums(ts).map((t, i) => [t, nums(xs)[i]])
  })
  Then(/^([\d.]+) s is at x ([\d.]+) on the roll and x ([\d.]+) is ([\d.]+) s$/, (ctx, t, x, x2, t2) => {
    expect(playheadX(ctx.points, Number(t))).toBeCloseTo(Number(x))
    expect(timeAt(ctx.points, Number(x2))).toBeCloseTo(Number(t2))
  })
  Given(/^bars every 2 s, a page of bars (\d+) to (\d+) and selected notes in bars (\d+) and (\d+)$/, (ctx, from, to, b1, b2) => {
    const note = (bar: string) => ({ start: (Number(bar) - 1) * 2 + 0.1, end: (Number(bar) - 1) * 2 + 0.5, midi: 60, beat: 0, dur: 1 })
    ctx.song = staffSong({ id: 't', notes: [note('1'), note(b2), note(b1)] }, grid().bars)
    ctx.turn = turnFor(ctx.song, { first: Number(from) - 1, count: Number(to) - Number(from) + 1 }, new Set([1, 2]))
  })
  Then(/^the view turns to ([\d.]+) s$/, (ctx, t) => {
    expect(ctx.turn).toBe(Number(t))
  })
  Then(/^the view stays on the page$/, (ctx) => {
    expect(ctx.turn).toBeNull()
  })
  Then(/^the staff puts both notes in bar (\d+)$/, (ctx, bar) => {
    expect(ctx.song.notes.map((n: any) => n.bar + 1)).toEqual([Number(bar), Number(bar)])
  })
})
