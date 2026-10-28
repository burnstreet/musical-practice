import { expect } from 'vitest'
import { WINDOW } from '../../src/core/pitch-constants'
import { detect } from '../../src/core/pitch-detect'
import { createPitchEngine, pickMic } from '../../src/core/pitch-engine'
import type { PitchFrame } from '../../src/core/types'
import { steps } from '../gherkin'

const RATE = 48000
const sine = (hz: number) => Float32Array.from({ length: WINDOW }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / RATE))
/** Fundamental plus decaying harmonics, like a sung vowel; detection must not jump an octave. */
const voice = (hz: number) =>
  Float32Array.from({ length: WINDOW }, (_, i) =>
    [1, 0.6, 0.4, 0.25, 0.15].reduce((a, g, k) => a + 0.3 * g * Math.sin((2 * Math.PI * hz * (k + 1) * i) / RATE + k), 0),
  )

// Fakes: a context with latencies, a worklet node whose port we poke, a stream with a stoppable track.
const fakes = (ctx: any, getUserMedia: (c?: any) => Promise<any>) => {
  ctx.port = {} as { onmessage?: (e: { data: unknown }) => void }
  ctx.track = {
    stop: () => {
      ctx.stopped = true
    },
  }
  const audio = {
    sampleRate: RATE,
    baseLatency: ctx.base,
    outputLatency: ctx.out,
    audioWorklet: { addModule: async () => {} },
    createMediaStreamSource: (s: unknown) => {
      ctx.source = s
      return { connect: () => {}, disconnect: () => {} }
    },
    close: async () => {},
  }
  ctx.frames = [] as PitchFrame[]
  ctx.engine = createPitchEngine({
    getUserMedia: getUserMedia as any,
    enumerateDevices: async () => ctx.inputs ?? [],
    createContext: () => audio as any,
    createWorkletNode: () => ({ port: ctx.port, connect: () => {}, disconnect: () => {} }) as any,
  })
  ctx.engine.on('frame', (f: PitchFrame) => ctx.frames.push(f))
}
const stream = (ctx: any) => async () => ({ getTracks: () => [ctx.track] })

export default steps(({ Given, When, Then }) => {
  Given(/^a (\d+) Hz sine fed as audio$/, (ctx, hz) => {
    ctx.samples = sine(+hz)
  })
  Given(/^voice-like tones at (.*) Hz fed as audio$/, (ctx, list) => {
    ctx.tones = list.split(', ').map(Number)
  })
  Then(/^each midi is within 0\.1 of its tone and clarity is above 0\.9$/, (ctx) => {
    ctx.tones.forEach((hz: number, i: number) => {
      expect(ctx.results[i].midi, `${hz} Hz`).toBeCloseTo(69 + 12 * Math.log2(hz / 440), 1)
      expect(ctx.results[i].clarity, `${hz} Hz`).toBeGreaterThan(0.9)
    })
  })
  Given(/^white noise fed as audio$/, (ctx) => {
    let seed = 1
    ctx.samples = Float32Array.from({ length: WINDOW }, () => {
      seed = (seed * 16807) % 2147483647 // fixed-seed generator: the test must not flake
      return (0.6 * seed) / 2147483647 - 0.3
    })
  })
  Given(/^silence fed as audio$/, (ctx) => {
    ctx.samples = new Float32Array(WINDOW)
  })
  When(/^frames arrive$/, (ctx) => {
    if (ctx.tones) ctx.results = ctx.tones.map((hz: number) => detect(voice(hz), RATE))
    else ctx.frame = detect(ctx.samples, RATE)
  })
  Then(/^midi is within 0\.1 of 69 and clarity is above 0\.9$/, (ctx) => {
    expect(ctx.frame.midi).toBeCloseTo(69, 1)
    expect(ctx.frame.clarity).toBeGreaterThan(0.9)
  })
  Then(/^midi is null$/, (ctx) => {
    expect(ctx.frame.midi).toBeNull()
  })

  Given(
    /^songTime returns ([\d.]+), (?:playback latency ([\d.]+), )?mic baseLatency ([\d.]+), mic outputLatency ([\d.]+) and delay (auto|\d+ ms)$/,
    async (ctx, t, play, base, out, delay) => {
      Object.assign(ctx, { base: +base, out: +out })
      fakes(ctx, stream(ctx))
      ctx.engine.setDelayMs(delay === 'auto' ? null : Number.parseInt(delay, 10))
      expect(await ctx.engine.start(() => +t, play ? () => +play : undefined)).toBe('ok')
    },
  )
  When(/^a frame arrives$/, (ctx) => ctx.port.onmessage({ data: { midi: 69, clarity: 1, rms: 0.2 } }))
  Then(/^its at is ([\d.]+) and its t is ([\d.]+)$/, (ctx, at, t) => {
    expect(ctx.frames).toHaveLength(1)
    expect(ctx.frames[0].at).toBeCloseTo(+at, 3)
    expect(ctx.frames[0].t).toBeCloseTo(+t, 3)
  })
  Then(/^clocks\(\) gives back song time ([\d.]+) and playback latency ([\d.]+)$/, (ctx, t, play) => {
    const [songTime, latency] = ctx.engine.clocks()
    expect(songTime()).toBeCloseTo(+t, 6)
    expect(latency()).toBeCloseTo(+play, 6)
  })
  Then(/^inputLatency\(\) is ([\d.]+)$/, (ctx, s) => expect(ctx.engine.inputLatency()).toBeCloseTo(+s, 6))

  const labels = (s: string) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1])
  const inputs = (ctx: any, list: string) => {
    ctx.inputs = labels(list).map((label, i) => ({ deviceId: `d${i}`, label, kind: 'audioinput', groupId: '' }))
  }
  const id = (ctx: any, label: string) => ctx.inputs.find((d: any) => d.label === label)?.deviceId
  /** A stream on device `deviceId` whose track records being stopped. */
  const streamOn = (ctx: any, deviceId: string) => ({
    deviceId,
    getTracks: () => [{ getSettings: () => ({ deviceId }), stop: () => ctx.stoppedIds.push(deviceId) }],
  })
  /** getUserMedia: exact requests must name a present device; otherwise the default (first) device. */
  const media = (ctx: any) => async (c: any) => {
    const exact = c.audio.deviceId?.exact
    if (exact && !ctx.inputs.some((d: any) => d.deviceId === exact)) throw new DOMException('gone', 'OverconstrainedError')
    return streamOn(ctx, exact ?? ctx.inputs[0].deviceId)
  }
  Given(/^audio inputs (".*)$/, (ctx, list) => inputs(ctx, list))
  Then(/^pickMic chooses "([^"]+)"$/, (ctx, label) => expect(pickMic(ctx.inputs)).toBe(id(ctx, label)))
  Then(/^pickMic chooses the default device$/, (ctx) => expect(pickMic(ctx.inputs)).toBeUndefined())
  Given(/^the default device is "[^"]+" and inputs (".*)$/, (ctx, list) => {
    inputs(ctx, list)
    ctx.stoppedIds = []
    fakes(ctx, media(ctx))
  })
  Given(/^the chosen device "[^"]+" is not available$/, (ctx) => {
    inputs(ctx, '"Eingebautes Mikrofon"')
    ctx.stoppedIds = []
    fakes(ctx, media(ctx))
  })
  When(/^I start with device (?:auto|"([^"]+)")$/, async (ctx, device) => {
    ctx.result = await ctx.engine.start(() => 0, undefined, device ?? '')
  })
  Then(/^the mic is "([^"]+)" and the AirPods track is stopped$/, (ctx, label) => {
    expect(ctx.source.deviceId).toBe(id(ctx, label))
    expect(ctx.stoppedIds).toEqual([id(ctx, 'AirPods Pro')])
  })
  Then(/^the result is "ok" on the default device$/, (ctx) => {
    expect(ctx.result).toBe('ok')
    expect(ctx.source.deviceId).toBe(ctx.inputs[0].deviceId)
  })

  Given(/^getUserMedia rejects with NotAllowedError$/, (ctx) => {
    fakes(ctx, () => Promise.reject(new DOMException('no', 'NotAllowedError')))
  })
  When(/^I start$/, async (ctx) => {
    ctx.result = await ctx.engine.start(() => 0)
  })
  Then(/^the result is "(.*)" and no frames arrive$/, (ctx, r) => {
    expect(ctx.result).toBe(r)
    expect(ctx.frames).toHaveLength(0)
  })
})
