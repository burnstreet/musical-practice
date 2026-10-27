import { LitElement, css, html, svg } from 'lit'
import type { Mode, Tempo } from '../../core/audio-engine'
import type { Note, Phrase } from '../../core/content'
import { foldCents } from '../../core/scorer'
import { Session } from '../../core/session'
import type { LoadedSong, PitchFrame } from '../../core/types'
import { getContext, type AppContext } from '../context'
import { draw as drawRoll } from '../draw/roll'
import { draw as drawStaff, type DrawState } from '../draw/staff'

const MODES: Record<Mode, [label: string, next: Mode]> = { all: ['alle Stimmen', 'others'], others: ['nur für andere', 'backing'], backing: ['nur Playback', 'all'] }
const NEXT_TEMPO: Record<Tempo, Tempo> = { 100: 90, 90: 80, 80: 70, 70: 100 }
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteName = (midi: number) => NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// Icons from the artboards
const icon = (body: ReturnType<typeof svg>, size = 22) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`
const BACK = icon(svg`<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`, 20)
const GEAR = icon(svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></g>`, 20)
const CHEVRON = icon(svg`<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`, 16)
const LOOP = icon(svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 014-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 01-4 4H4"/></g>`)
const TO_START = icon(svg`<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M19 5v14L9 12z"/><path d="M5 5v14" stroke-linecap="round"/></g>`)
const PAUSE = icon(svg`<g fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></g>`, 28)
const PLAY = icon(svg`<path d="M7 4.5v15l13-7.5z" fill="currentColor"/>`, 28)
const MIC = icon(svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></g>`)
const MIC_OFF = icon(svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3M4 4l16 16"/></g>`)

/** Ends the live session: unload, mic off, history. Back button and the shell (routes to songs/start) call it; no-op without one. */
export function leaveSession(ctx: AppContext): void {
  const live = ctx.live
  if (!live) return
  ctx.live = null
  live.session.endPass() // a pass still running counts
  ctx.engine.unload()
  ctx.pitch.stop()
  ctx.history.record(live.songId, ctx.settings.get().roles, live.session.passes()).catch(console.error)
}

/** The mounted screen. Engine and pitch engine have no `off`, so they are wired once and forward here. */
let current: GuPractice | null = null
const wired = new WeakSet<object>()

/** Live practice screen. The shell sets `songId`. */
export class GuPractice extends LitElement {
  static properties = {
    songId: {}, loaded: { state: true }, t: { state: true }, mode: { state: true }, playing: { state: true },
    mic: { state: true }, tempo: { state: true }, loop: { state: true },
  }
  static styles = css`
    :host { display: grid; gap: 12px; box-sizing: border-box; min-height: 100vh; padding: 28px 20px 24px; max-width: 560px; margin: 0 auto;
      grid-template-areas: 'head' 'note' 'mode' 'staff' 'roll' 'readout' 'transport'; grid-template-rows: auto auto auto auto auto auto 1fr; }
    @media (min-width: 960px) {
      :host { max-width: 1280px; padding: 24px 40px 32px; column-gap: 24px; row-gap: 16px; grid-template-columns: minmax(0, 1fr) 360px;
        grid-template-areas: 'head head' 'note note' 'staff mode' 'staff readout' 'roll transport' 'roll .'; grid-template-rows: auto auto auto auto auto 1fr; }
      h1 { font-size: 26px !important; }
      .card { border-radius: 24px !important; }
    }
    button { font: inherit; color: var(--text); border: 0; cursor: pointer; background: var(--surface); }
    button:disabled { cursor: default; opacity: 0.6; }
    .round { width: 52px; height: 52px; border-radius: 26px; display: flex; align-items: center; justify-content: center; flex: none; background: var(--surface); color: var(--text); }
    header { grid-area: head; display: flex; align-items: center; gap: 12px; }
    header .round { width: 44px; height: 44px; }
    header div { flex: 1; min-width: 0; text-align: center; }
    h1 { font-family: var(--font-display); font-size: 19px; font-weight: 600; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    header p { font-size: 12px; color: var(--muted); margin: 2px 0 0; }
    .note { grid-area: note; margin: 0; padding: 12px 16px; border-radius: 14px; background: var(--ink); color: var(--text); font-size: 14px; }
    .mode { grid-area: mode; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; font-size: 14px; }
    .mode span { color: var(--muted); }
    .mode b { display: flex; align-items: center; gap: 8px; }
    .card { background: var(--surface); border-radius: 20px; padding: 12px 10px 8px; }
    .staff { grid-area: staff; display: flex; flex-direction: column; gap: 6px; }
    .legend { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--muted); padding: 0 4px; }
    .legend span { display: flex; align-items: center; gap: 6px; }
    .legend i { width: 10px; height: 10px; border-radius: 5px; background: var(--accent); }
    .legend i.other { background: var(--other); }
    canvas { display: block; width: 100%; }
    .staff canvas { height: 112px; }
    .roll { grid-area: roll; }
    .roll canvas { height: 168px; }
    @media (min-width: 960px) { .staff canvas { height: 136px; } .roll canvas { height: 216px; } }
    .readout { grid-area: readout; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
    .readout .line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .readout big { font-family: var(--font-display); font-size: 28px; font-weight: 600; line-height: 1; margin-right: 8px; }
    .readout small { font-size: 13px; color: var(--muted); }
    .readout strong { font-size: 14px; }
    .meter { position: relative; height: 8px; border-radius: 4px; background: var(--line); }
    .meter .band { position: absolute; top: 0; bottom: 0; background: var(--accent); opacity: 0.5; border-radius: 4px; }
    .meter .tick { position: absolute; left: 50%; top: -3px; width: 2px; height: 14px; margin-left: -1px; background: var(--text); }
    .meter .dot { position: absolute; top: -5px; width: 18px; height: 18px; margin-left: -9px; border-radius: 9px; box-sizing: border-box; background: var(--text); border: 3px solid var(--surface); }
    .transport { grid-area: transport; align-self: end; display: flex; flex-direction: column; gap: 10px; }
    @media (min-width: 960px) { .transport { align-self: start; background: var(--surface); border-radius: 24px; padding: 20px 24px; } .transport .round { background: var(--bg); } }
    .progress { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--muted); }
    .progress input { flex: 1; margin: 0; height: 24px; accent-color: var(--text); }
    .buttons { display: flex; align-items: center; justify-content: space-between; }
    .buttons button.round { font-size: 13px; font-weight: 700; }
    .round[aria-pressed='true'] { background: var(--accent); color: var(--ink); }
    .main { width: 72px; height: 72px; border-radius: 36px; background: var(--accent) !important; color: var(--ink) !important; }
    .mic.on { color: var(--accent); }
    .mic:not(.on) { color: var(--muted); }
  `

  declare songId: string
  declare loaded: LoadedSong | null
  /** Song time of the playhead (engine ticks, seeks). */
  declare t: number
  declare mode: Mode
  declare playing: boolean
  /** pitch.start said ok; false = denied or unsupported, or no part. */
  declare mic: boolean
  declare tempo: Tempo
  declare loop: Phrase | null
  /** The role set has notes in this song; otherwise listen only. */
  hasPart = false
  session!: Session
  /** Pitch frames of the last 1.5 s, oldest first. */
  frames: PitchFrame[] = []
  /** Redraws the canvases when the layout changes size; happy-dom may not have it. */
  private resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.requestUpdate())

  constructor() {
    super()
    this.songId = ''
    this.loaded = null
    this.t = 0
    this.mode = 'all'
    this.playing = false
    this.mic = false
    this.tempo = 100
    this.loop = null
  }

  connectedCallback() {
    super.connectedCallback()
    current = this
    this.resize?.observe(this)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.resize?.disconnect()
    if (current === this) current = null
    if (this.mic) getContext().pitch.stop()
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('songId') && this.songId) this.enter().catch(console.error)
    if (!this.loaded) return
    const { settings, library } = getContext()
    const s = settings.get()
    const names = Object.fromEntries(library.roles().map((r) => [r.id, r.name]))
    const state: DrawState = { song: this.loaded.song, roles: s.roles, names, t: this.t, frames: this.frames, tolerance: s.tolerance }
    const ctx2d = (sel: string) => this.renderRoot.querySelector<HTMLCanvasElement>(sel)?.getContext('2d') ?? null
    drawStaff(ctx2d('.staff canvas'), state)
    drawRoll(ctx2d('.roll canvas'), state)
  }

  private async enter() {
    const ctx = getContext()
    const { library, engine, pitch, settings } = ctx
    const s = settings.get()
    // Back from results: same session, engine still loaded (results may have set loop/tempo/seek).
    const back = ctx.live?.songId === this.songId ? ctx.live : null
    const loaded = back?.song ?? (await library.getSong(this.songId))
    if (!back) await engine.load(loaded, s.roles)
    this.session = back?.session ?? new Session(loaded.song, s.roles, s.tolerance)
    this.hasPart = this.session.myNotes().length > 0
    this.setMode(this.hasPart ? s.mode : 'all', false)
    if (!wired.has(engine)) {
      wired.add(engine)
      engine.on('tick', (t) => current && (current.t = t))
      engine.on('enter', (n) => current?.mic && current.session.enter(current.loaded!.song.notes.indexOf(n)))
      engine.on('ended', () => current?.pause())
    }
    if (!wired.has(pitch)) {
      wired.add(pitch)
      pitch.on('frame', (f) => current?.onFrame(f))
    }
    if (this.hasPart) this.mic = (await pitch.start(() => engine.time())) === 'ok'
    ctx.live = { songId: this.songId, song: loaded, session: this.session }
    this.t = engine.time()
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
    if (!this.hasPart) route('#/songs')
    else if (this.mic && this.session.endPass()) route(`#/results/${this.songId}`)
  }

  private back() {
    const ctx = getContext()
    leaveSession(ctx)
    ctx.route('#/songs')
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

  private setTempo(t: Tempo) {
    getContext().engine.setTempo(t)
    this.tempo = t
  }

  private seek(sec: number) {
    getContext().engine.seek(sec)
    this.t = sec
  }

  /** Phrase the playhead is in, or the last one started before it. */
  private phrase(): Phrase {
    const ps = this.loaded!.song.phrases
    return [...ps].reverse().find((p) => p.start <= this.t) ?? ps[0]
  }

  private toggleLoop() {
    this.loop = this.loop ? null : this.phrase()
    getContext().engine.setLoop(this.loop)
  }

  /** Big note, target label, cents text and meter position. */
  private readout() {
    const target = [...this.session.myNotes()].reverse().find((n: Note) => n.start <= this.t && this.t <= n.end)
    const newest = this.frames.at(-1)
    const sung = [...this.frames].reverse().find((f) => f.midi !== null && f.t >= newest!.t - 0.15)
    const label = target ? `Ziel ${noteName(target.midi)}` : ''
    if (!target || !sung) return { big: '–', label, text: '', cents: null }
    const c = Math.round(foldCents(sung.midi!, target.midi))
    const tol = getContext().settings.get().tolerance
    const dir = c > 0 ? 'zu hoch' : 'zu tief'
    const word = Math.abs(c) <= 15 ? 'sauber' : Math.abs(c) <= tol ? `leicht ${dir}` : dir
    return { big: noteName(Math.round(target.midi + c / 100)), label, text: `${c > 0 ? '+' : ''}${c} Cent · ${word}`, cents: c }
  }

  render() {
    const l = this.loaded
    if (!l) return ''
    const { library, settings, openSettings } = getContext()
    const s = settings.get()
    const { bars, key, bpm } = l.song
    const bar = Math.max(0, bars.filter((b) => b <= this.t).length - 1)
    const a = bar - (bar % 4) + 1
    const r = this.readout()
    const mine = library.roles().filter((x) => s.roles.includes(x.id)).map((x) => x.name).join(', ')
    const dur = l.meta.durationSec
    return html`<header>
      <button class="round" aria-label="Zurück zur Auswahl" @click=${this.back}>${BACK}</button>
      <div>
        <h1>Lied ${l.meta.number} · ${l.meta.title}</h1>
        <p>Takt ${a}–${a + 3} · ${key} · ${Math.round((bpm * this.tempo) / 100)} BPM</p>
      </div>
      <button class="round" aria-label="Einstellungen" @click=${openSettings}>${GEAR}</button>
    </header>
    ${!this.hasPart
      ? html`<p class="note" role="status">Deine Rolle singt hier nicht. Nur Zuhören.</p>`
      : !this.mic ? html`<p class="note" role="alert">Mikrofon nicht erlaubt. Du hörst das Lied, aber ohne Bewertung.</p>` : ''}
    <button class="mode" ?disabled=${!this.hasPart} @click=${() => this.setMode(MODES[this.mode][1])}><span>Voicetrack</span><b>${MODES[this.mode][0]}${CHEVRON}</b></button>
    <section class="card staff">
      <div class="legend"><span><i></i>Meine Stimme · ${mine}</span><span><i class="other"></i>Andere</span></div>
      <canvas></canvas>
    </section>
    <section class="card roll"><canvas></canvas></section>
    <section class="card readout" aria-live="polite">
      <div class="line"><span><big>${r.big}</big><small>${r.label}</small></span><strong>${r.text}</strong></div>
      <div class="meter">
        <div class="band" style="left:${50 - s.tolerance / 2}%;width:${s.tolerance}%"></div>
        <div class="tick"></div>
        ${r.cents === null ? '' : html`<div class="dot" style="left:${50 + Math.max(-100, Math.min(100, r.cents)) / 2}%"></div>`}
      </div>
    </section>
    <div class="transport">
      <div class="progress">
        <span>${clock(this.t)}</span>
        <input type="range" aria-label="Position" min="0" max=${dur} step="0.1" .value=${String(this.t)} @input=${(e: Event) => this.seek(+(e.target as HTMLInputElement).value)} />
        <span>${clock(dur)}</span>
      </div>
      <div class="buttons">
        <button class="round" aria-label="Phrase wiederholen" aria-pressed=${!!this.loop} @click=${this.toggleLoop}>${LOOP}</button>
        <button class="round" aria-label="Zurück zum Anfang der Phrase" @click=${() => this.seek(this.phrase().start)}>${TO_START}</button>
        ${this.playing
          ? html`<button class="round main" aria-label="Pause und Auswertung" @click=${this.pause}>${PAUSE}</button>`
          : html`<button class="round main" aria-label="Abspielen" @click=${this.play}>${PLAY}</button>`}
        <button class="round" aria-label="Tempo ${this.tempo} Prozent" @click=${() => this.setTempo(NEXT_TEMPO[this.tempo])}>${this.tempo}%</button>
        ${this.hasPart ? html`<span class="round mic ${this.mic ? 'on' : ''}" role="img" aria-label=${this.mic ? 'Mikrofon aktiv' : 'Mikrofon aus'}>${this.mic ? MIC : MIC_OFF}</span>` : ''}
      </div>
    </div>`
  }
}

customElements.define('gu-practice', GuPractice)
