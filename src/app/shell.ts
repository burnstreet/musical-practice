import { LitElement, css, html } from 'lit'
import { sheetStyles } from './sheet'
import { setContext, type AppContext, type Route, type ShellDeps } from './context'
import { settings } from './settings'
import './settings-sheet'
import './headphone-sheet'
import './screens/start'
import './screens/songs'

/** Guarded target for a hash: start while not unlocked, songs unless practice/results of a ready song. */
function guard(ctx: AppContext, hash: string): Route {
  if (ctx.vault.state() !== 'unlocked') return '#/start'
  const m = hash.match(/^#\/(?:practice|results)\/(.+)$/)
  return m && ctx.library.isReady(m[1]) ? (hash as Route) : '#/songs'
}

export class GuApp extends LitElement {
  /** Set before the element connects: main.ts with the real modules, tests with fakes. */
  static deps: ShellDeps | null = null
  static styles = [sheetStyles, css`
    :host { display: block; min-height: 100vh; background: var(--bg); color: var(--text); font-family: var(--font-body); }
    .hint { margin: 16px; padding: 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
    .hint p { color: var(--text); margin: 0 0 12px; }
    .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); padding: 12px 20px; border-radius: 999px; background: var(--accent); color: var(--ink); font-weight: 700; z-index: 20; }
  `]
  static properties = { hash: { state: true }, toast: { state: true }, settingsOpen: { state: true }, headphoneDone: { state: true } }

  declare hash: string
  declare toast: string
  declare settingsOpen: boolean
  /** Set while the headphone sheet is up; resolves the pending ensureHeadphoneSheet. */
  declare headphoneDone: (() => void) | null
  ctx!: AppContext
  /** Resolves when boot (manifest, vault init, first route) is done. */
  ready!: Promise<void>

  constructor() {
    super()
    this.hash = ''
    this.toast = ''
    this.settingsOpen = false
    this.headphoneDone = null
  }

  connectedCallback() {
    super.connectedCallback()
    const deps = GuApp.deps
    if (!deps) throw new Error('GuApp.deps not set')
    this.ctx = {
      ...deps,
      settings,
      live: null,
      route: (to) => { location.hash = to },
      openSettings: () => { this.settingsOpen = true },
      ensureHeadphoneSheet: () =>
        settings.get().headphoneSheetSeen ? Promise.resolve() : new Promise<void>((r) => { this.headphoneDone = r }),
    }
    setContext(this.ctx)
    window.addEventListener('hashchange', this.onHash)
    this.ready = this.boot()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('hashchange', this.onHash)
  }

  private async boot() {
    const { vault, library } = this.ctx
    if ((await vault.init(await library.fetchManifest())) === 'unlocked') {
      await library.fetchManifest() // reload the library now that decrypt works
      void library.sync()
    }
    this.onHash()
    // Only asked at launch: a worker installed mid-run just waits, so practice is never interrupted.
    if (await this.ctx.sw.activateWaiting()) {
      this.toast = 'Neue Version geladen'
      setTimeout(() => (this.toast = ''), 4000)
    }
  }

  private onHeadphone = (e: CustomEvent<{ dontShow: boolean }>) => {
    if (e.detail.dontShow) settings.set({ headphoneSheetSeen: true })
    this.headphoneDone?.()
    this.headphoneDone = null
  }

  private onHash = () => {
    const to = guard(this.ctx, location.hash)
    if (to !== location.hash) history.replaceState(null, '', to)
    if (to === '#/songs' || to === '#/start') this.ctx.live = null
    this.hash = to
  }

  render() {
    const hint = this.hash === '#/songs' && !settings.get().installHintSeen && this.ctx.isIosSafariTab()
    return html`${hint
        ? html`<aside class="hint">
            <p>Zum Startbildschirm hinzufügen, damit die Lieder gespeichert bleiben: Teilen-Symbol, dann „Zum Home-Bildschirm“.</p>
            <button @click=${() => { settings.set({ installHintSeen: true }); this.requestUpdate() }}>Verstanden</button>
          </aside>`
        : ''}
      ${this.screen()}
      ${this.settingsOpen ? html`<gu-settings-sheet @close=${() => (this.settingsOpen = false)}></gu-settings-sheet>` : ''}
      ${this.headphoneDone ? html`<gu-headphone-sheet @done=${this.onHeadphone}></gu-headphone-sheet>` : ''}
      ${this.toast ? html`<div class="toast" role="status">${this.toast}</div>` : ''}`
  }

  private screen() {
    const [, screen, id] = this.hash.match(/^#\/(\w+)\/?(.*)$/) ?? []
    switch (screen) {
      case 'start': return html`<gu-start></gu-start>`
      case 'songs': return html`<gu-songs></gu-songs>`
      case 'practice': return html`<gu-practice .songId=${id}></gu-practice>`
      case 'results': return html`<gu-results .songId=${id}></gu-results>`
    }
  }
}

customElements.define('gu-app', GuApp)

