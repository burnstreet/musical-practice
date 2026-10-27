import { expect, it } from 'vitest'
import { runCalibration } from '../src/core/calibration'
import type { PitchFrame } from '../src/core/types'

/** Fake playback clock at 0, a mic that hears every click `delay` s late; sleep plays the whole run at once. */
function world(delay: number) {
  const clicks: number[] = []
  const stopped: number[] = []
  let listener: (f: PitchFrame) => void = () => {}
  const engine = {
    ctxTime: () => 0,
    click: (at: number) => {
      clicks.push(at)
      return () => stopped.push(at)
    },
  }
  const pitch = {
    start: async (songTime: () => number) => (songTime() === 0 ? ('ok' as const) : ('denied' as const)),
    on: (_: 'frame', fn: (f: PitchFrame) => void) => {
      listener = fn
      return () => {
        listener = () => {}
      }
    },
  }
  const sleep = async () => {
    for (let at = 0; at < 6.5; at = Math.round((at + 0.005) * 1000) / 1000) {
      const loud = clicks.some((c) => at >= c + delay && at < c + delay + 0.03)
      listener({ at, t: at, midi: null, clarity: 0, rms: loud ? 0.2 : 0.001 })
    }
  }
  return { engine, pitch, sleep, clicks, stopped }
}

it('plays 8 clicks after the count-in and measures the delay on their clock', async () => {
  const w = world(0.15)
  const result = await runCalibration(w.engine, w.pitch, '', w.sleep).done
  expect(w.clicks.map((c) => +c.toFixed(3))).toEqual([1, 1.6, 2.2, 2.8, 3.4, 4, 4.6, 5.2])
  expect(result).toEqual({ ms: 150, spreadMs: 0 })
})

it('cancel stops the clicks and gives no result', async () => {
  const w = world(0.15)
  let release = () => {}
  const run = runCalibration(w.engine, w.pitch, '', () => new Promise<void>((r) => (release = r)))
  await new Promise((r) => setTimeout(r, 0))
  run.cancel()
  release()
  expect(await run.done).toBeNull()
  expect(w.stopped).toHaveLength(8)
})
