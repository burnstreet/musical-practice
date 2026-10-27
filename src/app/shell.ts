import { LitElement, html } from 'lit'
import { setContext, type AppContext, type Route, type ShellDeps } from './context'
import { settings } from './settings'
import './settings-sheet'

/** Guarded target for a hash: start while not unlocked, songs unless practice/results of a ready song. */
function guard(ctx: AppContext, hash: string): Route {
  if (ctx.vault.state() !== 'unlocked') return '#/start'
  const m = hash.match(/^#\/(?:practice|results)\/(.+)$/)
  return m && ctx.library.isReady(m[1]) ? (hash as Route) : '#/songs'
}

export class GuApp extends LitElement {
  /** Set before the element connects: main.ts with the real modules, tests with fakes. */
  static deps: ShellDeps | null = null
  static properties = { hash: { state: true }, toast: { state: true }, settingsOpen: { state: true } }

  declare hash: string
  declare toast: string
  declare settingsOpen: boolean
  ctx!: AppContext
  /** Resolves when boot (manifest, vault init, first route) is done. */
  ready!: Promise<void>

  constructor() {
    super()
    this.hash = ''
    this.toast = ''
    this.settingsOpen = false
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
      ensureHeadphoneSheet: async () => {},
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

  private onHash = () => {
    const to = guard(this.ctx, location.hash)
    if (to !== location.hash) history.replaceState(null, '', to)
    if (to === '#/songs' || to === '#/start') this.ctx.live = null
    this.hash = to
  }

  render() {
    return html`${this.screen()}
      ${this.settingsOpen ? html`<gu-settings-sheet @close=${() => (this.settingsOpen = false)}></gu-settings-sheet>` : ''}
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
