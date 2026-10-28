import { css, html, LitElement, svg } from 'lit'
import { leadInStart, type Mode, type Range, type Tempo } from '../../core/audio-engine'
import type { Phrase, RoleId, Section, Song } from '../../core/content'
import { liveDeviation, noteName } from '../../core/scorer'
import { Session } from '../../core/session'
import type { LoadedSong, PitchFrame } from '../../core/types'
import { type AppContext, getContext } from '../context'
import { draw as drawRoll } from '../draw/roll'
import { barsPerPage, type DrawState, draw as drawStaff, type Marks, pageOf } from '../draw/staff'
import { features } from '../features'
import { abRange, einsatzRange, phraseRange, sectionAt, snapToBar } from '../repeat'

const MODES: Record<Mode, [label: string, next: Mode]> = {
  all: ['alle Stimmen', 'others'],
  others: ['nur für andere', 'backing'],
  backing: ['nur Playback', 'all'],
}
const NEXT_TEMPO: Record<Tempo, Tempo> = { 100: 90, 90: 80, 80: 70, 70: 100 }
type Kind = 'off' | 'phrase' | 'section' | 'einsatz' | 'ab'
const CHIPS: [Kind, string][] = [
  ['off', 'Aus'],
  ['phrase', 'Phrase'],
  ['section', 'Abschnitt'],
  ['einsatz', 'Einsatz'],
  ['ab', 'A–B'],
]
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// Icons from the artboards
const icon = (body: ReturnType<typeof svg>, size = 22) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`
const BACK = icon(svg`<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`, 20)
const GEAR = icon(
  svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></g>`,
  20,
)
const CHEVRON = icon(svg`<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`, 16)
const TO_START = icon(
  svg`<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M19 5v14L9 12z"/><path d="M5 5v14" stroke-linecap="round"/></g>`,
)
const PAUSE = icon(svg`<g fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></g>`, 28)
const PLAY = icon(svg`<path d="M7 4.5v15l13-7.5z" fill="currentColor"/>`, 28)
const MIC = icon(
  svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></g>`,
  18,
)
const MIC_OFF = icon(
  svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3M4 4l16 16"/></g>`,
  18,
)

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

/**
 * Until my next entry, while none of my notes sounds at heard time `t`: `Einsatz in {n} Takten · {s} s` (bar lines
 * before it; seconds at the tempo, rounded up), `Einsatz in {s} s` within the bar, '' under 1 s or when nothing comes.
 */
export function entryCountdown(song: Song, roles: RoleId[], t: number, tempo: number): string {
  const mine = song.notes.filter((n) => roles.includes(n.role))
  if (mine.some((n) => n.start <= t && t < n.end)) return ''
  const next = mine.find((n) => n.start > t)
  if (!next || next.start - t < 1) return ''
  const bars = song.bars.filter((b) => b > t && b <= next.start).length
  const secs = Math.ceil(((next.start - t) * 100) / tempo)
  return `Einsatz in ${bars ? `${bars} ${bars === 1 ? 'Takt' : 'Takten'} · ` : ''}${secs} s`
}

/** The mounted screen. The engine has no `off`, so engine and pitch engine are wired once and forward here. */
let current: GuPractice | null = null
const wired = new WeakSet<object>()

/** Live practice screen. The shell sets `songId`. */
export class GuPractice extends LitElement {
  static properties = {
    songId: {},
    loaded: { state: true },
    t: { state: true },
    mode: { state: true },
    playing: { state: true },
    mic: { state: true },
    tempo: { state: true },
    loop: { state: true },
    kind: { state: true },
    a: { state: true },
  }
  static styles = css`
    :host { display: grid; gap: 12px; box-sizing: border-box; min-height: 100vh; padding: 28px 20px 24px; max-width: 560px; margin: 0 auto;
      grid-template-areas: 'head' 'note' 'mode' 'staff' 'roll' 'readout' 'transport'; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto auto auto auto 1fr; }
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
    .roll canvas { height: 188px; } /* rows plus the lyric strip at the bottom */
    @media (min-width: 960px) { .staff canvas { height: 136px; } .roll canvas { height: 236px; } }
    /* phone turned sideways: staff and roll on the left, the controls beside them, all on one screen */
    @media (orientation: landscape) and (max-height: 560px) {
      :host { max-width: none; min-height: 100dvh; padding: 8px 16px; gap: 8px; column-gap: 12px; grid-template-columns: minmax(0, 1fr) 280px;
        grid-template-areas: 'head head' 'note note' 'staff mode' 'staff readout' 'roll transport'; grid-template-rows: auto auto auto auto 1fr; }
      header .round { width: 36px; height: 36px; }
      .card { padding: 8px 10px 6px; }
      .roll canvas { height: max(110px, calc(100dvh - 252px)); }
      .transport { align-self: end; gap: 6px; }
      .round { width: 44px; height: 44px; }
      .main { width: 56px; height: 56px; }
    }
    .readout { grid-area: readout; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
    .readout .line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .readout big { font-family: var(--font-display); font-size: 28px; font-weight: 600; line-height: 1; margin-right: 8px; }
    .readout small { font-size: 13px; color: var(--muted); }
    .readout strong { font-size: 14px; }
    /* passive display: thin, labelled ends, no thumb at rest (must not read as a slider) */
    .meter { position: relative; height: 3px; margin-top: 4px; background: var(--line); }
    .meter .band { position: absolute; top: 0; bottom: 0; background: var(--accent); opacity: 0.5; }
    .meter .tick { position: absolute; left: 50%; top: -2px; width: 1px; height: 7px; background: var(--muted); }
    .meter .dot { position: absolute; top: -3px; width: 9px; height: 9px; margin-left: -4.5px; border-radius: 50%; background: var(--text); }
    .ends { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-top: -4px; }
    .transport { grid-area: transport; align-self: end; display: flex; flex-direction: column; gap: 10px; }
    @media (min-width: 960px) { .transport { align-self: start; background: var(--surface); border-radius: 24px; padding: 20px 24px; } .transport .round { background: var(--bg); } }
    .repeat { display: flex; flex-direction: column; gap: 6px; }
    .repeat .label { font-size: 12px; color: var(--muted); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { height: 40px; padding: 0 14px; border-radius: 20px; font-size: 14px; }
    .chip[aria-pressed='true'] { background: var(--accent); color: var(--ink); }
    .status { margin: 0; font-size: 13px; color: var(--muted); }
    .progress { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--muted); }
    .progress .track { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .progress .segs { position: relative; height: 22px; }
    .progress .seg { position: absolute; top: 0; bottom: 0; padding: 0 4px; margin: 0 1px; border-radius: 6px; font-size: 11px; color: var(--muted);
      overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .progress .seg[aria-pressed='true'] { color: var(--accent); }
    .progress .bar { position: relative; }
    .progress .bar div { position: absolute; top: 4px; bottom: 4px; pointer-events: none; }
    .progress .dim { background: var(--bg); opacity: 0.6; z-index: 1; }
    .progress .range { border: 2px solid var(--accent); border-radius: 6px; }
    .progress .leadin { background: var(--accent); opacity: 0.25; border-radius: 6px 0 0 6px; }
    .progress input { display: block; width: 100%; margin: 0; height: 24px; accent-color: var(--text); }
    .buttons { display: flex; align-items: center; justify-content: space-between; }
    .buttons button.round { font-size: 13px; font-weight: 700; }
    .round[aria-pressed='true'] { background: var(--accent); color: var(--ink); }
    .main { width: 72px; height: 72px; border-radius: 36px; background: var(--accent) !important; color: var(--ink) !important; }
    .mic { display: flex; align-items: center; flex: none; }
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
  declare loop: Range | null
  /** Active repeat kind; A–B with  set and no loop waits for B. */
  declare kind: Kind
  /** A–B point A, a bar line. */
  declare a: number | null
  private sectionName = ''
  /** The role set has notes in this song; otherwise listen only (`noPart` hint). */
  singsHere = false
  session!: Session
  /** Pitch frames of the last 1.5 s, oldest first. */
  frames: PitchFrame[] = []
  /** [first bar, count] of the staff page last drawn; null before the first draw. */
  private page: [number, number] | null = null
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
    this.kind = 'off'
    this.a = null
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
    const state: DrawState = {
      song: this.loaded.song,
      roles: s.roles,
      names,
      t: this.heard(),
      frames: this.frames,
      tolerance: s.tolerance,
      repeat: this.marks(),
    }
    const ctx2d = (sel: string) => this.renderRoot.querySelector<HTMLCanvasElement>(sel)?.getContext('2d') ?? null
    const page = drawStaff(ctx2d('.staff canvas'), state)
    if (page && String(page) !== String(this.page)) {
      this.page = page // the header shows the bars the staff drew
      this.requestUpdate()
    }
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
    this.singsHere = this.session.myNotes().length > 0
    this.setMode(this.singsHere ? s.mode : 'all', false)
    // Results may have set a drill loop and tempo on the engine.
    this.tempo = engine.tempo()
    this.loop = engine.loop()
    this.kind = this.loop?.phrase ? 'phrase' : 'off'
    if (!wired.has(engine)) {
      wired.add(engine)
      engine.on('tick', (t) => {
        if (current) current.t = t
      })
      engine.on('enter', (n) => current?.mic && current.session.enter(current.loaded!.song.notes.indexOf(n)))
      engine.on('ended', () => current?.pause())
      // paused elsewhere (settings calibration): the transport and the pass follow
      engine.on('pause', () => current?.playing && current.pause())
    }
    if (!wired.has(pitch)) {
      wired.add(pitch)
      pitch.on('frame', (f) => current?.onFrame(f))
    }
    if (this.singsHere)
      this.mic =
        (await pitch.start(
          () => engine.time(),
          () => engine.latency(),
          s.micDeviceId,
        )) === 'ok'
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
    this.playing = false // before engine.pause: its 'pause' event comes back here
    engine.pause()
    const passed = this.mic && this.session.endPass() // history still gets the pass
    if (!features.results) return
    if (!this.singsHere) route('#/songs')
    else if (passed) route(`#/results/${this.songId}`)
  }

  private back() {
    const ctx = getContext()
    leaveSession(ctx)
    ctx.route('#/songs')
  }

  /** Animation frame scheduler; tests swap it. */
  requestFrame = (cb: () => void) => void requestAnimationFrame(cb)
  private redrawQueued = false

  /** Frames only join the buffer; at most one redraw per animation frame (while playing the engine tick redraws). */
  private onFrame(f: PitchFrame) {
    this.session.frame(f)
    this.frames.push(f)
    while (this.frames[0].t < f.t - 1.5) this.frames.shift()
    if (this.playing || this.redrawQueued) return
    this.redrawQueued = true
    this.requestFrame(() => {
      this.redrawQueued = false
      this.requestUpdate()
    })
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

  /** Song time the singer hears now: the playback position minus the delay (drawing and readout use it; transport and seek keep `t`). */
  private heard() {
    return this.t - getContext().pitch.delay()
  }

  /** Phrase the playhead is in, or the last one started before it. */
  private phrase(): Phrase {
    const ps = this.loaded!.song.phrases
    return [...ps].reverse().find((p) => p.start <= this.t) ?? ps[0]
  }

  private setRange(kind: Kind, range: Range | null) {
    getContext().engine.setLoop(range)
    this.loop = range
    this.kind = kind
  }

  /** Switch the repeat selector. The range is fixed now; Abschnitt and Einsatz also jump to their lead-in. */
  private pick(kind: Kind) {
    const { engine } = getContext()
    const { song } = this.loaded!
    const now = this.heard()
    const roles = getContext().settings.get().roles
    if (kind === 'ab') return this.cycleAB(now)
    let range: Range | null = null
    if (kind === 'phrase') range = phraseRange(song, now)
    if (kind === 'einsatz') range = einsatzRange(song, roles, now)
    if (kind === 'section') {
      const s = sectionAt(song, now)
      if (s) return this.pickSection(s)
    }
    if (kind !== 'off' && !range) return // nothing to repeat: stay as is
    this.a = null
    this.setRange(kind, range)
    if (range?.leadIn) {
      engine.seekLeadIn(range.start)
      this.t = engine.time()
    }
  }

  /** Abschnitt repeat for `s` (chip or a tap on its progress bar segment), from its lead-in. */
  private pickSection(s: Section) {
    const { engine } = getContext()
    this.sectionName = s.name
    this.a = null
    this.setRange('section', { start: s.start, end: s.end, leadIn: true })
    engine.seekLeadIn(s.start)
    this.t = engine.time()
  }

  /** What staff, roll and progress bar draw for the active repeat: its range (A without B: A to the song end) and flags. */
  private marks(): Marks | null {
    if (this.kind === 'ab' && !this.loop) return this.a === null ? null : { start: this.a, end: this.loaded!.meta.durationSec, flags: [[this.a, 'A']] }
    if (!this.loop) return null
    const { start, end } = this.loop
    return {
      start,
      end,
      flags:
        this.kind === 'ab'
          ? [
              [start, 'A'],
              [end, 'B'],
            ]
          : [[start, this.repeatName()]],
    }
  }

  private repeatName(): string {
    return { off: '', phrase: `Phrase ${(this.loop?.phrase?.index ?? 0) + 1}`, section: this.sectionName, einsatz: 'Einsatz', ab: 'A–B' }[this.kind]
  }

  /** One chip: set A, set B (starts the repeat), clear. */
  private cycleAB(now: number) {
    const { bars } = this.loaded!.song
    if (this.kind === 'ab' && this.loop) {
      this.a = null
      return this.setRange('off', null)
    }
    const p = snapToBar(bars, now)
    if (this.kind !== 'ab' || this.a === null) {
      this.setRange('ab', null)
      this.a = p
    } else this.setRange('ab', abRange(bars, this.a, p, this.loaded!.meta.durationSec))
  }

  /** `{name} · {m:ss}–{m:ss}`; A–B with A only: `A {m:ss} · B noch nicht gesetzt`; '' without a repeat. */
  private status(): string {
    if (this.kind === 'ab' && !this.loop) return this.a === null ? '' : `A ${clock(this.a)} · B noch nicht gesetzt`
    if (!this.loop) return ''
    return `${this.repeatName()} · ${clock(this.loop.start)}–${clock(this.loop.end)}`
  }
  /** Big note, target label, cents text and meter position. */
  private readout() {
    const s = getContext().settings.get()
    const d = liveDeviation(this.loaded!.song, s.roles, this.heard(), this.frames, s.tolerance)
    if (!d) return { big: '–', label: '', text: entryCountdown(this.loaded!.song, s.roles, this.heard(), this.tempo), cents: null }
    const dir = d.cents > 0 ? 'zu hoch' : 'zu tief'
    const word = { ok: 'sauber', slight: `leicht ${dir}`, far: dir }[d.level]
    return {
      big: noteName(d.sungMidiFolded),
      label: `Ziel ${noteName(d.note.midi)}`,
      text: `${d.cents > 0 ? '+' : ''}${d.cents} Cent · ${word}`,
      cents: d.cents,
    }
  }

  render() {
    const loaded = this.loaded
    if (!loaded) return ''
    const { library, settings, openSettings } = getContext()
    const s = settings.get()
    const { bars, key, bpm } = loaded.song
    // the staff page the canvas drew; before that (and without a canvas context) the regular page of the canvas width
    const per = barsPerPage(this.renderRoot.querySelector<HTMLElement>('.staff canvas')?.clientWidth ?? 0)
    const [first, count] = this.page ?? [pageOf(bars, this.heard(), per) * per, per]
    const firstBar = first + 1
    const lastBar = first + count
    const readout = this.readout()
    const mine = library
      .roles()
      .filter((x) => s.roles.includes(x.id))
      .map((x) => x.name)
      .join(', ')
    const dur = loaded.meta.durationSec
    const status = this.status()
    const sections = !!loaded.song.sections?.length
    const marks = this.marks()
    const pct = (sec: number) => `${(sec / dur) * 100}%`
    return html`<header>
      <button class="round" aria-label="Zurück zur Auswahl" @click=${this.back}>${BACK}</button>
      <div>
        <h1>Lied ${loaded.meta.number} · ${loaded.meta.title}</h1>
        <p>Takt ${firstBar === lastBar ? firstBar : `${firstBar}–${lastBar}`} · ${key} · ${Math.round((bpm * this.tempo) / 100)} BPM</p>
      </div>
      <button class="round" aria-label="Einstellungen" @click=${openSettings}>${GEAR}</button>
    </header>
    ${
      !this.singsHere
        ? html`<p class="note" role="status">Deine Rolle singt hier nicht. Nur Zuhören.</p>`
        : !this.mic
          ? html`<p class="note" role="alert">Mikrofon nicht erlaubt. Du hörst das Lied, aber ohne Bewertung.</p>`
          : ''
    }
    <button class="mode" ?disabled=${!this.singsHere} @click=${() => this.setMode(MODES[this.mode][1])}><span>Voicetrack</span><b>${MODES[this.mode][0]}${CHEVRON}</b></button>
    <section class="card staff">
      <div class="legend"><span><i></i>Meine Stimme · ${mine}</span><span><i class="other"></i>Andere</span></div>
      <canvas></canvas>
    </section>
    <section class="card roll"><canvas></canvas></section>
    <section class="card readout" aria-live="polite">
      <div class="line"><span><big>${readout.big}</big><small>${readout.label}</small></span><strong>${readout.text}</strong></div>
      <div class="meter">
        <div class="band" style="left:${50 - s.tolerance / 2}%;width:${s.tolerance}%"></div>
        <div class="tick"></div>
        ${readout.cents === null ? '' : html`<div class="dot" style="left:${50 + Math.max(-100, Math.min(100, readout.cents)) / 2}%"></div>`}
      </div>
      <div class="ends"><span>tief</span><span>hoch</span></div>
    </section>
    <div class="transport">
      <div class="repeat" role="group" aria-label="Wiederholen">
        <span class="label">Wiederholen</span>
        <div class="chips">
          ${CHIPS.filter(([k]) => k !== 'section' || sections).map(
            ([k, label]) =>
              html`<button class="chip" data-kind=${k} aria-pressed=${k === 'off' ? this.kind === 'off' : this.kind === k} @click=${() => this.pick(k)}>${k === 'ab' && this.kind === 'ab' && !this.loop ? 'B setzen' : label}</button>`,
          )}
        </div>
        ${status ? html`<p class="status" role="status">${status}</p>` : ''}
      </div>
      <div class="progress">
        <span>${clock(this.t)}</span>
        <div class="track">
          ${
            sections
              ? html`<div class="segs">${loaded.song.sections!.map(
                  (x) =>
                    html`<button class="seg" aria-pressed=${this.kind === 'section' && this.sectionName === x.name} style="left:${pct(x.start)};right:${pct(dur - x.end)}" @click=${() => this.pickSection(x)}>${x.name}</button>`,
                )}</div>`
              : ''
          }
          <div class="bar">
            ${
              marks
                ? html`<div class="dim" style="left:0;right:${pct(dur - marks.start)}"></div>
                    <div class="dim" style="left:${pct(marks.end)};right:0"></div>
                    ${this.loop?.leadIn ? html`<div class="leadin" style="left:${pct(leadInStart(marks.start, bars))};right:${pct(dur - marks.start)}"></div>` : ''}
                    <div class="range" style="left:${pct(marks.start)};right:${pct(dur - marks.end)}"></div>`
                : ''
            }
            <input type="range" aria-label="Position" min="0" max=${dur} step="0.1" .value=${String(this.t)} @input=${(e: Event) => this.seek(+(e.target as HTMLInputElement).value)} />
          </div>
        </div>
        <span>${clock(dur)}</span>
      </div>
      <div class="buttons">
        <button class="round" aria-label="Zurück zum Anfang der Phrase" @click=${() => this.seek(this.phrase().start)}>${TO_START}</button>
        ${
          this.playing
            ? html`<button class="round main" aria-label=${features.results ? 'Pause und Auswertung' : 'Pause'} @click=${this.pause}>${PAUSE}</button>`
            : html`<button class="round main" aria-label="Abspielen" @click=${this.play}>${PLAY}</button>`
        }
        <button class="round" aria-label="Tempo ${this.tempo} Prozent" @click=${() => this.setTempo(NEXT_TEMPO[this.tempo])}>${this.tempo}%</button>
        ${this.singsHere ? html`<span class="mic ${this.mic ? 'on' : ''}" role="img" aria-label=${this.mic ? 'Mikrofon aktiv' : 'Mikrofon aus'}>${this.mic ? MIC : MIC_OFF}</span>` : ''}
      </div>
    </div>`
  }
}

customElements.define('gu-practice', GuPractice)
