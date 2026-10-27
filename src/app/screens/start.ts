import { LitElement, css, html } from 'lit'
import { getContext } from '../context'
import type { Manifest } from '../../core/content'

const eye = html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`
const lock = html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>`
const shield = html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:1px"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`

/** Password screen. Unlocks the vault, then starts the library sync and routes to the songs. */
export class GuStart extends LitElement {
  static styles = css`
    :host { display: flex; box-sizing: border-box; min-height: 100vh; align-items: center; justify-content: center; padding: 48px 24px 32px; background: var(--bg); color: var(--text); font-family: var(--font-body); }
    .wrap { width: 100%; max-width: 1100px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 32px 64px; }
    .head { display: flex; flex-direction: column; align-items: center; gap: 28px; text-align: center; }
    .logo { width: 260px; max-width: 100%; height: 96px; border-radius: 20px; background: #fff; border: 2px dashed var(--other); box-sizing: border-box; display: flex; align-items: center; justify-content: center; color: var(--bg); font-size: 13px; font-weight: 700; line-height: 1.4; }
    .kicker { font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); }
    h1 { margin: 8px 0 0; font-family: var(--font-display); font-size: 36px; font-weight: 600; line-height: 1.1; }
    .sub { font-size: 14px; color: var(--muted); margin-top: 8px; }
    form { flex: 1 1 340px; max-width: 440px; display: flex; flex-direction: column; gap: 14px; background: var(--surface); border-radius: 24px; padding: 22px 20px; box-sizing: border-box; }
    label { font-size: 14px; font-weight: 700; }
    .field { display: flex; align-items: center; height: 56px; border-radius: 16px; background: #fff; padding: 0 6px 0 16px; gap: 10px; color: var(--bg); }
    input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; font: inherit; font-size: 16px; color: var(--ink); }
    input::placeholder { color: #5B6F8C; }
    .toggle { width: 44px; height: 44px; border: 0; background: transparent; color: var(--bg); display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .go { height: 56px; border: 0; border-radius: 28px; background: var(--accent); color: var(--ink); font: inherit; font-size: 16px; font-weight: 700; cursor: pointer; }
    .go:disabled { opacity: .5; cursor: default; }
    .err, .banner { font-size: 14px; margin: 0; }
    .err { color: #FFD7D7; }
    .banner { background: var(--surface); border: 1px solid var(--accent); border-radius: 16px; padding: 12px 16px; }
    .size, .foot { font-size: 13px; line-height: 1.5; color: var(--muted); margin: 0; }
    .foot { display: flex; gap: 12px; align-items: flex-start; flex-basis: 100%; max-width: 440px; }
  `
  static properties = { mb: { state: true }, value: { state: true }, show: { state: true }, busy: { state: true }, error: { state: true }, known: { state: true } }

  declare mb: number | null
  declare value: string
  declare show: boolean
  declare busy: boolean
  declare error: string
  declare known: boolean
  private manifest: Manifest | null = null

  constructor() {
    super()
    this.mb = null
    this.value = ''
    this.show = false
    this.busy = false
    this.error = ''
    this.known = false
  }

  async connectedCallback() {
    super.connectedCallback()
    const { library } = getContext()
    this.manifest = await library.fetchManifest()
    const size = library.sizeInfo()
    this.mb = size && Math.round(size.totalBytes / 1_000_000)
    this.known = true
  }

  private async submit(e: Event) {
    e.preventDefault()
    if (!this.value || this.busy) return
    const { vault, library, route } = getContext()
    this.busy = true
    this.error = ''
    const result = await this.unlock(vault, library)
    this.busy = false
    if (result === 'ok') {
      void library.sync()
      route('#/songs')
      return
    }
    this.error = result === 'wrong-password' ? 'Falsches Passwort.' : 'Keine Verbindung. Zum ersten Entsperren brauchst du Internet.'
    if (result === 'wrong-password') this.value = ''
    await this.updateComplete
    this.renderRoot.querySelector('input')!.focus()
  }

  /** The vault proves the password against the encrypted library file. */
  private async unlock(vault: ReturnType<typeof getContext>['vault'], library: ReturnType<typeof getContext>['library']) {
    this.manifest ??= await library.fetchManifest()
    if (!this.manifest) return 'no-manifest' as const
    try {
      const r = await fetch(`content/${this.manifest.library}.bin`)
      if (!r.ok) return 'no-manifest' as const
      return await vault.unlock(this.value, this.manifest, await r.arrayBuffer())
    } catch {
      return 'no-manifest' as const
    }
  }

  render() {
    const { vault } = getContext()
    const size = this.mb !== null
      ? `Nach dem Entsperren werden etwa ${this.mb} MB geladen. Am besten im WLAN.`
      : 'Zum ersten Entsperren brauchst du Internet.'
    return html`<div class="wrap">
      <div class="head">
        <div class="logo">[Logo LKG Radeland<br />hier einsetzen]</div>
        <div>
          <div class="kicker">Weihnachtsmusical 2026</div>
          <h1>Gemeinsam üben</h1>
          <div class="sub">Lieder zum Mitsingen mit Tonhöhen-Feedback</div>
        </div>
      </div>
      <form @submit=${this.submit}>
        ${vault.state() === 'password-changed' ? html`<p class="banner" role="status">Das Passwort wurde geändert. Bitte neu eingeben.</p>` : ''}
        <label for="pw">Passwort</label>
        <div class="field">
          ${lock}
          <input id="pw" type=${this.show ? 'text' : 'password'} placeholder="Passwort eingeben" autocomplete="current-password"
            .value=${this.value} @input=${(e: Event) => (this.value = (e.target as HTMLInputElement).value)} />
          <button type="button" class="toggle" aria-label=${this.show ? 'Passwort verbergen' : 'Passwort anzeigen'}
            @click=${() => (this.show = !this.show)}>${eye}</button>
        </div>
        ${this.error ? html`<p class="err" role="alert">${this.error}</p>` : ''}
        ${this.known ? html`<p class="size">${size}</p>` : ''}
        <button class="go" type="submit" ?disabled=${!this.value || this.busy || this.mb === null}>${this.busy ? 'Prüfe…' : 'Entsperren'}</button>
      </form>
      <p class="foot">${shield}<span>Alle Lieder und Stimmen sind verschlüsselt. Das Passwort wird nur auf diesem Gerät gespeichert, du musst es nur einmal eingeben.</span></p>
    </div>`
  }
}

customElements.define('gu-start', GuStart)
