import { PitchDetector } from 'pitchy'
import { CLARITY_THRESHOLD, FMAX, FMIN } from './pitch-constants'

let detector: PitchDetector<Float32Array> | undefined

/** One window of mono samples -> pitch. midi is null when unvoiced or outside fmin..fmax. */
export function detect(samples: Float32Array, sampleRate: number): { midi: number | null; clarity: number; rms: number } {
  if (detector?.inputLength !== samples.length) detector = PitchDetector.forFloat32Array(samples.length)
  const rms = Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length)
  const [hz, clarity] = detector.findPitch(samples, sampleRate)
  const voiced = clarity >= CLARITY_THRESHOLD && hz >= FMIN && hz <= FMAX
  return { midi: voiced ? 69 + 12 * Math.log2(hz / 440) : null, clarity, rms }
}
