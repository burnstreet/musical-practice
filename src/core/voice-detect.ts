export interface LevelFrame {
  at: number
  rms: number
}
export type VoiceEvent = 'speechStart' | 'speechEnd'
export interface VoiceDetect {
  reset(): void
  push(f: LevelFrame): VoiceEvent | null
}

const FLOOR_S = 0.25
const START_S = 0.12

export function createVoiceDetect(opts: { silenceMs: number }): VoiceDetect {
  let t0: number | null
  let floor: number[]
  let on: number | null
  let speaking: boolean
  let since: number | null // start of the current run: above `on` before speech, below `off` in speech
  const reset = () => {
    t0 = null
    floor = []
    on = null
    speaking = false
    since = null
  }
  reset()
  return {
    reset,
    push({ at, rms }) {
      t0 ??= at
      if (on === null) {
        if (at - t0 < FLOOR_S) {
          floor.push(rms)
          return null
        }
        const sorted = [...floor].sort((a, b) => a - b)
        on = Math.max(3 * Math.min(sorted[sorted.length >> 1] ?? 0, 0.02), 0.008)
      }
      const inRun = speaking ? rms < 0.6 * on : rms >= on
      if (!inRun) {
        since = null
        return null
      }
      since ??= at
      if (at - since < (speaking ? opts.silenceMs / 1000 : START_S)) return null
      speaking = !speaking
      since = null
      return speaking ? 'speechStart' : 'speechEnd'
    },
  }
}
