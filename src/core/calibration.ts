import type { AudioEngine } from './audio-engine'
import type { PitchEngine } from './pitch-engine'

/** What onset detection needs of a pitch frame: live stamp and level. */
export interface Level {
  at: number
  rms: number
}
export interface Calibration {
  /** Median delay from click to onset, ms. */
  ms: number
  /** Median absolute deviation, ms. */
  spreadMs: number
}

const FACTOR = 4
const MIN_RMS = 0.01
const QUIET = 0.08
const MATCH = 0.3
const MIN_CLICKS = 5
const MAX_SPREAD = 0.025
const COUNT_IN = 1
const EVERY = 0.6
const CLICKS = 8
const TAIL = 0.5

/** Onset = a frame louder than max(4 × quiet floor, 0.01) after at least 80 ms below that; the floor averages quiet frames. */
export function detectOnsets(frames: Level[]): number[] {
  const onsets: number[] = []
  let floor: number | null = null
  let quietSince: number | null = null
  for (const { at, rms } of frames) {
    if (rms <= Math.max(FACTOR * (floor ?? 0), MIN_RMS)) {
      floor = floor === null ? rms : 0.9 * floor + 0.1 * rms
      quietSince ??= at
      continue
    }
    if (quietSince !== null && at - quietSince >= QUIET - 1e-9) onsets.push(at)
    quietSince = null
  }
  return onsets
}

/** Delay (onset − click) of each click that has an onset within ±300 ms, the nearest one. */
export const matchClicks = (onsets: number[], clicks: number[]): number[] =>
  clicks.flatMap((c) => {
    const near = onsets.reduce<number | null>((a, o) => (a === null || Math.abs(o - c) < Math.abs(a - c) ? o : a), null)
    return near !== null && Math.abs(near - c) <= MATCH ? [near - c] : []
  })

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Median and median absolute deviation of the delays (s); null with fewer than 5 or a spread over 25 ms. */
export function summarize(delays: number[]): Calibration | null {
  if (delays.length < MIN_CLICKS) return null
  const mid = median(delays)
  const spread = median(delays.map((d) => Math.abs(d - mid)))
  return spread > MAX_SPREAD + 1e-9 ? null : { ms: Math.round(mid * 1000), spreadMs: Math.round(spread * 1000) }
}

/** The user offset that remains after the pitch engine subtracted playback and mic latency: steps of 10, −300…300. */
export const offsetFor = (measuredMs: number, playbackS: number, micS: number): number =>
  Math.max(-300, Math.min(300, Math.round((measuredMs - playbackS * 1000 - micS * 1000) / 10) * 10))

export interface CalibrationRun {
  /** Result, null when unclear or cancelled, 'no-mic' when the mic did not start. */
  done: Promise<Calibration | null | 'no-mic'>
  cancel(): void
}

/**
 * Starts the mic on the playback context's clock, plays 8 clicks after a 1 s count-in and measures click → onset.
 * The caller stops or restores the mic afterwards.
 */
export function runCalibration(
  engine: Pick<AudioEngine, 'click' | 'ctxTime'>,
  pitch: Pick<PitchEngine, 'start' | 'on'>,
  deviceId: string,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
): CalibrationRun {
  let cancelled = false
  let off = () => {}
  const stops: (() => void)[] = []
  const done = (async () => {
    if (
      (await pitch.start(
        () => engine.ctxTime(),
        () => 0,
        deviceId,
      )) !== 'ok'
    )
      return 'no-mic' as const
    if (cancelled) return null
    const frames: Level[] = []
    off = pitch.on('frame', (f) => {
      frames.push({ at: f.at, rms: f.rms })
    })
    const first = engine.ctxTime() + COUNT_IN
    const clicks = Array.from({ length: CLICKS }, (_, i) => first + i * EVERY)
    for (const c of clicks) stops.push(engine.click(c))
    await sleep((COUNT_IN + (CLICKS - 1) * EVERY + TAIL) * 1000)
    off()
    return cancelled ? null : summarize(matchClicks(detectOnsets(frames), clicks))
  })()
  return {
    done,
    cancel() {
      cancelled = true
      off()
      for (const stop of stops) stop()
    },
  }
}
