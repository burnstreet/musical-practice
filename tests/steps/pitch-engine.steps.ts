import { expect } from 'vitest'
import { steps } from '../gherkin'
import { detect } from '../../src/core/pitch-detect'
import { createPitchEngine } from '../../src/core/pitch-engine'
import type { PitchFrame } from '../../src/core/types'
import { WINDOW } from '../../src/core/pitch-constants'

const RATE = 48000
const sine = (hz: number) => Float32Array.from({ length: WINDOW }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / RATE))

// Fakes: a context with latencies, a worklet node whose port we poke, a stream with a stoppable track.
const fakes = (ctx: any, getUserMedia: () => Promise<any>) => {
  ctx.port = {} as { onmessage?: (e: { data: unknown }) => void }
  ctx.track = { stop: () => { ctx.stopped = true } }
  const audio = {
    baseLatency: ctx.base, outputLatency: ctx.out, audioWorklet: { addModule: async () => {} },
    createMediaStreamSource: () => ({ connect: () => {}, disconnect: () => {} }),
    close: async () => {},
  }
  ctx.frames = [] as PitchFrame[]
  ctx.engine = createPitchEngine({
    getUserMedia: getUserMedia as any,
    createContext: () => audio as any,
    createWorkletNode: () => ({ port: ctx.port, connect: () => {}, disconnect: () => {} }) as any,
  })
  ctx.engine.on('frame', (f: PitchFrame) => ctx.frames.push(f))
}
const stream = (ctx: any) => async () => ({ getTracks: () => [ctx.track] })

export default steps(({ Given, When, Then }) => {
  Given(/^a (\d+) Hz sine fed as audio$/, (ctx, hz) => { ctx.samples = sine(+hz) })
  Given(/^silence fed as audio$/, (ctx) => { ctx.samples = new Float32Array(WINDOW) })
  When(/^frames arrive$/, (ctx) => { ctx.frame = detect(ctx.samples, RATE) })
  Then(/^midi is within 0\.1 of 69 and clarity is above 0\.9$/, (ctx) => {
    expect(ctx.frame.midi).toBeCloseTo(69, 1)
    expect(ctx.frame.clarity).toBeGreaterThan(0.9)
  })
  Then(/^midi is null$/, (ctx) => { expect(ctx.frame.midi).toBeNull() })

  Given(/^songTime returns ([\d.]+), baseLatency ([\d.]+), outputLatency ([\d.]+) and offset (-?\d+) ms$/, async (ctx, t, base, out, off) => {
    Object.assign(ctx, { base: +base, out: +out })
    fakes(ctx, stream(ctx))
    ctx.engine.setOffsetMs(+off)
    expect(await ctx.engine.start(() => +t)).toBe('ok')
  })
  When(/^a frame arrives$/, (ctx) => ctx.port.onmessage({ data: { midi: 69, clarity: 1, rms: 0.2 } }))
  Then(/^its t is ([\d.]+)$/, (ctx, t) => {
    expect(ctx.frames).toHaveLength(1)
    expect(ctx.frames[0].t).toBeCloseTo(+t, 6)
  })

  Given(/^getUserMedia rejects with NotAllowedError$/, (ctx) => {
    fakes(ctx, () => Promise.reject(new DOMException('no', 'NotAllowedError')))
  })
  When(/^I start$/, async (ctx) => { ctx.result = await ctx.engine.start(() => 0) })
  Then(/^the result is "(.*)" and no frames arrive$/, (ctx, r) => {
    expect(ctx.result).toBe(r)
    expect(ctx.frames).toHaveLength(0)
  })
})

