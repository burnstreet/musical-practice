import { CUE_DEFAULTS, type Cue, type CueAt, type CueEffect, type CueEvent, type CueOptions, cueStart, cueStep, repeatRange } from '../core/cue'
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
  /** Options the cue was entered with; its repeat is the stored one of the cue's scene. */
  readonly options: CueOptions
  send(ev: CueEvent): void
  /** Enter the turn holding `itemId` (default: current) again with current settings; paused stays paused. With `itemId` it stores the position. */
  restart(itemId?: string): void
  /** `Von` / `Bis`: that end of the scene's repeat at `itemId`, an opposite end on the wrong side cleared, a position outside the new range moved to its start; restarts the cue. */
  setRepeatEnd(end: 'from' | 'to', itemId: string): void
  /** Leaving the screen: store the position, stop audio, mic off. */
  dispose(): void
}

/** Opens a run-through of the selected roles at `at`, with the scene's stored repeat. `onChange` fires after every step and every tick of my turn (level). */
export async function openDialog(ctx: AppContext, at: CueAt, onChange: () => void, deps: DialogDeps = browserDeps): Promise<Dialog> {
  const { library, pitch, settings } = ctx
  const loaded = await library.getScript()
  const roles = settings.get().roles
  const options = (sceneId: string): CueOptions => {
    const { dialog, dialogRepeats } = settings.get()
    const r = dialogRepeats[sceneId]
    return { roles, ...CUE_DEFAULTS, showDirections: dialog.showDirections, repeat: r ? { ...r, sceneId } : null }
  }
  let cue: Cue
  let opts: CueOptions
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
    let effects = cue.effects
    if (cue.sceneId !== before.sceneId) {
      // new scene: re-enter with its repeat; of the step keep only stop and missed, the rest is entering
      const kept = effects.filter((e) => e.type === 'stop' || e.type === 'missed')
      effects = [...kept, ...enter(cue.position()).effects]
    }
    if (cue.state === 'waiting' && !mine(before)) missed = false
    run(effects)
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

  /** Replaces the cue with one entered at `to` with the options of its scene; the caller runs its effects. */
  const enter = (to: CueAt): Cue => {
    opts = options(to.sceneId)
    cue = cueStart(loaded.script, opts, to, deps.now())
    return cue
  }
  run(enter(at).effects)

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
    get options() {
      return opts
    },
    send,
    restart(itemId) {
      if (cue.state === 'done') return
      const here = cue.position()
      stopAudio()
      run(enter({ sceneId: here.sceneId, itemId: itemId ?? here.itemId, paused: cue.state === 'paused' }).effects)
      if (itemId) store()
      onChange()
    },
    setRepeatEnd(end, itemId) {
      const { sceneId } = cue
      const items = loaded.script.scenes.find((x) => x.id === sceneId)!.items
      const indexOf = (id?: string) => items.findIndex((x) => x.id === id)
      const repeats = settings.get().dialogRepeats
      const r = { ...repeats[sceneId] }
      r[end] = itemId
      if (r.from && r.to && indexOf(r.from) > indexOf(r.to)) delete r[end === 'from' ? 'to' : 'from']
      settings.set({ dialogRepeats: { ...repeats, [sceneId]: r } })
      const range = repeatRange(loaded.script, options(sceneId))
      const pos = indexOf(cue.position().itemId)
      dialog.restart(range && (pos < indexOf(range.from) || pos > indexOf(range.to)) ? range.from : undefined)
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
