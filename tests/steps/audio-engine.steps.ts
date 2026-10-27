import { expect } from 'vitest'
import { createAudioEngine, type Mode } from '../../src/core/audio-engine'
import type { Note, Phrase, RoleId } from '../../src/core/content'
import type { LoadedSong } from '../../src/core/types'
import { steps } from '../gherkin'

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
  constructor(private clock: Clock) {
    super()
  }
  get currentTime() {
    return this.base + (this.paused ? 0 : (this.clock.t - this.at) * this.rate)
  }
  set currentTime(v: number) {
    this.sets++
    this.jump(v)
  }
  get playbackRate() {
    return this.rate
  }
  set playbackRate(r: number) {
    this.jump(this.currentTime)
    this.rate = r
  }
  /** Moves the playhead without counting as an engine write. */
  jump(v: number) {
    this.base = v
    this.at = this.clock.t
  }
  play() {
    this.jump(this.currentTime)
    this.paused = false
    return Promise.resolve()
  }
  pause() {
    this.jump(this.currentTime)
    this.paused = true
  }
}

// AudioParam that records automation and replays it to read the value at any time.
class FakeParam {
  events: { kind: 'set' | 'ramp'; v: number; t: number }[] = []
  constructor(
    private clock: Clock,
    private initial = 1,
  ) {}
  get value() {
    return this.at(this.clock.t)
  }
  setValueAtTime(v: number, t: number) {
    this.add('set', v, t)
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.add('ramp', v, t)
  }
  cancelScheduledValues(t: number) {
    this.events = this.events.filter((e) => e.t < t)
  }
  private add(kind: 'set' | 'ramp', v: number, t: number) {
    this.events.push({ kind, v, t })
    this.events.sort((a, b) => a.t - b.t)
  }
  at(T: number) {
    let pt = 0,
      pv = this.initial
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
    createElement: () => {
      const el = new FakeMedia(clock)
      elements.push(el)
      return el as any
    },
    createContext: () =>
      ({
        get currentTime() {
          return clock.t
        },
        baseLatency: ctx.base,
        outputLatency: ctx.out,
        destination: {},
        resume: async () => {},
        createGain: () => {
          const g = { gain: new FakeParam(clock), connect() {} }
          gains.push(g)
          return g
        },
        createMediaElementSource: (el: FakeMedia) => ({
          connect: (g: { el?: FakeMedia }) => {
            g.el = el
          },
        }),
      }) as any,
    requestFrame: (cb) => void frames.push(cb),
    createObjectURL: (b) => `blob:${(b as Blob).type}`,
    revokeObjectURL: () => {},
  })
  const song = { id: '08', bpm: 90, key: 'F', timeSig: [4, 4], bars: [0], notes, phrases }
  await engine.load({ meta: {} as any, song, voices: new Blob([], { type: 'voices' }), backing: new Blob([], { type: 'backing' }) } as LoadedSong, roles)
  const el = (type: string) => elements.find((e) => e.src === `blob:${type}`)!
  Object.assign(ctx, {
    clock,
    engine,
    enters: [] as Note[],
    loops: [] as Phrase[],
    ended: 0,
    voices: el('voices'),
    backing: el('backing'),
    voicesGain: () => gains.find((g) => g.el === ctx.voices)!.gain,
    backingGain: () => gains.find((g) => g.el === ctx.backing)!.gain,
    // one animation frame at clock time t
    tickAt: (t: number) => {
      clock.t = t
      const run = frames
      frames = []
      run.forEach((f) => {
        f()
      })
    },
  })
  engine.on('enter', (n) => ctx.enters.push(n))
  engine.on('loop', (p) => ctx.loops.push(p))
  engine.on('ended', () => ctx.ended++)
}

const mutingSong = (ctx: any, roles: RoleId[], mode: string, m = [1, 2], j = [3, 4]) =>
  setup(ctx, [note(m[0], m[1]), note(j[0], j[1], 'josef')], roles).then(() => ctx.engine.setMode(mode as Mode))
const run = (ctx: any, until: number) => {
  while (ctx.clock.t < until) ctx.tickAt(ctx.clock.t + 1 / 60)
}
const samples = () => Array.from({ length: 51 }, (_, i) => i / 10)

export default steps(({ Given, When, Then }) => {
  Given(/^a song with maria notes at \[([\d.]+),([\d.]+)\] and josef notes at \[([\d.]+),([\d.]+)\], roles \[(\w+)\], mode (\w+)$/, (ctx, a, b, c, d, r, m) =>
    mutingSong(ctx, [r as RoleId], m, [+a, +b], [+c, +d]),
  )
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

  Given(/^a loaded song$/, (ctx) => setup(ctx))
  Given(/^a loaded song on a context with baseLatency ([\d.]+) and outputLatency ([\d.]+)$/, (ctx, base, out) => {
    Object.assign(ctx, { base: +base, out: +out })
    return setup(ctx)
  })
  Then(/^latency\(\) is ([\d.]+)$/, (ctx, s) => expect(ctx.engine.latency()).toBeCloseTo(+s, 6))
  When(/^I set tempo (\d+) and play for 1 real second$/, async (ctx, t) => {
    ctx.engine.setTempo(+t)
    await ctx.engine.play()
    run(ctx, 1)
  })
  Then(/^both elements report playbackRate ([\d.]+) and preservesPitch true$/, (ctx, r) => {
    for (const el of [ctx.voices, ctx.backing]) expect(el).toMatchObject({ playbackRate: +r, preservesPitch: true })
  })
  Then(/^time\(\) is about ([\d.]+)$/, (ctx, t) => expect(ctx.engine.time()).toBeCloseTo(+t, 1))

  Given(/^(?:playing at 100 and )?the backing element reports ([\d.]+) s behind voices$/, async (ctx, d) => {
    await setup(ctx)
    await ctx.engine.play()
    run(ctx, 1)
    ctx.backing.jump(ctx.voices.currentTime - +d)
    ctx.sets = ctx.backing.sets
  })
  When(/^a tick runs$/, (ctx) => ctx.tickAt(ctx.clock.t + 1 / 60))
  Then(/^backing time is set equal to voices time$/, (ctx) => {
    expect(ctx.backing.sets).toBe(ctx.sets + 1)
    expect(ctx.backing.currentTime).toBeCloseTo(ctx.voices.currentTime, 6)
  })
  Then(/^backing time is untouched$/, (ctx) => {
    expect(ctx.backing.sets).toBe(ctx.sets)
    expect(ctx.voices.currentTime - ctx.backing.currentTime).toBeCloseTo(0.02, 6)
  })

  Given(/^phrase (\d+) spanning \[([\d.]+),([\d.]+)\] set as loop$/, async (ctx, i, s, e) => {
    const phrases = [phrase(0, 0, 5), phrase(1, 5, 10), phrase(+i, +s, +e)]
    await setup(ctx, [], ['maria'], phrases)
    ctx.engine.seek(+s)
    ctx.engine.setLoop(phrases[+i])
    await ctx.engine.play()
  })
  When(/^time\(\) passes ([\d.]+)$/, (ctx) => {
    while (!ctx.loops.length && ctx.clock.t < 100) ctx.tickAt(ctx.clock.t + 1 / 60)
  })
  Then(/^time\(\) is ([\d.]+), a loop event names phrase (\d+), and playback continues$/, (ctx, t, i) => {
    expect(ctx.engine.time()).toBeCloseTo(+t, 6)
    expect(ctx.loops.map((p: Phrase) => p.index)).toEqual([+i])
    expect(ctx.engine.playing()).toBe(true)
    ctx.tickAt(ctx.clock.t + 0.5)
    expect(ctx.engine.time()).toBeCloseTo(+t + 0.5, 6)
  })

  Given(/^notes starting at ([\d.]+) and ([\d.]+)$/, (ctx, a, b) => setup(ctx, [note(+a, +a + 0.1), note(+b, +b + 0.1)]))
  When(/^ticks occur at ([\d.]+) and ([\d.]+)$/, async (ctx, a, b) => {
    await ctx.engine.play()
    ctx.tickAt(+a)
    expect(ctx.enters).toEqual([])
    ctx.tickAt(+b)
  })
  Then(/^enter fires for both notes in order$/, (ctx) => {
    ctx.tickAt(ctx.clock.t + 1 / 60) // later ticks must not re-fire
    expect(ctx.enters.map((n: Note) => n.start)).toEqual([1.0, 1.2])
  })

  Given(/^a note \[([\d.]+),([\d.]+)\]$/, (ctx, s, e) => setup(ctx, [note(+s, +e)]))
  When(/^I seek to ([\d.]+)$/, (ctx, t) => ctx.engine.seek(+t))
  Then(/^enter fires once for that note$/, (ctx) => expect(ctx.enters.map((n: Note) => n.start)).toEqual([5.0]))

  Given(/^an engine without a song$/, (ctx) => {
    ctx.oscillators = []
    const destination = {}
    ctx.destination = destination
    ctx.engine = createAudioEngine({
      createElement: () => new FakeMedia({ t: 0 }) as any,
      createContext: () =>
        ({
          currentTime: 0,
          destination,
          resume: async () => {},
          createGain: () => ({
            gain: new FakeParam({ t: 0 }, 0),
            connect: (to: unknown) => {
              ctx.gainTo = to
            },
          }),
          createOscillator: () => {
            const o: any = {
              frequency: { value: 440 },
              connect: () => {},
              stops: [] as number[],
              start: (t: number) => {
                o.startAt = t
              },
              stop: (t: number) => {
                o.stops.push(t)
              },
            }
            ctx.oscillators.push(o)
            return o
          },
        }) as any,
      requestFrame: () => {},
      createObjectURL: () => '',
      revokeObjectURL: () => {},
    })
  })
  When(/^I schedule a click at context time ([\d.]+)$/, (ctx, at) => {
    ctx.stop = ctx.engine.click(+at)
  })
  Then(/^a (\d+) Hz tone starts at ([\d.]+) and stops at ([\d.]+) into the destination$/, (ctx, hz, start, end) => {
    const [o] = ctx.oscillators
    expect(o.frequency.value).toBe(+hz)
    expect(o.startAt).toBeCloseTo(+start, 6)
    expect(o.stops).toHaveLength(1)
    expect(o.stops[0]).toBeCloseTo(+end, 6)
    expect(ctx.gainTo).toBe(ctx.destination)
  })
  Then(/^calling its stop cancels it$/, (ctx) => {
    ctx.stop()
    expect(ctx.oscillators[0].stops.at(-1)).toBe(0) // stopped now, before it would start
  })

  Given(/^no loop set$/, async (ctx) => {
    await setup(ctx)
    await ctx.engine.play()
  })
  When(/^the voices element ends$/, (ctx) => ctx.voices.dispatchEvent(new Event('ended')))
  Then(/^ended fires and playing\(\) is false$/, (ctx) => {
    expect(ctx.ended).toBe(1)
    expect(ctx.engine.playing()).toBe(false)
  })
})
