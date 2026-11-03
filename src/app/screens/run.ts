import { css, html, LitElement, svg } from 'lit'
import { keyed } from 'lit/directives/keyed.js'
import { CUE_DEFAULTS, hintText } from '../../core/cue'
import type { ScriptItem } from '../../core/types'
import { getContext } from '../context'
import { type Dialog, type DialogDeps, openDialog, unlockAudio } from '../dialog'
import type { DialogSettings } from '../settings'
import { de1 } from '../settings-sheet'
import '../settings-sheet'
import { SLIDERS } from './roles'
import { lineCount, sceneNo } from './text'

/** Line text with its inline directions `[x]` as italic direction spans, brackets removed. */
const inline = (text: string) => text.split(/(\[[^\]]*\])/).map((p) => (p.startsWith('[') ? html`<span class="inl">${p.slice(1, -1)}</span>` : p))

/** A direction names one of my roles as a whole word (directions carry no role). */
const forMe = (text: string, myNames: string[]) =>
  myNames.some((n) => new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(text))

const icon = (body: ReturnType<typeof svg>, size = 22) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`
const BACK = icon(svg`<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`, 20)
const PREV = icon(
  svg`<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M19 5v14L9 12z"/><path d="M5 5v14" stroke-linecap="round"/></g>`,
)
const SKIP = icon(
  svg`<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 5v14l10-7z"/><path d="M19 5v14" stroke-linecap="round"/></g>`,
  18,
)
const PAUSE = icon(svg`<g fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></g>`, 26)
const PAUSE_S = icon(svg`<g fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></g>`)
const PLAY = icon(svg`<path d="M7 4.5v15l13-7.5z" fill="currentColor"/>`, 26)
const NEXT = icon(
  svg`<path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  20,
)
const MIC = icon(
  svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></g>`,
  16,
)
const EYE = icon(
  svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></g>`,
  18,
)
const SPEAKER = icon(
  svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14"/></g>`,
  18,
)
const NOTE = icon(
  svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></g>`,
)
const ALERT = icon(
  svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></g>`,
  18,
)
const WAVE = (w: number, h: number) =>
  html`<svg class="wave" width=${w} height=${h} viewBox="0 0 44 20" aria-hidden="true"><g fill="currentColor"><rect x="0" y="7" width="4" height="6" rx="2"/><rect x="8" y="3" width="4" height="14" rx="2"/><rect x="16" y="0" width="4" height="20" rx="2"/><rect x="24" y="5" width="4" height="10" rx="2"/><rect x="32" y="2" width="4" height="16" rx="2"/><rect x="40" y="7" width="4" height="6" rx="2"/></g></svg>`

const PAST = 14

/** Run-through `#/text/{sceneId}[/{itemId}]` (artboards D2–D4, Desktop D2). The shell sets `sceneId` and `itemId`; tests set `deps`. */
export class GuRun extends LitElement {
  static properties = {
    sceneId: {},
    itemId: {},
    dialog: { state: true },
    revealed: { state: true },
    settingsOpen: { state: true },
  }
  static styles = css`
    :host { display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; height: 100vh; height: 100dvh; padding: 16px; overflow: hidden;
      background: var(--bg); color: var(--text); font-family: var(--font-body); }
    button { font: inherit; color: inherit; cursor: pointer; border: 0; }
    button:disabled { cursor: default; opacity: 0.5; }
    .round { width: 52px; height: 52px; border-radius: 26px; background: var(--surface); color: var(--text); display: flex; align-items: center; justify-content: center; flex: none; }
    header { display: flex; align-items: center; gap: 10px; flex: none; }
    header .round { width: 44px; height: 44px; border-radius: 22px; }
    header div { flex: 1; min-width: 0; }
    h1 { margin: 0; font-family: var(--font-display); font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .progress { height: 3px; border-radius: 2px; background: var(--line); margin-top: 6px; }
    .progress i { display: block; height: 100%; border-radius: 2px; background: var(--text); }
    .missed { display: flex; align-items: center; gap: 10px; background: var(--ink); border-radius: 12px; padding: 8px 12px; font-size: 13px; flex: none; color: #ffd166; }
    .missed span { flex: 1; color: var(--text); }
    .missed button { background: transparent; color: #ffd166; font-weight: 700; min-height: 32px; }
    .layout { flex: 1; min-height: 0; display: flex; gap: 24px; }
    nav { display: none; }
    main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
    .past { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: 8px; overflow: hidden;
      mask-image: linear-gradient(to bottom, transparent, #000 40px); -webkit-mask-image: linear-gradient(to bottom, transparent, #000 40px); }
    .past > * { flex: none; padding: 0 4px; }
    .inl { font-style: italic; color: var(--muted); }
    .dir { font-size: 14px; font-style: italic; line-height: 1.4; color: var(--muted); }
    .who { font-size: 12px; font-weight: 700; color: var(--other); }
    .who.me { color: var(--accent); }
    .said { font-size: 16px; line-height: 1.4; margin-top: 1px; }
    .current { flex: 0 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; box-sizing: border-box; }
    .big { font-family: var(--font-display); font-size: 23px; font-weight: 500; line-height: 1.35; }
    .play { background: #fff; color: var(--ink); border-radius: 18px; padding: 14px 14px 16px; gap: 8px; }
    .play .top { display: flex; align-items: center; justify-content: space-between; }
    .chip { height: 26px; padding: 0 12px; border-radius: 13px; background: var(--bg); color: #fff; display: flex; align-items: center; font-size: 13px; font-weight: 700; }
    .wave { color: var(--bg); }
    .next { border: 2px dashed var(--accent); border-radius: 14px; padding: 8px 12px; display: flex; align-items: center; gap: 10px; flex: none; color: var(--accent); }
    .next b { flex: 1; font-size: 13px; }
    .next span { font-size: 12px; color: var(--muted); }
    .turn { background: var(--accent); color: var(--ink); border-radius: 20px; padding: 14px; gap: 10px; }
    .turn .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .turn h2 { margin: 0; font-family: var(--font-display); font-size: 20px; font-weight: 600; }
    .status { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }
    .status .wave { color: var(--ink); }
    .hidden { display: flex; flex-direction: column; gap: 8px; padding: 6px 0; }
    .hidden i { height: 14px; border-radius: 7px; background: var(--ink); opacity: 0.18; }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; }
    .acts button { flex: 1; height: 44px; border-radius: 22px; border: 2px solid var(--ink); background: transparent; color: var(--ink); font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .level { display: flex; align-items: center; gap: 8px; font-size: 12px; }
    .meter { flex: 1; height: 6px; border-radius: 3px; background: #b3cb45; overflow: hidden; }
    .meter i { display: block; height: 100%; border-radius: 3px; background: var(--ink); }
    .dir.me { color: var(--accent); }
    .direction { border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; gap: 6px; }
    .label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
    .direction.me { border: 2px solid var(--accent); }
    .direction.me .label { color: var(--accent); }
    .direction p { margin: 0; font-size: 16px; font-style: italic; line-height: 1.4; }
    .run { height: 3px; border-radius: 2px; background: var(--line); overflow: hidden; }
    .run i { display: block; height: 100%; background: var(--muted); transform-origin: left; animation: run linear forwards; }
    @keyframes run { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    .song { background: #fff; color: var(--ink); border-radius: 20px; padding: 14px; gap: 12px; }
    .song .top { display: flex; align-items: center; gap: 12px; }
    .song .disc { width: 44px; height: 44px; border-radius: 22px; background: var(--bg); color: #fff; display: flex; align-items: center; justify-content: center; flex: none; }
    .song small { display: block; font-size: 12px; font-weight: 700; color: var(--bg); }
    .song strong { display: block; font-family: var(--font-display); font-size: 20px; font-weight: 600; margin-top: 2px; }
    .song .acts button { height: 48px; border-radius: 24px; border-color: var(--bg); color: var(--bg); }
    .song .acts button.go { background: var(--accent); border-color: var(--accent); color: var(--ink); }
    .controls { display: flex; align-items: center; justify-content: space-between; flex: none; }
    .controls .main { width: 64px; height: 64px; border-radius: 32px; background: var(--accent); color: var(--ink); }
    .controls .pill { height: 52px; padding: 0 14px; border-radius: 26px; background: var(--surface); display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }
    .controls .rate { font-size: 13px; font-weight: 700; }
    .controls .weiter { flex: 1; margin: 0 12px; height: 60px; border-radius: 30px; background: #fff; color: var(--ink); font-size: 17px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; }
    /* phone turned sideways: less chrome, more text */
    @media (max-height: 500px) {
      :host { padding: 8px 16px; gap: 6px; }
      header .round { width: 40px; height: 40px; }
      .big { font-size: 19px; }
      .round { width: 44px; height: 44px; }
      .controls .main { width: 52px; height: 52px; }
      .controls .pill { height: 44px; }
      .controls .weiter { height: 48px; }
    }
    @media (min-width: 960px) {
      :host { padding: 24px 40px; max-width: 1200px; margin: 0 auto; }
      h1 { font-size: 26px; }
      .progress { height: 4px; }
      nav { display: flex; flex-direction: column; gap: 6px; flex: 0 1 300px; overflow-y: auto; }
      nav h2 { margin: 0 0 4px; font-family: var(--font-display); font-size: 20px; font-weight: 600; }
      nav button { display: flex; align-items: center; gap: 12px; border-radius: 14px; padding: 8px 12px; min-height: 48px; background: var(--surface); text-align: left; }
      nav button[aria-current='true'] { background: #fff; color: var(--ink); }
      nav .n { width: 30px; height: 30px; border-radius: 15px; background: var(--bg); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex: none; }
      nav [aria-current='true'] .n { background: var(--accent); color: var(--ink); }
      nav .t { flex: 1; min-width: 0; font-size: 14px; font-weight: 700; }
      nav .m { font-size: 12px; flex: none; }
      main { max-width: 760px; }
      .big { font-size: 24px; }
      .controls { justify-content: flex-start; gap: 10px; }
      .controls .weiter { flex: none; margin: 0; padding: 0 28px; }
    }
  `

  declare sceneId: string
  declare itemId: string
  declare dialog: Dialog | null
  /** First item id of the turn whose line was revealed. */
  declare revealed: string | null
  declare settingsOpen: boolean
  /** Controller seams; tests swap them. */
  deps?: DialogDeps
  private opening = 0
  /** Text settings when the sheet opened. */
  private settingsBefore: DialogSettings | null = null

  constructor() {
    super()
    this.sceneId = ''
    this.itemId = ''
    this.dialog = null
    this.revealed = null
    this.settingsOpen = false
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('visibilitychange', this.onHidden)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('visibilitychange', this.onHidden)
    this.opening++
    this.dialog?.dispose()
    this.dialog = null
  }

  updated(changed: Map<string, unknown>) {
    if ((changed.has('sceneId') || changed.has('itemId')) && this.sceneId) this.open().catch(console.error)
  }

  private async open() {
    const n = ++this.opening
    this.dialog?.dispose()
    this.dialog = null
    const d = await openDialog(getContext(), { sceneId: this.sceneId, itemId: this.itemId || undefined }, () => this.changed(), this.deps)
    if (n !== this.opening) return d.dispose()
    this.dialog = d
  }

  private changed() {
    if (this.dialog?.cue.state === 'done') {
      getContext().route('#/text')
      return
    }
    this.requestUpdate()
  }

  private send(type: 'tap' | 'skip' | 'back' | 'prompt' | 'pause' | 'resume') {
    if (type === 'resume' || type === 'tap') unlockAudio()
    this.dialog?.send({ type })
  }

  private mine() {
    const s = this.dialog?.cue.state
    return s === 'waiting' || s === 'speaking' || s === 'prompting'
  }

  /** Space bar: `Weiter` in my turn, pause/resume elsewhere. */
  private onKey = (e: KeyboardEvent) => {
    if (e.key !== ' ' || e.repeat || !this.dialog || this.settingsOpen) return
    e.preventDefault() // no scrolling, no click on a focused button
    if (this.mine()) this.send('tap')
    else this.send(this.dialog.cue.state === 'paused' ? 'resume' : 'pause')
  }
  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ' && !this.settingsOpen) e.preventDefault()
  }

  /** Phone locked or app switched: pause, which also stores the position. */
  private onHidden = () => {
    const s = this.dialog?.cue.state
    if (document.visibilityState === 'hidden' && s && s !== 'paused' && s !== 'done') this.send('pause')
  }

  private openSettings() {
    const s = this.dialog?.cue.state
    if (s && s !== 'paused' && s !== 'done') this.send('pause')
    this.settingsBefore = { ...getContext().settings.get().dialog }
    this.settingsOpen = true
  }

  /** Directions or loop changed: the cue starts again at the current turn with them. */
  private closeSettings() {
    this.settingsOpen = false
    const d = getContext().settings.get().dialog
    if (d.showDirections !== this.settingsBefore?.showDirections || d.loopScene !== this.settingsBefore?.loopScene) this.dialog?.restart()
  }

  private practiceSong(songId: string) {
    const ctx = getContext()
    const { sceneId, itemId } = this.dialog!.cue.position()
    ctx.returnTo = `#/text/${sceneId}/${itemId}`
    ctx.route(`#/practice/${songId}`)
  }

  render() {
    const d = this.dialog
    if (!d) return ''
    const { library, settings } = getContext()
    const s = settings.get()
    const { cue } = d
    const scenes = d.loaded.script.scenes
    const si = Math.max(
      0,
      scenes.findIndex((x) => x.id === cue.sceneId),
    )
    const scene = scenes[si]
    const flow = scene.items.filter((i) => s.dialog.showDirections || i.type !== 'direction')
    const first = cue.turn[0]
    const at = first ? flow.indexOf(first) : flow.length
    const last = first ? flow.indexOf(cue.turn.at(-1)!) : flow.length
    const past = flow.slice(Math.max(0, at - PAST), Math.max(0, at))
    const names = new Map(library.roles().map((r) => [r.id, r.name]))
    const mine = (i: ScriptItem) => i.type === 'line' && s.roles.includes(i.role)
    const myNames = s.roles.map((id) => names.get(id) ?? id)
    const no = sceneNo(scene, si)
    return html`<header>
        <button class="round" aria-label="Zurück zur Auswahl" @click=${() => getContext().route('#/text')}>${BACK}</button>
        <div>
          <h1>Szene ${no}${scene.title ? ` · ${scene.title}` : ''}</h1>
          <div class="progress" role="img" aria-label="Fortschritt in der Szene: ${at + 1} von ${flow.length}"><i style="width:${flow.length ? (100 * (at + 1)) / flow.length : 0}%"></i></div>
        </div>
        <button class="round" aria-label="Einstellungen" @click=${this.openSettings}>${SLIDERS}</button>
      </header>
      ${
        d.missed
          ? html`<div class="missed" role="status">${ALERT}<span>Nichts gehört, nach ${CUE_DEFAULTS.hardTimeoutMs / 1000} s weitergemacht.</span><button @click=${() => this.send('back')}>Nochmal</button></div>`
          : ''
      }
      <div class="layout">
        <nav aria-label="Szenen">
          <h2>Szenen</h2>
          ${scenes.map(
            (x, i) => html`<button aria-current=${x.id === scene.id} @click=${() => {
              unlockAudio()
              getContext().route(`#/text/${x.id}`)
            }}>
              <span class="n">${sceneNo(x, i)}</span><span class="t">${x.title}</span><span class="m">${lineCount(x, s.roles) ? lineLabel(lineCount(x, s.roles)) : ''}</span>
            </button>`,
          )}
        </nav>
        <main>
          <div class="past">${past.map((i, k) => this.pastItem(i, mine(i) || (i.type === 'direction' && forMe(i.text, myNames)), names, 0.35 + (0.5 * (k + 1)) / past.length))}</div>
          ${this.current(names, myNames)}
          ${cue.state === 'playing' ? this.upNext(flow.slice(last + 1), mine, names) : ''}
        </main>
      </div>
      ${this.controls()}
      ${this.settingsOpen ? html`<gu-text-settings @close=${this.closeSettings}></gu-text-settings>` : ''}`
  }

  private pastItem(i: ScriptItem, me: boolean, names: Map<string, string>, fade: number) {
    if (i.type === 'direction') return html`<div class="dir ${me ? 'me' : ''}" style="opacity:${fade}">${i.text}</div>`
    if (i.type === 'song') return html`<div class="dir" style="opacity:${fade}">${this.songTitle(i.songId)}</div>`
    const name = names.get(i.role) ?? i.role
    return html`<div style="opacity:${fade}"><div class="who ${me ? 'me' : ''}">${me ? `${name} · du` : name}</div><div class="said">${inline(i.text)}</div></div>`
  }

  private songTitle(songId: string) {
    const song = getContext()
      .library.songs()
      .find((x) => x.id === songId)
    return song ? `Lied ${song.number} · ${song.title}` : `Lied ${songId}`
  }

  private current(names: Map<string, string>, myNames: string[]) {
    const d = this.dialog!
    const { cue } = d
    const first = cue.turn[0]
    if (!first) return ''
    const s = getContext().settings.get()
    const paused = cue.state === 'paused'
    if (first.type === 'direction')
      return html`<div class="current direction ${forMe(first.text, myNames) ? 'me' : ''}"><span class="label">Regie</span><p>${first.text}</p>
        ${paused ? '' : html`<div class="run">${keyed(first.id + cue.state, html`<i style="animation-duration:${CUE_DEFAULTS.directionMs}ms"></i>`)}</div>`}</div>`
    if (first.type === 'song') {
      const { library } = getContext()
      const song = library.songs().find((x) => x.id === first.songId)
      const singers = library
        .roles()
        .filter((r) => s.roles.includes(r.id) && song?.roles.includes(r.id))
        .map((r) => r.name)
      return html`<div class="current song">
        <div class="top"><span class="disc">${NOTE}</span><span><small>Jetzt kommt ein Lied${singers.length ? ` · ${singers.join(', ')} ${singers.length > 1 ? 'singen' : 'singt'} mit` : ''}</small><strong>${this.songTitle(first.songId)}</strong></span></div>
        <div class="acts">
          <button class="go" ?disabled=${!library.isReady(first.songId)} @click=${() => this.practiceSong(first.songId)}>${icon(svg`<path d="M7 4l13 8-13 8z" fill="currentColor"/>`, 14)}Lied üben</button>
          <button @click=${() => this.send(paused ? 'resume' : 'tap')}>Weiter im Text</button>
        </div>
      </div>`
    }
    const role = first.role
    if (!s.roles.includes(role))
      return html`<div class="current play">
        <div class="top"><span class="chip">${names.get(role) ?? role}</span>${cue.state === 'playing' ? html`<span role="img" aria-label="Wiedergabe läuft">${WAVE(44, 18)}</span>` : ''}</div>
        <div class="big">${inline(first.text)}</div>
      </div>`
    return this.myTurn()
  }

  private myTurn() {
    const d = this.dialog!
    const { cue } = d
    const s = getContext().settings.get()
    const lines = cue.turn.flatMap((i) => (i.type === 'line' ? [i.text] : []))
    const mode = this.revealed === cue.turn[0].id ? 'show' : s.dialog.hint
    const canReveal = lines.some((t) => hintText(t, mode) !== t)
    const live = cue.state === 'waiting' || cue.state === 'speaking'
    return html`<div class="current turn">
      <div class="top"><h2>Du bist dran</h2>
        ${
          live && !d.micFailed
            ? html`<span class="status" role="status">${cue.state === 'speaking' ? html`${WAVE(34, 16)}du sprichst` : html`${MIC}hört zu`}</span>`
            : ''
        }
      </div>
      ${lines.map((t) =>
        mode === 'hide'
          ? html`<div class="hidden" role="img" aria-label="Zeile verdeckt"><i style="width:92%"></i><i style="width:58%"></i></div>`
          : html`<div class="big">${inline(hintText(t, mode))}</div>`,
      )}
      <div class="acts">
        ${canReveal ? html`<button @click=${() => (this.revealed = cue.turn[0].id)}>${EYE}Aufdecken</button>` : ''}
        <button ?disabled=${!live} @click=${() => this.send('prompt')}>${SPEAKER}Vorsprechen</button>
      </div>
      ${
        live && !d.micFailed
          ? html`<div class="level"><div class="meter" role="img" aria-label="Mikrofonpegel"><i style="width:${Math.min(100, d.level() * 300)}%"></i></div>
            <span>weiter nach ${de1(s.dialog.silenceMs / 1000)} s Stille</span></div>`
          : ''
      }
    </div>`
  }

  /** `Gleich du` when the turn after this one is mine. */
  private upNext(rest: ScriptItem[], mine: (i: ScriptItem) => boolean, names: Map<string, string>) {
    const end = rest.findIndex((i) => !mine(i))
    const next = rest.slice(0, end < 0 ? rest.length : end)
    if (!next.length) return ''
    const who = [...new Set(next.map((i) => (i.type === 'line' ? (names.get(i.role) ?? i.role) : '')))].join(', ')
    return html`<div class="next">${MIC}<b>Gleich du · ${who}, ${lineLabel(next.length)}</b><span>Mikro noch aus</span></div>`
  }

  private controls() {
    const { cue } = this.dialog!
    const rate = getContext().settings.get().dialog.rate
    const paused = cue.state === 'paused'
    const back = html`<button class="round" aria-label="Zurück zum vorigen Eintrag" ?disabled=${paused} @click=${() => this.send('back')}>${PREV}</button>`
    if (this.mine())
      return html`<div class="controls">${back}
        <button class="weiter" @click=${() => this.send('tap')}>Weiter${NEXT}</button>
        <button class="round" aria-label="Pause" @click=${() => this.send('pause')}>${PAUSE_S}</button>
      </div>`
    const first = cue.turn[0]
    const speaker =
      first?.type === 'line'
        ? (getContext()
            .library.roles()
            .find((r) => r.id === first.role)?.name ?? first.role)
        : ''
    return html`<div class="controls">${back}
      ${
        cue.state === 'playing'
          ? html`<button class="pill" aria-label="Rest von ${speaker} überspringen" @click=${() => this.send('skip')}>${SKIP}Überspringen</button>`
          : ''
      }
      <button class="round main" aria-label=${paused ? 'Fortsetzen' : 'Pause'} @click=${() => this.send(paused ? 'resume' : 'pause')}>${paused ? PLAY : PAUSE}</button>
      <button class="round rate" aria-label="Sprechtempo der anderen ${de1(rate)}-fach" @click=${this.openSettings}>${de1(rate)}×</button>
    </div>`
  }
}

/** `{n} Zeilen`, one `Zeile`. */
export const lineLabel = (n: number) => (n === 1 ? '1 Zeile' : `${n} Zeilen`)

customElements.define('gu-run', GuRun)
