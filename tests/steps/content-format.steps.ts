import { expect } from 'vitest'
import { ContentError, parseLibrary, parseManifest, parseSong, type RoleId, roleSpans, visibleNotes } from '../../src/core/content'
import { steps } from '../gherkin'

const SALT = Buffer.alloc(16, 7).toString('base64')
const manifest = (o: object = {}) => ({
  format: 1,
  build: '2026-01-01T00:00:00Z',
  keyId: '0123456789abcdef',
  salt: SALT,
  iterations: 600000,
  library: 'fedcba9876543210',
  songCount: 2,
  totalBytes: 300,
  files: { fedcba9876543210: 100 },
  ...o,
})
const files = { voices: '0000000000000001', backing: '0000000000000002', notes: '0000000000000003' }
const song = (id: string, number: number, roles = ['maria']) => ({ id, number, title: 't', durationSec: 10, roles, files })
const note = (start: number, end: number, role = 'maria', phrase = 0) => ({ start, end, midi: 60, syllable: 'la', role, phrase, bar: 0, beat: 0, dur: 1 })
const songJson = (notes: object[], phrases = [{ index: 0, label: 'p', start: 0, end: 1 }], extra: object = {}) => ({
  id: '08',
  bpm: 90,
  key: 'F',
  timeSig: [4, 4],
  bars: [0],
  notes,
  phrases,
  ...extra,
})
const pairs = (s: string) => [...s.matchAll(/\[([\d.]+),([\d.]+)\]/g)].map((m) => ({ start: +m[1], end: +m[2] }))
const attempt = (ctx: any, fn: () => unknown) => {
  try {
    ctx.result = fn()
  } catch (e) {
    ctx.error = e
  }
}

export default steps(({ Given, When, Then }) => {
  Given(
    /^a manifest JSON with format 1, keyId "(.*)", a 16-byte base64 salt, iterations (\d+), library "(.*)", songCount (\d+), totalBytes (\d+), files (.*)$/,
    (ctx, keyId, it, library, sc, tb, f) => {
      ctx.json = manifest({ keyId, iterations: +it, library, songCount: +sc, totalBytes: +tb, files: JSON.parse(f) })
    },
  )
  Given(/^a manifest JSON with format (\d+)(?: and otherwise valid fields)?$/, (ctx, f) => {
    ctx.json = manifest({ format: +f })
  })
  Then(/^I get the manifest$/, (ctx) => {
    expect(ctx.error).toBeUndefined()
    expect(ctx.result).toMatchObject({ format: 2 })
  })
  Given(/^a valid manifest JSON whose files contain the id "(.*)"$/, (ctx, id) => {
    ctx.json = manifest({ files: { fedcba9876543210: 1, [id]: 2 } })
  })
  When(/^I parse it as a manifest$/, (ctx) => attempt(ctx, () => parseManifest(ctx.json)))
  Then(/^I get songCount (\d+) and totalBytes (\d+)$/, (ctx, sc, tb) => {
    expect(ctx.error).toBeUndefined()
    expect(ctx.result).toMatchObject({ songCount: +sc, totalBytes: +tb })
  })
  Then(/^parsing fails with ContentError "(.*)"$/, (ctx, field) => {
    expect(ctx.error).toBeInstanceOf(ContentError)
    expect(ctx.error.field).toBe(field)
  })

  Given(/^a library JSON with roles \[maria\] and a song with roles \[maria, ghost\]$/, (ctx) => {
    ctx.json = { roles: [{ id: 'maria', name: 'Maria', sings: true }], songs: [song('01', 1, ['maria', 'ghost'])] }
  })
  Given(/^a library JSON with songs numbered 3, 1, 2$/, (ctx) => {
    ctx.json = { roles: [{ id: 'maria', name: 'Maria', sings: true }], songs: [song('c', 3), song('a', 1), song('b', 2)] }
  })
  When(/^I parse it as a library$/, (ctx) => attempt(ctx, () => parseLibrary(ctx.json)))
  Then(/^song ids come back in order of number 1, 2, 3$/, (ctx) => {
    expect(ctx.result.songs.map((s: any) => s.id)).toEqual(['a', 'b', 'c'])
  })

  Given(/^a song JSON whose notes start at 2.0 then 1.0$/, (ctx) => {
    ctx.json = songJson([note(2, 3), note(1, 1.5)])
  })
  Given(/^a song JSON with one phrase and a note with phrase 3$/, (ctx) => {
    ctx.json = songJson([note(1, 2, 'maria', 3)])
  })
  Given(/^a song JSON with a note marked spoken (.*)$/, (ctx, v) => {
    ctx.json = songJson([{ ...note(1, 2), spoken: JSON.parse(v) }])
  })
  Then(/^the note is spoken$/, (ctx) => {
    expect(ctx.error).toBeUndefined()
    expect(ctx.result.notes[0].spoken).toBe(true)
  })
  const sec = (name: string, [start, end]: number[]) => ({ name, start, end })
  const withSections = (ctx: any, sections: object[]) => {
    ctx.json = songJson([note(1, 2)], undefined, { sections })
  }
  Given(/^a song JSON with sections "(.*)" \[([\d.]+),([\d.]+)\] and "(.*)" \[([\d.]+),([\d.]+)\]$/, (ctx, n1, a, b, n2, c, d) => {
    withSections(ctx, [sec(n1, [+a, +b]), sec(n2, [+c, +d])])
  })
  Given(/^a song JSON with sections (\[.*\]) (?:and|then) (\[.*\])$/, (ctx, a, b) => {
    withSections(ctx, [...pairs(a), ...pairs(b)])
  })
  Given(/^a song JSON with a section (\[.*\])$/, (ctx, a) => withSections(ctx, pairs(a)))
  Given(/^a song JSON with a section named ""$/, (ctx) => withSections(ctx, [sec('', [0, 10])]))
  Given(/^a song JSON without a sections field$/, (ctx) => {
    ctx.json = songJson([note(1, 2)])
  })
  Then(/^song.sections has two entries named "(.*)" and "(.*)"$/, (ctx, a, b) => {
    expect(ctx.error).toBeUndefined()
    expect(ctx.result.sections.map((s: any) => s.name)).toEqual([a, b])
  })
  Then(/^parsing succeeds and song.sections is empty$/, (ctx) => {
    expect(ctx.error).toBeUndefined()
    expect(ctx.result.sections).toEqual([])
  })
  When(/^I parse it as a song$/, (ctx) => attempt(ctx, () => parseSong(ctx.json)))

  Given(/^notes for role maria at (.*) and a note for josef at (.*)$/, (ctx, a, b) => {
    ctx.notes = [...pairs(a).map((p) => note(p.start, p.end)), ...pairs(b).map((p) => note(p.start, p.end, 'josef'))]
  })
  Given(/^notes for role maria at (.*) and for josef at (.*)$/, (ctx, a, b) => {
    ctx.notes = [...pairs(a).map((p) => note(p.start, p.end)), ...pairs(b).map((p) => note(p.start, p.end, 'josef'))]
  })
  When(/^I compute role spans for \[(.*)\]$/, (ctx, r) => {
    ctx.result = roleSpans(ctx.notes, r.split(',').map((s: string) => s.trim()) as RoleId[])
  })
  Then(/^I get spans (.*)$/, (ctx, s) => {
    expect(ctx.result).toEqual(pairs(s))
  })

  // "maria 67 at [1.0,2.0], josef 64 at [3.0,4.0]" -> role, midi, start, end
  const voiced = (s: string) =>
    [...s.matchAll(/(\w+) (\d+) at \[([\d.]+),([\d.]+)\]/g)].map(([, role, midi, a, b]) => ({ role, midi: +midi, start: +a, end: +b }))
  Given(/^notes (.* at \[.*)$/, (ctx, s) => {
    ctx.notes = voiced(s).map((v) => ({ ...note(v.start, v.end, v.role), midi: v.midi }))
  })
  When(/^I take the visible notes for \[(.*)\]$/, (ctx, r) => {
    ctx.result = visibleNotes(ctx.notes, r.split(',').map((s: string) => s.trim()) as RoleId[])
  })
  Then(/^I get (\w+ \d+ at .*)$/, (ctx, s) => {
    expect(ctx.result.map(({ role, midi, start, end }: any) => ({ role, midi, start, end }))).toEqual(voiced(s))
  })
})
