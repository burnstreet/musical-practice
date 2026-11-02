import { css, html, LitElement, svg } from 'lit'
import type { RoleId } from '../../core/content'
import type { Scene, Script } from '../../core/types'
import { getContext } from '../context'
import { unlockAudio } from '../dialog'
import { roleSetKey } from '../settings'
import '../settings-sheet'
import { topHeader, topStyles } from './roles'

/** Scene number: from an id `s{n}`, else the place in the script. */
export const sceneNo = (scene: Scene, index: number) => Number(scene.id.match(/^s(\d+)$/)?.[1] ?? index + 1)
/** Lines of the given roles in a scene. */
export const lineCount = (scene: Scene, roles: RoleId[]) => scene.items.filter((i) => i.type === 'line' && roles.includes(i.role)).length

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const DAY = 86_400_000
/** `heute`, `gestern`, `vor {n} Tagen`. */
const when = (at: number, now = Date.now()) => {
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / DAY)
  return days <= 0 ? 'heute' : days === 1 ? 'gestern' : `vor ${days} Tagen`
}

/** Scene selection `#/text` (artboard D1). */
export class GuText extends LitElement {
  static styles = [
    topStyles,
    css`
    :host { display: block; min-height: 100vh; background: var(--bg); color: var(--text); font-family: var(--font-body); }
    main { max-width: 720px; margin: 0 auto; padding: 24px 20px 32px; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; }
    button { font: inherit; color: inherit; cursor: pointer; border: 0; text-align: left; }
    .resume { display: flex; align-items: center; gap: 14px; background: var(--accent); color: var(--ink); border-radius: 16px; padding: 10px 14px; min-height: 60px; box-sizing: border-box; width: 100%; }
    .resume .play { width: 40px; height: 40px; border-radius: 20px; background: var(--ink); color: var(--accent); display: flex; align-items: center; justify-content: center; flex: none; }
    .txt { flex: 1; min-width: 0; }
    .title { display: block; font-size: 15px; font-weight: 700; }
    .meta { display: block; font-size: 12px; margin-top: 2px; }
    .listhead { display: flex; align-items: baseline; justify-content: space-between; margin-top: 4px; }
    h2 { margin: 0; font-family: var(--font-display); font-size: 22px; font-weight: 600; }
    .legend { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
    .dot { width: 8px; height: 8px; border-radius: 4px; background: var(--accent); display: inline-block; }
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .row { display: flex; align-items: center; gap: 14px; width: 100%; background: var(--surface); border-radius: 16px; padding: 10px 14px; min-height: 60px; box-sizing: border-box; }
    .row .meta { color: var(--muted); }
    .row:disabled { opacity: 0.6; cursor: default; }
    .num { width: 36px; height: 36px; border-radius: 18px; background: var(--bg); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex: none; }
    .mine { font-size: 13px; font-weight: 700; color: var(--accent); flex: none; }
  `,
  ]
  static properties = { script: { state: true }, settingsOpen: { state: true } }

  declare script: Script | null
  declare settingsOpen: boolean
  private loading = false

  constructor() {
    super()
    this.script = null
    this.settingsOpen = false
  }

  connectedCallback() {
    super.connectedCallback()
    const { library } = getContext()
    library.onProgress(() => {
      if (this.isConnected) void this.load()
    })
    void this.load()
  }

  private async load() {
    const { library } = getContext()
    if (this.script || this.loading || !library.scriptReady()) return
    this.loading = true
    try {
      this.script = (await library.getScript()).script
    } finally {
      this.loading = false
    }
  }

  private go(sceneId: string, itemId?: string) {
    unlockAudio()
    getContext().route(itemId ? `#/text/${sceneId}/${itemId}` : `#/text/${sceneId}`)
  }

  render() {
    const { settings, library } = getContext()
    const s = settings.get()
    const script = this.script
    const pos = s.dialogPositions[roleSetKey(s.roles)]
    const resumeAt = script && pos ? script.scenes.findIndex((x) => x.id === pos.sceneId) : -1
    return html`<main>
      ${topHeader(() => (this.settingsOpen = true))}
      <gu-roles @change=${() => this.requestUpdate()}></gu-roles>
      <gu-mode-tabs active="text"></gu-mode-tabs>
      ${
        script && pos && resumeAt >= 0
          ? html`<button class="resume" @click=${() => this.go(pos.sceneId, pos.itemId)}>
            <span class="play">${html`<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">${svg`<path d="M7 4l13 8-13 8z" fill="currentColor"/>`}</svg>`}</span>
            <span class="txt"><span class="title">Weiter bei Szene ${sceneNo(script.scenes[resumeAt], resumeAt)}</span><span class="meta">Zuletzt geübt: ${when(pos.at)}</span></span>
          </button>`
          : ''
      }
      <div class="listhead"><h2>Szene wählen</h2><span class="legend"><span class="dot"></span>deine Zeilen</span></div>
      <ul>
        ${
          script
            ? script.scenes.map((x, i) => {
                const roles = new Set(x.items.flatMap((it) => (it.type === 'line' ? [it.role] : []))).size
                const songs = x.items.filter((it) => it.type === 'song').length
                const mine = lineCount(x, s.roles)
                return html`<li><button class="row" data-scene=${x.id} @click=${() => this.go(x.id)}>
                  <span class="num">${sceneNo(x, i)}</span>
                  <span class="txt"><span class="title">${x.title}</span><span class="meta">${plural(roles, 'Rolle', 'Rollen')}${songs ? ` · ${plural(songs, 'Lied', 'Lieder')}` : ''}</span></span>
                  ${mine ? html`<span class="mine">${plural(mine, 'Zeile', 'Zeilen')}</span>` : ''}
                </button></li>`
              })
            : library.hasScript()
              ? html`<li><button class="row" disabled><span class="txt"><span class="meta">Text wird geladen</span></span></button></li>`
              : ''
        }
      </ul>
      ${this.settingsOpen ? html`<gu-text-settings @close=${() => (this.settingsOpen = false)}></gu-text-settings>` : ''}
    </main>`
  }
}

customElements.define('gu-text', GuText)
