import { expect } from 'vitest'
import { delayFor, detectOnsets, matchClicks, summarize } from '../../src/core/calibration'
import { steps } from '../gherkin'

const nums = (s: string) => [...s.matchAll(/-?[\d.]+/g)].map((m) => +m[0])

export default steps(({ Given, When, Then }) => {
  // "quiet frames at rms 0.002 until 1.000, loud frames at rms 0.1 until 1.100, quiet until 1.150": a frame every 5 ms from 0
  Given(/^(quiet frames at rms .*)$/, (ctx, list) => {
    const rms: Record<string, number> = {}
    ctx.frames = []
    let at = 0
    for (const [, kind, level, until] of list.matchAll(/(quiet|loud)(?: frames at rms ([\d.]+))? until ([\d.]+)/g)) {
      if (level) rms[kind] = +level
      for (; at < +until - 1e-9; at = Math.round((at + 0.005) * 1000) / 1000) ctx.frames.push({ at, rms: rms[kind] })
    }
  })
  When(/^I detect onsets$/, (ctx) => {
    ctx.onsets = detectOnsets(ctx.frames)
  })
  Then(/^the onsets are (.*)$/, (ctx, list) => {
    expect(ctx.onsets).toHaveLength(nums(list).length)
    nums(list).forEach((t, i) => {
      expect(ctx.onsets[i]).toBeCloseTo(t, 6)
    })
  })
  Then(/^there are no onsets$/, (ctx) => expect(ctx.onsets).toEqual([]))

  Given(/^clicks at (.*) and onsets at (.*)$/, (ctx, clicks, onsets) => {
    ctx.clicks = nums(clicks)
    ctx.onsets = nums(onsets)
  })
  When(/^I match them$/, (ctx) => {
    ctx.delays = matchClicks(ctx.onsets, ctx.clicks)
  })
  Then(/^the delays are (.*)$/, (ctx, list) => {
    expect(ctx.delays).toHaveLength(nums(list).length)
    nums(list).forEach((d, i) => {
      expect(ctx.delays[i]).toBeCloseTo(d, 6)
    })
  })

  Given(/^delays of (.*) ms$/, (ctx, list) => {
    ctx.result = summarize(nums(list).map((ms) => ms / 1000))
  })
  Then(/^the result is (\d+) ms with spread (\d+) ms$/, (ctx, ms, spread) => {
    expect(ctx.result).toEqual({ ms: +ms, spreadMs: +spread })
  })
  Then(/^the result is not clear$/, (ctx) => expect(ctx.result).toBeNull())

  Then(/^a measured (-?\d+) ms gives delay (\d+)$/, (_ctx, ms, delay) => {
    expect(delayFor(+ms)).toBe(+delay)
  })
})
