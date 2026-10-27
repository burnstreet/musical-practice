import { type Note, type Phrase, type RoleId, roleSpans, type Span } from './content'
import type { LoadedSong } from './types'

export type Mode = 'all' | 'others' | 'backing'
export type Tempo = 100 | 90 | 80 | 70

export interface AudioEngine {
  load(song: LoadedSong, roles: RoleId[]): Promise<void>
  unload(): void
  play(): Promise<void>
  pause(): void
  seek(sec: number): void
  setMode(m: Mode): void
  setTempo(t: Tempo): void
  setLoop(phrase: Phrase | null): void
  tempo(): Tempo
  loop(): Phrase | null
  time(): number
  playing(): boolean
  /** Playback context clock in seconds; creates the context when no song was loaded yet. */
  ctxTime(): number
  /** Calibration click (1 kHz, 20 ms) at context time `at` on the real output path; returns a stop for it. */
  click(at: number): () => void
  /** Seconds from song time to the speaker (context base + output latency), 0 when unknown. */
  latency(): number
  on(ev: 'tick', fn: (t: number) => void): void
  on(ev: 'loop', fn: (phrase: Phrase) => void): void
  on(ev: 'ended', fn: () => void): void
  on(ev: 'enter', fn: (note: Note) => void): void
}

export interface AudioEngineDeps {
  createElement(): HTMLMediaElement
  createContext(): AudioContext
  requestFrame(cb: () => void): void
  createObjectURL(b: Blob): string
  revokeObjectURL(url: string): void
}

const browser: AudioEngineDeps = {
  createElement: () => new Audio(),
  createContext: () => new AudioContext({ latencyHint: 'interactive' }),
  requestFrame: (cb) => void requestAnimationFrame(() => cb()),
  createObjectURL: (b) => URL.createObjectURL(b),
  revokeObjectURL: (u) => URL.revokeObjectURL(u),
}

const RAMP = 0.03
const LEAD = 0.15 // fade out starts this long before a span
const DRIFT = 0.025
const CLICK = 0.02

export function createAudioEngine(deps: AudioEngineDeps = browser): AudioEngine {
  let ac: AudioContext | undefined
  let voices: HTMLMediaElement, backing: HTMLMediaElement
  let voicesGain: GainNode
  let urls: string[] = []
  let notes: Note[] = []
  let spans: Span[] = []
  let mode: Mode = 'all'
  let loop: Phrase | null = null
  let isPlaying = false
  let prev = -1 // song time of the last tick; enter fires for notes starting in (prev, now]
  const listeners: Record<string, ((x?: any) => void)[]> = {}
  const emit = (ev: string, x?: unknown) =>
    listeners[ev]?.forEach((fn) => {
      fn(x)
    })

  const muted = (t: number) => mode === 'backing' || (mode === 'others' && spans.some((s) => s.start - LEAD <= t && t < s.end))

  // Gain automation for the rest of the song from now, in context seconds (song seconds / rate).
  function schedule(ramp = false) {
    const g = voicesGain.gain
    const now = ac!.currentTime
    const t0 = voices.currentTime
    const at = (s: number) => now + (s - t0) / voices.playbackRate
    g.cancelScheduledValues(now)
    if (ramp) {
      g.setValueAtTime(g.value, now)
      g.linearRampToValueAtTime(muted(t0) ? 0 : 1, now + RAMP)
    } else g.setValueAtTime(muted(t0) ? 0 : 1, now)
    if (mode !== 'others') return
    for (const s of spans) {
      if (s.start - LEAD > t0) {
        g.setValueAtTime(1, at(s.start - LEAD))
        g.linearRampToValueAtTime(0, at(s.start - LEAD) + RAMP)
      }
      if (s.end > t0) {
        g.setValueAtTime(0, at(s.end))
        g.linearRampToValueAtTime(1, at(s.end) + RAMP)
      }
    }
  }

  function frame() {
    if (!isPlaying) return
    let t = voices.currentTime
    if (loop && t >= loop.end) {
      engine.seek(loop.start)
      emit('loop', loop)
      t = loop.start
    } else {
      for (const n of notes) if (n.start > prev && n.start <= t) emit('enter', n)
      prev = t
    }
    if (Math.abs(backing.currentTime - t) > DRIFT) backing.currentTime = t
    emit('tick', t)
    deps.requestFrame(frame)
  }

  const engine: AudioEngine = {
    async load(song, roles) {
      engine.unload()
      ac ??= deps.createContext()
      const wire = (blob: Blob) => {
        const el = deps.createElement()
        const url = deps.createObjectURL(blob)
        urls.push(url)
        el.src = url
        el.preservesPitch = true
        const gain = ac!.createGain()
        ac!.createMediaElementSource(el).connect(gain)
        gain.connect(ac!.destination)
        return [el, gain] as const
      }
      ;[voices, voicesGain] = wire(song.voices)
      ;[backing] = wire(song.backing)
      voices.addEventListener('ended', () => {
        if (loop) {
          engine.seek(loop.start)
          void voices.play()
          void backing.play()
          emit('loop', loop)
        } else {
          engine.pause()
          emit('ended')
        }
      })
      notes = song.song.notes
      spans = roleSpans(notes, roles)
      prev = -1
      loop = null // new song: a loop of the previous one would not fit
    },
    unload() {
      if (voices) engine.pause()
      urls.forEach((u) => {
        deps.revokeObjectURL(u)
      })
      urls = []
    },
    async play() {
      await ac!.resume()
      backing.currentTime = voices.currentTime
      await Promise.all([voices.play(), backing.play()])
      isPlaying = true
      schedule()
      deps.requestFrame(frame)
    },
    pause() {
      isPlaying = false
      voices.pause()
      backing.pause()
      voicesGain.gain.cancelScheduledValues(ac!.currentTime)
    },
    seek(sec) {
      voices.currentTime = backing.currentTime = sec
      prev = sec
      for (const n of notes) if (n.start <= sec && sec < n.end) emit('enter', n)
      if (isPlaying) schedule()
    },
    setMode(m) {
      mode = m
      if (isPlaying) schedule(true)
    },
    setTempo(t) {
      voices.playbackRate = backing.playbackRate = t / 100
      if (isPlaying) schedule()
    },
    setLoop(p) {
      loop = p
    },
    tempo: () => (voices ? Math.round(voices.playbackRate * 100) : 100) as Tempo,
    loop: () => loop,
    time: () => voices.currentTime,
    playing: () => isPlaying,
    latency: () => (ac?.baseLatency ?? 0) + (ac?.outputLatency ?? 0),
    ctxTime() {
      ac ??= deps.createContext()
      return ac.currentTime
    },
    click(at) {
      ac ??= deps.createContext()
      void ac.resume()
      const osc = ac.createOscillator()
      const env = ac.createGain()
      osc.frequency.value = 1000
      env.gain.setValueAtTime(0, at)
      env.gain.linearRampToValueAtTime(0.8, at + 0.002)
      env.gain.setValueAtTime(0.8, at + CLICK - 0.002)
      env.gain.linearRampToValueAtTime(0, at + CLICK)
      osc.connect(env)
      env.connect(ac.destination)
      osc.start(at)
      osc.stop(at + CLICK)
      return () => osc.stop(ac!.currentTime)
    },
    on(ev: string, fn: (x?: any) => void) {
      if (!listeners[ev]) listeners[ev] = []
      listeners[ev].push(fn)
    },
  }
  return engine
}
