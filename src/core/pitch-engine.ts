import { HOP, WINDOW } from './pitch-constants'
import workletUrl from './pitch-worklet.ts?worker&url'
import type { PitchFrame } from './types'

export type StartResult = 'ok' | 'denied' | 'unsupported'

export interface PitchEngine {
  start(songTime: () => number): Promise<StartResult>
  stop(): void
  setOffsetMs(ms: number): void
  /** Returns the unsubscribe function. */
  on(ev: 'frame', fn: (f: PitchFrame) => void): () => void
  level(): number
  /** Mic running (start returned ok, no stop since). */
  active(): boolean
}

/** Seams for tests; defaults use the browser. */
export interface PitchEngineDeps {
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>
  createContext?: () => AudioContext
  createWorkletNode?: (ctx: AudioContext) => AudioWorkletNode
}

const defaultGetUserMedia = () => (navigator.mediaDevices?.getUserMedia ? (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c) : undefined)

export function createPitchEngine(deps: PitchEngineDeps = {}): PitchEngine {
  const listeners: ((f: PitchFrame) => void)[] = []
  let offsetMs = 0
  let rms = 0
  let cleanup = () => {}
  let running = false

  async function start(songTime: () => number): Promise<StartResult> {
    const getUserMedia = deps.getUserMedia ?? defaultGetUserMedia()
    const makeCtx =
      deps.createContext ?? (typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined' ? () => new AudioContext() : undefined)
    if (!getUserMedia || !makeCtx) return 'unsupported'
    stop()
    let stream: MediaStream
    try {
      stream = await getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    } catch {
      return 'denied'
    }
    const ctx = makeCtx()
    if (!ctx.audioWorklet) {
      stream.getTracks().forEach((t) => t.stop())
      return 'unsupported'
    }
    await ctx.audioWorklet.addModule(workletUrl)
    const node = (deps.createWorkletNode ?? ((c) => new AudioWorkletNode(c, 'pitch-detector', { processorOptions: { window: WINDOW, hop: HOP } })))(ctx)
    const source = ctx.createMediaStreamSource(stream)
    node.port.onmessage = (e: MessageEvent<Omit<PitchFrame, 't'>>) => {
      rms = e.data.rms
      const t = songTime() - ((ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0) + offsetMs / 1000)
      listeners.forEach((fn) => fn({ ...e.data, t }))
    }
    source.connect(node)
    cleanup = () => {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    }
    running = true
    return 'ok'
  }

  function stop() {
    cleanup()
    cleanup = () => {}
    running = false
  }

  return {
    start,
    stop,
    setOffsetMs: (ms) => {
      offsetMs = ms
    },
    on: (_ev, fn) => {
      listeners.push(fn)
      return () => {
        const i = listeners.indexOf(fn)
        if (i >= 0) listeners.splice(i, 1)
      }
    },
    level: () => rms,
    active: () => running,
  }
}
