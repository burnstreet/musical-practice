import { HOP, WINDOW } from './pitch-constants'
import workletUrl from './pitch-worklet.ts?worker&url'
import type { PitchFrame } from './types'

export type StartResult = 'ok' | 'denied' | 'unsupported'

export interface PitchEngine {
  /**
   * playbackLatency: seconds from song time to the singer's ear (AudioEngine.latency), read per frame.
   * deviceId: '' = auto (the built-in mic, see pickMic); a gone device falls back to the default.
   */
  start(songTime: () => number, playbackLatency?: () => number, deviceId?: string): Promise<StartResult>
  /** Switches the input device; restarts with the same clocks when running. */
  setDevice(deviceId: string): Promise<StartResult>
  /** Clocks of the last start, to restart with them after a calibration. */
  clocks(): [() => number, () => number]
  /** Audio inputs; labels only after mic permission. */
  devices(): Promise<{ deviceId: string; label: string }[]>
  stop(): void
  /** Total delay for scoring, ms (measured or set); null = playback latency + mic baseLatency as the browser reports them. */
  setDelayMs(ms: number | null): void
  /** Returns the unsubscribe function. */
  on(ev: 'frame', fn: (f: PitchFrame) => void): () => void
  level(): number
  /** Mic context baseLatency in seconds, 0 when unknown or stopped (shown in the settings). */
  inputLatency(): number
  /** Mic running (start returned ok, no stop since). */
  active(): boolean
}

/** Seams for tests; defaults use the browser. */
export interface PitchEngineDeps {
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>
  createContext?: () => AudioContext
  createWorkletNode?: (ctx: AudioContext) => AudioWorkletNode
  enumerateDevices?: () => Promise<MediaDeviceInfo[]>
}

const BUILT_IN = /built-in|eingebaut|iphone|ipad|speakerphone|phone microphone|internal/i
const HEADSET = /bluetooth|headset|airpods|buds|hands-free/i
/** The phone's own mic among audio inputs, by label; undefined = use the default device. */
export const pickMic = (devices: { deviceId: string; label: string }[]): string | undefined =>
  devices.find((d) => BUILT_IN.test(d.label) && !HEADSET.test(d.label))?.deviceId

const CONSTRAINTS = { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
const stopAll = (s: MediaStream) =>
  s.getTracks().forEach((t) => {
    t.stop()
  })

const defaultGetUserMedia = () => (navigator.mediaDevices?.getUserMedia ? (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c) : undefined)

export function createPitchEngine(deps: PitchEngineDeps = {}): PitchEngine {
  const listeners: ((f: PitchFrame) => void)[] = []
  let delayMs: number | null = null
  let rms = 0
  let cleanup = () => {}
  let running = false
  let input = 0
  let clocks: [() => number, () => number] = [() => 0, () => 0]
  const enumerate = () =>
    (deps.enumerateDevices ?? (() => navigator.mediaDevices?.enumerateDevices?.() ?? Promise.resolve([])))()
      .then((ds) => ds.filter((d) => d.kind === 'audioinput'))
      .catch(() => [])

  /** Chosen device, else auto: default first (permission, labels), then reopen on the built-in mic if it is another one. */
  async function open(getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>, deviceId: string): Promise<MediaStream> {
    const on = (id: string) => getUserMedia({ audio: { deviceId: { exact: id }, ...CONSTRAINTS } })
    if (deviceId) {
      try {
        return await on(deviceId)
      } catch (e) {
        if ((e as DOMException)?.name === 'NotAllowedError') throw e // denied stays denied; gone falls back
      }
    }
    const stream = await getUserMedia({ audio: CONSTRAINTS })
    if (deviceId) return stream
    const pick = pickMic(await enumerate())
    if (!pick || pick === stream.getTracks()[0]?.getSettings?.().deviceId) return stream
    try {
      const built = await on(pick)
      stopAll(stream)
      return built
    } catch {
      return stream
    }
  }

  async function start(songTime: () => number, playbackLatency = () => 0, deviceId = ''): Promise<StartResult> {
    clocks = [songTime, playbackLatency]
    const getUserMedia = deps.getUserMedia ?? defaultGetUserMedia()
    const makeCtx =
      deps.createContext ??
      (typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined' ? () => new AudioContext({ latencyHint: 'interactive' }) : undefined)
    if (!getUserMedia || !makeCtx) return 'unsupported'
    stop()
    let stream: MediaStream
    try {
      stream = await open(getUserMedia, deviceId)
    } catch {
      return 'denied'
    }
    const ctx = makeCtx()
    if (!ctx.audioWorklet) {
      stopAll(stream)
      return 'unsupported'
    }
    await ctx.audioWorklet.addModule(workletUrl)
    const node = (deps.createWorkletNode ?? ((c) => new AudioWorkletNode(c, 'pitch-detector', { processorOptions: { window: WINDOW, hop: HOP } })))(ctx)
    const source = ctx.createMediaStreamSource(stream)
    const detection = WINDOW / 2 / ctx.sampleRate // a frame measures the centre of its window
    node.port.onmessage = (e: MessageEvent<Omit<PitchFrame, 't' | 'at'>>) => {
      rms = e.data.rms
      const at = songTime() - detection
      // the singer reacted to what played out playbackLatency ago; the mic adds its input latency on top.
      // A measured delay replaces both: some browsers report far more than the real latency.
      const t = at - (delayMs === null ? playbackLatency() + (ctx.baseLatency ?? 0) : delayMs / 1000)
      listeners.forEach((fn) => {
        fn({ ...e.data, t, at })
      })
    }
    source.connect(node)
    cleanup = () => {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      stopAll(stream)
      void ctx.close()
    }
    input = ctx.baseLatency ?? 0
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
    setDevice: async (id) => (running ? start(...clocks, id) : 'ok'),
    clocks: () => clocks,
    devices: async () => (await enumerate()).map(({ deviceId, label }) => ({ deviceId, label })),
    setDelayMs: (ms) => {
      delayMs = ms
    },
    on: (_ev, fn) => {
      listeners.push(fn)
      return () => {
        const i = listeners.indexOf(fn)
        if (i >= 0) listeners.splice(i, 1)
      }
    },
    level: () => rms,
    inputLatency: () => (running ? input : 0),
    active: () => running,
  }
}
