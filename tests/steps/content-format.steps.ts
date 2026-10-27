import { expect } from 'vitest'
import { steps } from '../gherkin'
import { ContentError, parseLibrary, parseManifest, parseSong, roleSpans, type RoleId } from '../../src/core/content'

const SALT = Buffer.alloc(16, 7).toString('base64')
const manifest = (o: object = {}) => ({ format: 1, build: '2026-01-01T00:00:00Z', keyId: '0123456789abcdef', salt: SALT, iterations: 600000, library: 'fedcba9876543210', songCount: 2, totalBytes: 300, files: { fedcba9876543210: 100 }, ...o })
const files = { voices: '0000000000000001', backing: '0000000000000002', notes: '0000000000000003' }
const song = (id: string, number: number, roles = ['maria']) => ({ id, number, title: 't', durationSec: 10, roles, files })
const note = (start: number, end: number, role = 'maria', phrase = 0) => ({ start, end, midi: 60, syllable: 'la', role, phrase, bar: 0, beat: 0, dur: 1 })
const songJson = (notes: object[], phrases = [{ index: 0, label: 'p', start: 0, end: 1 }]) => ({ id: '08', bpm: 90, key: 'F', timeSig: [4, 4], bars: [0], notes, phrases })
const pairs = (s: string) => [...s.matchAll(/\[([\d.]+),([\d.]+)\]/g)].map((m) => ({ start: +m[1], end: +m[2] }))
const attempt = (ctx: any, fn: () => unknown) => {
  try { ctx.result = fn() } catch (e) { ctx.error = e }
}

export default steps(({ Given, When, Then }) => {
  Given(/^a manifest JSON with format 1, keyId "(.*)", a 16-byte base64 salt, iterations (\d+), library "(.*)", songCount (\d+), totalBytes (\d+), files (.*)$/, (ctx, keyId, it, library, sc, tb, f) => {
    ctx.json = manifest({ keyId, iterations: +it, library, songCount: +sc, totalBytes: +tb, files: JSON.parse(f) })
  })
  Given(/^a manifest JSON with format 2$/, (ctx) => { ctx.json = manifest({ format: 2 }) })
  Given(/^a valid manifest JSON whose files contain the id "(.*)"$/, (ctx, id) => { ctx.json = manifest({ files: { fedcba9876543210: 1, [id]: 2 } }) })
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

  Given(/^a song JSON whose notes start at 2.0 then 1.0$/, (ctx) => { ctx.json = songJson([note(2, 3), note(1, 1.5)]) })
  Given(/^a song JSON with one phrase and a note with phrase 3$/, (ctx) => { ctx.json = songJson([note(1, 2, 'maria', 3)]) })
  When(/^I parse it as a song$/, (ctx) => attempt(ctx, () => parseSong(ctx.json)))

  Given(/^notes for role maria at (.*) and a note for josef at (.*)$/, (ctx, a, b) => {
    ctx.notes = [...pairs(a).map((p) => note(p.start, p.end)), ...pairs(b).map((p) => note(p.start, p.end, 'josef'))]
  })
  Given(/^notes for role maria at (.*) and for josef at (.*)$/, (ctx, a, b) => {
    ctx.notes = [...pairs(a).map((p) => note(p.start, p.end)), ...pairs(b).map((p) => note(p.start, p.end, 'josef'))]
  })
  When(/^I compute role spans for \[(.*)\]$/, (ctx, r) => { ctx.result = roleSpans(ctx.notes, r.split(',').map((s: string) => s.trim()) as RoleId[]) })
  Then(/^I get spans (.*)$/, (ctx, s) => { expect(ctx.result).toEqual(pairs(s)) })
})
