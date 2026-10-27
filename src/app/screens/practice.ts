import { LitElement, css, html } from 'lit'
import type { Mode } from '../../core/audio-engine'
import type { Note } from '../../core/content'
import { foldCents } from '../../core/scorer'
import { Session } from '../../core/session'
import type { LoadedSong, PitchFrame } from '../../core/types'
import { getContext } from '../context'

const MODES: Record<Mode, [label: string, next: Mode]> = { all: ['alle Stimmen', 'others'], others: ['nur für andere', 'backing'], backing: ['nur Playback', 'all'] }
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteName = (midi: number) => NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)

// Icons from the artboards
const PAUSE = html`<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>`
const PLAY = html`<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>`

/** The mounted screen. Engine and pitch engine have no `off`, so they are wired once and forward here. */
let current: GuPractice | null = null
const wired = new WeakSet<object>()

/** Live practice screen. Set `songId` before connecting. */
export class GuPractice extends LitElement {
  static properties = { songId: {}, loaded: { state: true }, t: { state: true }, mode: { state: true }, playing: { state: true } }
  static styles = css`
    :host { display: block; }
  `

  declare songId: string
  declare loaded: LoadedSong | null
  declare t: number
  declare mode: Mode
  declare playing: boolean
  session!: Session
  /** Pitch frames of the last 1.5 s, oldest first. */
  frames: PitchFrame[] = []

  constructor() {
    super()
    this.songId = ''
    this.loaded = null
    this.t = 0
    this.mode = 'all'
    this.playing = false
  }

  connectedCallback() {
    super.connectedCallback()
    current = this
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    if (current === this) current = null
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('songId') && this.songId) void this.enter()
  }

  private async enter() {
    const { library, engine, pitch, settings } = getContext()
    const s = settings.get()
    const loaded = await library.getSong(this.songId)
    await engine.load(loaded, s.roles)
    this.setMode(s.mode, false)
    this.session = new Session(loaded.song, s.roles, s.tolerance)
    if (!wired.has(engine)) {
      wired.add(engine)
      engine.on('tick', (t) => current && (current.t = t))
      engine.on('enter', (n) => current?.session.enter(current.loaded!.song.notes.indexOf(n)))
    }
    if (!wired.has(pitch)) {
      wired.add(pitch)
      pitch.on('frame', (f) => current?.onFrame(f))
    }
    await pitch.start(() => engine.time())
    getContext().live = { songId: this.songId, song: loaded, session: this.session }
    this.loaded = loaded
  }

  private async play() {
    const { engine, ensureHeadphoneSheet } = getContext()
    await ensureHeadphoneSheet()
    this.session.startPass()
    await engine.play()
    this.playing = true
  }

  private pause() {
    const { engine, route } = getContext()
    engine.pause()
    this.playing = false
    if (this.session.endPass()) route(`#/results/${this.songId}`)
  }

  private onFrame(f: PitchFrame) {
    this.session.frame(f)
    this.frames = [...this.frames.filter((g) => g.t >= f.t - 1.5), f]
    this.requestUpdate()
  }

  private setMode(m: Mode, save = true) {
    const { engine, settings } = getContext()
    engine.setMode(m)
    if (save) settings.set({ mode: m })
    this.mode = m
  }

  /** Big note, target label and cents text. */
  private readout() {
    const target = [...this.session.myNotes()].reverse().find((n: Note) => n.start <= this.t && this.t <= n.end)
    const newest = this.frames.at(-1)
    const sung = [...this.frames].reverse().find((f) => f.midi !== null && newest && f.t >= newest.t - 0.15)
    if (!target || !sung) return { big: '–', target: target ? `Ziel ${noteName(target.midi)}` : '', text: '', cents: null }
    const c = Math.round(foldCents(sung.midi!, target.midi))
    const tol = getContext().settings.get().tolerance
    const dir = c > 0 ? 'zu hoch' : 'zu tief'
    const word = Math.abs(c) <= 15 ? 'sauber' : Math.abs(c) <= tol ? `leicht ${dir}` : dir
    return { big: noteName(Math.round(target.midi + c / 100)), target: `Ziel ${noteName(target.midi)}`, text: `${c > 0 ? '+' : ''}${c} Cent · ${word}`, cents: c }
  }

  render() {
    const l = this.loaded
    if (!l) return ''
    const { bars, key, bpm } = l.song
    const bar = Math.max(0, bars.filter((b) => b <= this.t).length - 1)
    const a = bar - (bar % 4) + 1
    const r = this.readout()
    return html`<header>
      <h1>Lied ${l.meta.number} · ${l.meta.title}</h1>
      <p>Takt ${a}–${a + 3} · ${key} · ${bpm} BPM</p>
    </header>
    <button class="mode" @click=${() => this.setMode(MODES[this.mode][1])}><span>Voicetrack</span><b>${MODES[this.mode][0]}</b></button>
    <section class="readout" aria-live="polite">
      <div><b>${r.big}</b> <span>${r.target}</span></div>
      <span>${r.text}</span>
    </section>
    <div class="transport">
      ${this.playing
        ? html`<button class="main" aria-label="Pause und Auswertung" @click=${this.pause}>${PAUSE}</button>`
        : html`<button class="main" aria-label="Abspielen" @click=${this.play}>${PLAY}</button>`}
    </div>`
  }
}

customElements.define('gu-practice', GuPractice)
