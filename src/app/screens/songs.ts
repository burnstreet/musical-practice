import { LitElement, css, html } from 'lit'
import { getContext } from '../context'
import type { Mode } from '../../core/audio-engine'
import type { RoleId } from '../../core/content'
import type { DownloadProgress } from '../../core/library'

const MB = 1024 * 1024
const MODES: [Mode, string, string][] = [
  ['all', 'Mit Voicetrack', 'Alle Stimmen sind zu hören.'],
  ['others', 'Voicetrack nur für andere', 'Meine Rolle ist stumm, die anderen Stimmen sind zu hören.'],
  ['backing', 'Nur Playback', 'Nur die Begleitung, keine Stimmen.'],
]

/** Role and song selection. */
export class GuSongs extends LitElement {
  static styles = css`
    :host { display: block; min-height: 100vh; background: var(--bg); color: var(--text); font-family: var(--font-body); }
    main { max-width: 720px; margin: 0 auto; padding: 36px 20px 32px; box-sizing: border-box; display: flex; flex-direction: column; gap: 18px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    h1 { margin: 0; font-family: var(--font-display); font-size: 32px; font-weight: 600; line-height: 1.1; }
    h2 { margin: 0; font-family: var(--font-display); font-size: 22px; font-weight: 600; }
    .sub { font-size: 14px; color: var(--muted); margin-top: 6px; }
    button { font: inherit; color: inherit; cursor: pointer; }
    .gear { width: 44px; height: 44px; border-radius: 22px; border: 1px solid var(--line); background: transparent; font-size: 20px; flex: none; }
    .progress { background: var(--surface); border-radius: 12px; padding: 10px 14px; font-size: 13px; color: var(--muted); }
    .bar { height: 6px; border-radius: 3px; background: var(--line); margin-top: 8px; overflow: hidden; }
    .bar > i { display: block; height: 100%; background: var(--accent); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { height: 44px; padding: 0 18px; border-radius: 22px; border: 2px solid var(--other); background: transparent; font-size: 14px; font-weight: 500; }
    .chip[aria-pressed='true'] { background: var(--accent); border-color: var(--accent); color: var(--ink); font-weight: 700; }
    .listhead { display: flex; align-items: baseline; justify-content: space-between; margin-top: 8px; }
    .legend { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    li { background: var(--surface); border-radius: 16px; border: 2px solid transparent; }
    li.open { border-color: var(--accent); }
    li.muted { opacity: 0.6; }
    .row { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 64px; padding: 10px 14px; background: transparent; border: 0; text-align: left; box-sizing: border-box; }
    .num { width: 36px; height: 36px; border-radius: 18px; background: var(--bg); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex: none; }
    .open .num { background: var(--accent); color: var(--ink); }
    .txt { flex: 1; min-width: 0; }
    .title { display: block; font-size: 15px; font-weight: 700; }
    .roles { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; }
    .dot { width: 8px; height: 8px; border-radius: 4px; background: var(--accent); flex: none; display: inline-block; }
    .badge { font-size: 13px; font-weight: 700; color: var(--accent); flex: none; }
    .panel { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 6px; }
    .mode { display: flex; flex-direction: column; gap: 2px; min-height: 44px; padding: 10px 12px; border-radius: 12px; border: 2px solid var(--line); background: var(--bg); }
    .mode.on { border-color: var(--accent); }
    .mode label { font-size: 14px; font-weight: 700; display: flex; gap: 10px; align-items: center; cursor: pointer; }
    .mode small { font-size: 12px; line-height: 1.4; color: var(--muted); padding-left: 30px; }
    .start { height: 52px; border-radius: 26px; border: 0; background: var(--accent); color: var(--ink); font-size: 15px; font-weight: 700; margin-top: 6px; }
  `
  static properties = {
    selected: { state: true }, badges: { state: true }, progress: { state: true }, open: { state: true }, mode: { state: true },
  }

  declare selected: RoleId[]
  declare badges: Record<string, number | null>
  declare progress: DownloadProgress | null
  declare open: string | null
  declare mode: Mode

  constructor() {
    super()
    const s = getContext().settings.get()
    this.selected = s.roles
    this.mode = s.mode
    this.badges = {}
    this.progress = null
    this.open = null
  }

  connectedCallback() {
    super.connectedCallback()
    getContext().library.onProgress((p) => { this.progress = p })
    void this.loadBadges()
  }

  private async loadBadges() {
    const { library, history } = getContext()
    const sel = this.selected
    const entries = await Promise.all(library.songs().map(async (s) => [s.id, await history.badge(s.id, sel)] as const))
    if (sel === this.selected) this.badges = Object.fromEntries(entries)
  }

  private toggle(id: RoleId) {
    this.selected = this.selected.includes(id) ? this.selected.filter((r) => r !== id) : [...this.selected, id]
    getContext().settings.set({ roles: this.selected })
    void this.loadBadges()
  }

  private start(id: string) {
    const ctx = getContext()
    ctx.settings.set({ mode: this.mode })
    ctx.route(`#/practice/${id}`)
  }

  render() {
    const { library, openSettings } = getContext()
    const names = new Map(library.roles().map((r) => [r.id, r.name]))
    const p = this.progress
    const showProgress = p && (!p.done || p.error)
    return html`<main>
      <header>
        <div><h1>Wer bist du im Stück?</h1><div class="sub">Du kannst mehrere Rollen wählen.</div></div>
        <button class="gear" aria-label="Einstellungen" @click=${() => openSettings()}>⚙</button>
      </header>
      ${showProgress
        ? html`<div class="progress">${p.error
            ? 'Download unterbrochen. Beim nächsten Start geht es weiter.'
            : `Lädt … ${Math.round(p.doneBytes / MB)} von ${Math.round(p.totalBytes / MB)} MB`}
            <div class="bar"><i style="width:${p.totalBytes ? (100 * p.doneBytes) / p.totalBytes : 0}%"></i></div></div>`
        : ''}
      <div class="chips">
        ${library.roles().filter((r) => r.sings).map((r) => html`<button class="chip" aria-pressed=${this.selected.includes(r.id)} @click=${() => this.toggle(r.id)}>${r.name}</button>`)}
      </div>
      <div class="listhead"><h2>Lied zum Üben</h2><span class="legend"><span class="dot"></span>deine Rolle singt mit</span></div>
      <ul>${library.songs().map((s) => this.song(s, names))}</ul>
    </main>`
  }

  private song(s: ReturnType<ReturnType<typeof getContext>['library']['songs']>[number], names: Map<string, string>) {
    const ready = getContext().library.isReady(s.id)
    const open = ready && this.open === s.id
    const mine = s.roles.some((r) => this.selected.includes(r))
    const badge = this.badges[s.id]
    return html`<li class="${open ? 'open' : ''} ${ready ? '' : 'muted'}">
      <button class="row" data-song=${s.id} aria-expanded=${open} @click=${() => { if (ready) this.open = open ? null : s.id }}>
        <span class="num">${s.number}</span>
        <span class="txt"><span class="title">${s.title}</span><span class="roles">${ready ? s.roles.map((r) => names.get(r) ?? r).join(' · ') : 'wird geladen'}</span></span>
        ${badge != null ? html`<span class="badge">${badge} %</span>` : ''}
        ${mine ? html`<span class="dot"></span>` : ''}
      </button>
      ${open
        ? html`<div class="panel" role="radiogroup" aria-label="Voicetrack">
            ${MODES.map(([m, title, desc]) => html`<div class="mode ${this.mode === m ? 'on' : ''}">
              <label><input type="radio" name="mode" .checked=${this.mode === m} @change=${() => { this.mode = m }} />${title}</label>
              <small>${desc}</small></div>`)}
            <button class="start" @click=${() => this.start(s.id)}>Üben starten</button>
          </div>`
        : ''}
    </li>`
  }
}

customElements.define('gu-songs', GuSongs)
