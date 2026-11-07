import { CUE_DEFAULTS, type Cue, type CueEffect, type CueEvent, cueStart, cueStep } from '../core/cue'
import type { LoadedScript } from '../core/types'
import { createVoiceDetect, type VoiceDetect } from '../core/voice-detect'
import type { AppContext } from './context'
import { roleSetKey } from './settings'

/** One line playing; `ended` resolves when it ran out (never after `stop`). */
export interface LinePlay {
  ended: Promise<void>
  stop(): void
}

/** Seams of the controller; the browser ones by default, tests swap them. */
export interface DialogDeps {
  /** Clock of the cue engine and voice detect, ms. */
  now(): number
  /** Calls `fn` every `ms`; returns the cancel function. */
  every(ms: number, fn: () => void): () => void
  /** Plays a line at `rate`, pitch kept; rejects when the browser refuses (autoplay). */
  play(blob: Blob, rate: number): LinePlay
}

/** One audio element for all lines: once it played inside a tap, iOS lets it play later lines without one. */
let audioEl: HTMLAudioElement | null = null
const audio = () => {
  audioEl ??= new Audio()
  return audioEl
}
/** A tiny silent WAV, played inside the tap that opens a run-through. */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

/** Call in the click handler that starts a run-through (scene row, resume, `Weiter`), so later lines may play. */
export function unlockAudio(): void {
  if (typeof Audio === 'undefined') return
  const el = audio()
  if (el.src && el.src !== SILENCE) return
  el.src = SILENCE
  el.play().catch(() => {})
}

export const browserDeps: DialogDeps = {
  now: () => performance.now(),
  every: (ms, fn) => {
    const id = window.setInterval(fn, ms)
    return () => clearInterval(id)
  },
  play(blob, rate) {
    const el = audio()
    const url = URL.createObjectURL(blob)
    let done = () => {}
    let fail = (_e: unknown) => {}
    const ended = new Promise<void>((res, rej) => {
      done = res
      fail = rej
    })
    const cleanup = () => {
      el.onended = null
      el.onerror = null
      URL.revokeObjectURL(url)
    }
    el.onended = () => {
      cleanup()
      done()
    }
    el.onerror = () => {
      cleanup()
      fail(new Error('audio error'))
    }
    el.preservesPitch = true
    ;(el as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true
    el.src = url
    el.defaultPlaybackRate = rate // a new src resets playbackRate to this
    el.playbackRate = rate
    el.play().catch((e) => {
      cleanup()
      fail(e)
    })
    return {
      ended,
      stop: () => {
        cleanup()
        el.pause()
      },
    }
  },
}

/** A run-through: owns the cue, carries out its effects (audio, mic) and feeds voice detect. Screens render `cue` and call `send`. */
export interface Dialog {
  readonly loaded: LoadedScript
  readonly cue: Cue
  /** The hard timeout passed in my last turn; cleared when my next turn starts. */
  readonly missed: boolean
  /** The mic could not be opened: only taps move on. */
  readonly micFailed: boolean
  /** Mic level 0..1 while my turn is open. */
  level(): number
  send(ev: CueEvent): void
  /** Settings changed (directions, loop): enter the current turn again with them. */
  restart(): void
  /** Leaving the screen: store the position, stop audio, mic off. */
  dispose(): void
}

/** Opens a run-through of the selected roles at `at`. `onChange` fires after every step and every tick of my turn (level). */
export async function openDialog(
  ctx: AppContext,
  at: { sceneId: string; itemId?: string },
  onChange: () => void,
  deps: DialogDeps = browserDeps,
): Promise<Dialog> {
  const { library, pitch, settings } = ctx
  const loaded = await library.getScript()
  const roles = settings.get().roles
  const options = () => {
    const d = settings.get().dialog
    return { roles, ...CUE_DEFAULTS, showDirections: d.showDirections, repeat: null }
  }
  let cue: Cue
  let missed = false
  let micFailed = false
  let disposed = false
  /** Bumped by every stop and play: a pending line of an older play stays silent. */
  let playGen = 0
  let playing: LinePlay | null = null
  /** Bumped by every mic effect: a slow pitch.start that lost the race is stopped again. */
  let micGen = 0
  let micOn = false
  let detect: VoiceDetect | null = null

  const store = () => {
    if (cue.state === 'done') return
    const { sceneId, itemId } = cue.position()
    if (!itemId) return
    settings.set({ dialogPositions: { ...settings.get().dialogPositions, [roleSetKey(roles)]: { sceneId, itemId, at: Date.now() } } })
  }

  const stopAudio = () => {
    playGen++
    playing?.stop()
    playing = null
  }

  async function play(itemIds: string[]) {
    stopAudio()
    const gen = playGen
    try {
      for (const id of itemIds) {
        const blob = await loaded.audio(id)
        if (gen !== playGen) return
        playing = deps.play(blob, settings.get().dialog.rate)
        await playing.ended
        if (gen !== playGen) return
      }
    } catch (e) {
      // autoplay refused or a broken file: pause, so a tap on resume plays it again
      console.error(e)
      if (gen === playGen) send({ type: 'pause' })
      return
    }
    playing = null
    send({ type: 'audioEnded' })
  }

  async function mic(on: boolean) {
    const gen = ++micGen
    micOn = on
    if (!on) {
      detect = null
      if (pitch.active()) pitch.stop()
      return
    }
    detect = createVoiceDetect({ silenceMs: settings.get().dialog.silenceMs })
    if (pitch.active()) return
    const ok = (await pitch.start(() => deps.now() / 1000, undefined, settings.get().micDeviceId)) === 'ok'
    if (gen !== micGen || disposed) {
      if (ok && !micOn) pitch.stop()
      return
    }
    micFailed = !ok
    onChange()
  }

  const run = (effects: CueEffect[]) => {
    for (const e of effects) {
      if (e.type === 'stop') stopAudio()
      else if (e.type === 'play') void play(e.itemIds)
      else if (e.type === 'mic') void mic(e.on)
      else if (e.type === 'missed') missed = true
    }
  }

  const mine = (c: Cue) => c.state === 'waiting' || c.state === 'speaking' || c.state === 'prompting'

  function send(ev: CueEvent) {
    if (disposed) return
    const before = cue
    cue = cueStep(cue, ev, deps.now())
    if (cue.state === 'waiting' && !mine(before)) missed = false
    run(cue.effects)
    const moved = cue.state !== before.state || cue.position().itemId !== before.position().itemId
    if (moved && (cue.state === 'paused' || cue.turn !== before.turn)) store()
    if (moved || (ev.type === 'tick' && mine(cue))) onChange()
  }

  const offFrames = pitch.on('frame', (f) => {
    if (!micOn || !detect) return
    const ev = detect.push({ at: f.at, rms: f.rms })
    if (ev) dialog.send({ type: ev })
  })
  const offTick = deps.every(100, () => dialog.send({ type: 'tick' }))

  const enter = (to: { sceneId: string; itemId?: string }) => {
    cue = cueStart(loaded.script, options(), to, deps.now())
    run(cue.effects)
  }
  enter(at)

  const dialog: Dialog = {
    loaded,
    get cue() {
      return cue
    },
    get missed() {
      return missed
    },
    get micFailed() {
      return micFailed
    },
    level: () => (micOn ? pitch.level() : 0),
    send,
    restart() {
      if (cue.state === 'done') return
      const paused = cue.state === 'paused'
      stopAudio()
      enter(cue.position())
      if (paused) send({ type: 'pause' })
      onChange()
    },
    dispose() {
      if (disposed) return
      store()
      disposed = true
      offTick()
      offFrames()
      stopAudio()
      micGen++
      micOn = false
      if (pitch.active()) pitch.stop()
    },
  }
  return dialog
}
