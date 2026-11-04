import { css, html, LitElement, svg } from 'lit'
import type { RoleId } from '../../core/content'
import { production } from '../../production'
import { getContext } from '../context'
import { icon, shapes } from '../icons'

const SLIDERS = icon(shapes.sliders, 20)
const CHECK = icon(svg`<path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`, 16)
const chevron = (open: boolean) =>
  icon(
    svg`<path d=${open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    18,
  )

/** Top of the songs and text screens (artboard D1): kicker and settings. Parents add `topStyles`. */
export const topHeader = (onSettings: () => void) =>
  html`<header class="top">
    <div class="kicker">${production.kicker}</div>
    <button class="gear" aria-label="Einstellungen" @click=${onSettings}>${SLIDERS}</button>
  </header>`

export const topStyles = css`
  .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .kicker { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); }
  .gear { width: 44px; height: 44px; border-radius: 22px; border: 0; background: var(--surface); color: var(--text); display: flex; align-items: center; justify-content: center; flex: none; cursor: pointer; }
`

/** Shared role selection for songs and text (artboard D1). Fires `change` after saving settings.roles. */
export class GuRoles extends LitElement {
  static styles = css`
    :host { display: block; }
    .bar { background: var(--surface); border-radius: 16px; display: flex; flex-direction: column; }
    button { font: inherit; color: inherit; cursor: pointer; }
    .toggle { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 0 14px; border: 0; background: transparent; color: var(--text); text-align: left; width: 100%; }
    .toggle[disabled] { cursor: default; }
    .txt { flex: 1; min-width: 0; }
    .label { display: block; font-size: 12px; color: var(--muted); }
    .picked { display: block; font-size: 16px; font-weight: 700; margin-top: 2px; }
    .act { font-size: 13px; font-weight: 700; color: var(--accent); display: flex; align-items: center; gap: 12px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 14px 14px; }
    .chip { height: 44px; padding: 0 14px; border-radius: 22px; border: 2px solid var(--other); background: transparent; color: var(--text); font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; }
    .chip[aria-pressed='true'] { background: var(--accent); border-color: var(--accent); color: var(--ink); font-weight: 700; padding-left: 10px; }
  `
  static properties = { selected: { state: true }, open: { state: true } }

  declare selected: RoleId[]
  declare open: boolean

  constructor() {
    super()
    this.selected = getContext().settings.get().roles
    this.open = false
  }

  connectedCallback() {
    super.connectedCallback()
    // roles arrive with the library file, after the first unlock
    getContext().library.onProgress(() => this.isConnected && this.requestUpdate())
  }

  private toggle(id: RoleId) {
    this.selected = this.selected.includes(id) ? this.selected.filter((r) => r !== id) : [...this.selected, id]
    getContext().settings.set({ roles: this.selected })
    this.dispatchEvent(new CustomEvent<RoleId[]>('change', { detail: this.selected }))
  }

  render() {
    const roles = getContext()
      .library.roles()
      .filter((r) => r.sings || r.speaks)
    const none = this.selected.length === 0
    const open = this.open || none
    const picked = roles.filter((r) => this.selected.includes(r.id)).map((r) => r.name)
    return html`<div class="bar">
      <button class="toggle" aria-expanded=${open} ?disabled=${none} @click=${() => {
        this.open = !open
      }}>
        <span class="txt"><span class="label">Deine Rollen · für Lieder und Text</span><span class="picked">${none ? 'Wähle mindestens eine Rolle' : picked.join(', ')}</span></span>
        ${none ? '' : html`<span class="act">${open ? 'fertig' : 'ändern'}${chevron(open)}</span>`}
      </button>
      ${
        open
          ? html`<div class="chips">${roles.map((r) => {
              const on = this.selected.includes(r.id)
              return html`<button class="chip" aria-pressed=${on} @click=${() => this.toggle(r.id)}>${on ? CHECK : ''}${r.name}</button>`
            })}</div>`
          : ''
      }
    </div>`
  }
}

/** `Lieder | Text` switch below the role bar. Hidden while the library has no script. */
export class GuModeTabs extends LitElement {
  static styles = css`
    :host { display: block; }
    [role='tablist'] { display: flex; background: var(--surface); border-radius: 22px; padding: 4px; gap: 4px; }
    button { flex: 1; height: 40px; border-radius: 18px; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 15px; font-weight: 500; cursor: pointer; }
    button[aria-selected='true'] { background: var(--accent); color: var(--ink); font-weight: 700; }
  `
  static properties = { active: {} }
  declare active: 'songs' | 'text'

  constructor() {
    super()
    this.active = 'songs'
  }

  connectedCallback() {
    super.connectedCallback()
    getContext().library.onProgress(() => this.isConnected && this.requestUpdate())
  }

  private pick(tab: 'songs' | 'text') {
    const { settings, route } = getContext()
    settings.set({ tab })
    if (tab !== this.active) route(tab === 'songs' ? '#/songs' : '#/text')
  }

  render() {
    if (!getContext().library.hasScript()) return ''
    const tab = (id: 'songs' | 'text', label: string) =>
      html`<button role="tab" aria-selected=${this.active === id} @click=${() => this.pick(id)}>${label}</button>`
    return html`<div role="tablist" aria-label="Was üben">${tab('songs', 'Lieder')}${tab('text', 'Text')}</div>`
  }
}

customElements.define('gu-roles', GuRoles)
customElements.define('gu-mode-tabs', GuModeTabs)
