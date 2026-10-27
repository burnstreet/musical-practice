import { expect } from 'vitest'
import { steps } from '../gherkin'
import { createAudioEngine, type Mode } from '../../src/core/audio-engine'
import type { Note, Phrase, RoleId } from '../../src/core/content'
import type { LoadedSong } from '../../src/core/types'

type Clock = { t: number }

// Media element whose currentTime advances with the fake clock at playbackRate.
class FakeMedia extends EventTarget {
  src = ''
  preservesPitch = false
  paused = true
  sets = 0
  private base = 0
  private at = 0
  private rate = 1
  constructor(private clock: Clock) { super() }
  get currentTime() { return this.base + (this.paused ? 0 : (this.clock.t - this.at) * this.rate) }
  set currentTime(v: number) { this.sets++; this.jump(v) }
  get playbackRate() { return this.rate }
  set playbackRate(r: number) { this.jump(this.currentTime); this.rate = r }
  /** Moves the playhead without counting as an engine write. */
  jump(v: number) { this.base = v; this.at = this.clock.t }
  play() { this.jump(this.currentTime); this.paused = false; return Promise.resolve() }
  pause() { this.jump(this.currentTime); this.paused = true }
}

// AudioParam that records automation and replays it to read the value at any time.
class FakeParam {
  events: { kind: 'set' | 'ramp'; v: number; t: number }[] = []
  constructor(private clock: Clock, private initial = 1) {}
  get value() { return this.at(this.clock.t) }
  setValueAtTime(v: number, t: number) { this.add('set', v, t) }
  linearRampToValueAtTime(v: number, t: number) { this.add('ramp', v, t) }
  cancelScheduledValues(t: number) { this.events = this.events.filter((e) => e.t < t) }
  private add(kind: 'set' | 'ramp', v: number, t: number) {
    this.events.push({ kind, v, t })
    this.events.sort((a, b) => a.t - b.t)
  }
  at(T: number) {
    let pt = 0, pv = this.initial
    for (const e of this.events) {
      if (T < e.t) return e.kind === 'ramp' ? pv + ((e.v - pv) * (T - pt)) / (e.t - pt) : pv
      pt = e.t
      pv = e.v
    }
    return pv
  }
}

const note = (start: number, end: number, role: RoleId = 'maria'): Note => ({ start, end, midi: 60, syllable: 'la', role, phrase: 0, bar: 0, beat: 0, dur: 1 })
const phrase = (index: number, start: number, end: number): Phrase => ({ index, label: `p${index}`, start, end })

async function setup(ctx: any, notes: Note[] = [], roles: RoleId[] = ['maria'], phrases: Phrase[] = [phrase(0, 0, 100)]) {
  const clock: Clock = { t: 0 }
  const elements: FakeMedia[] = []
  const gains: { el?: FakeMedia; gain: FakeParam }[] = []
  let frames: (() => void)[] = []
  const engine = createAudioEngine({
    createElement: () => { const el = new FakeMedia(clock); elements.push(el); return el as any },
    createContext: () => ({
      get currentTime() { return clock.t },
      destination: {},
      resume: async () => {},
      createGain: () => { const g = { gain: new FakeParam(clock), connect() {} }; gains.push(g); return g },
      createMediaElementSource: (el: FakeMedia) => ({ connect: (g: { el?: FakeMedia }) => { g.el = el } }),
    }) as any,
    requestFrame: (cb) => void frames.push(cb),
    createObjectURL: (b) => `blob:${(b as Blob).type}`,
    revokeObjectURL: () => {},
  })
  const song = { id: '08', bpm: 90, key: 'F', timeSig: [4, 4], bars: [0], notes, phrases }
  await engine.load({ meta: {} as any, song, voices: new Blob([], { type: 'voices' }), backing: new Blob([], { type: 'backing' }) } as LoadedSong, roles)
  const el = (type: string) => elements.find((e) => e.src === `blob:${type}`)!
  Object.assign(ctx, {
    clock, engine, enters: [] as Note[], loops: [] as Phrase[], ended: 0,
    voices: el('voices'), backing: el('backing'),
    voicesGain: () => gains.find((g) => g.el === ctx.voices)!.gain,
    backingGain: () => gains.find((g) => g.el === ctx.backing)!.gain,
    // one animation frame at clock time t
    tickAt: (t: number) => { clock.t = t; const run = frames; frames = []; run.forEach((f) => f()) },
  })
  engine.on('enter', (n) => ctx.enters.push(n))
  engine.on('loop', (p) => ctx.loops.push(p))
  engine.on('ended', () => ctx.ended++)
}

const mutingSong = (ctx: any, roles: RoleId[], mode: string, m = [1, 2], j = [3, 4]) =>
  setup(ctx, [note(m[0], m[1]), note(j[0], j[1], 'josef')], roles).then(() => ctx.engine.setMode(mode as Mode))
const run = (ctx: any, until: number) => { while (ctx.clock.t < until) ctx.tickAt(ctx.clock.t + 1 / 60) }
const samples = () => Array.from({ length: 51 }, (_, i) => i / 10)

export default steps(({ Given, When, Then }) => {
  Given(/^a song with maria notes at \[([\d.]+),([\d.]+)\] and josef notes at \[([\d.]+),([\d.]+)\], roles \[(\w+)\], mode (\w+)$/, (ctx, a, b, c, d, r, m) =>
    mutingSong(ctx, [r as RoleId], m, [+a, +b], [+c, +d]))
  Given(/^the same song, roles \[(\w+)\], mode (\w+)$/, (ctx, r, m) => mutingSong(ctx, [r as RoleId], m))
  Given(/^the same song, mode (\w+)$/, (ctx, m) => mutingSong(ctx, ['maria'], m))
  When(/^playback runs from 0 to (\d+)$/, async (ctx, end) => {
    await ctx.engine.play()
    run(ctx, +end)
  })
  Then(/^voices gain is (\d) throughout(?: and backing gain is (\d))?$/, (ctx, v, b) => {
    for (const t of samples()) expect(ctx.voicesGain().at(t), `voices at ${t}`).toBe(+v)
    if (b) for (const t of samples()) expect(ctx.backingGain().at(t), `backing at ${t}`).toBe(+b)
  })
  Then(/^voices gain is (.*)$/, (ctx, list) => {
    for (const [, v, t] of list.matchAll(/(\d) at ([\d.]+)/g)) expect(ctx.voicesGain().at(+t), `at ${t}`).toBeCloseTo(+v)
  })
  Then(/^the ramp to 0 starts at ([\d.]+) and ends by ([\d.]+)$/, (ctx, s, e) => {
    const g = ctx.voicesGain()
    expect(g.at(+s)).toBeCloseTo(1)
    expect(g.at((+s + +e) / 2)).toBeGreaterThan(0)
    expect(g.at((+s + +e) / 2)).toBeLessThan(1)
    expect(g.at(+e)).toBeCloseTo(0)
  })
})
