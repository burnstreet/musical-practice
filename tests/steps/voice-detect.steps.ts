import { expect } from 'vitest'
import { createVoiceDetect, type VoiceEvent } from '../../src/core/voice-detect'
import { steps } from '../gherkin'

const STEP = 5

export default steps(({ Given, When, Then }) => {
  Given(/^silenceMs (\d+)(?: and frames every 5 ms)?$/, (ctx, ms) => {
    ctx.vd = createVoiceDetect({ silenceMs: +ms })
    ctx.events = [] as { e: VoiceEvent; ms: number }[]
    ctx.ms = 0
  })
  // "0.002 for 300 ms, 0.1 for 1000 ms, then 0.002 for 1500 ms" and "0.1 from the start for 200 ms, ..."
  When(/^rms is (.*)$/, (ctx, s) => {
    for (const [, rms, len] of s.matchAll(/([\d.]+)(?: from the start)? for (\d+) ms/g))
      for (let i = 0; i < +len / STEP; i++) {
        const e = ctx.vd.push({ at: ctx.ms / 1000, rms: +rms })
        if (e) ctx.events.push({ e, ms: ctx.ms })
        ctx.ms += STEP
      }
  })
  Then(/^speechStart comes at about (\d+) ms and speechEnd at about (\d+) ms$/, (ctx, a, b) => {
    expect(ctx.events.map((x: any) => x.e)).toEqual(['speechStart', 'speechEnd'])
    expect(Math.abs(ctx.events[0].ms - +a)).toBeLessThanOrEqual(20)
    expect(Math.abs(ctx.events[1].ms - +b)).toBeLessThanOrEqual(20)
  })
  Then(/^there is one speechStart and one speechEnd$/, (ctx) => {
    expect(ctx.events.map((x: any) => x.e)).toEqual(['speechStart', 'speechEnd'])
  })
  Then(/^no event comes$/, (ctx) => {
    expect(ctx.events).toEqual([])
  })
})
