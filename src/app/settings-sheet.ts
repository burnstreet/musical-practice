import { css, html, LitElement } from 'lit'
import { noteName, type Tolerance } from '../core/scorer'
import { getContext } from './context'
import { sheetStyles } from './sheet'

export const HEADPHONE_TEXT = 'Bitte mit Kopfhörern üben, sonst hört das Mikrofon die Aufnahme mit.'
const TOLERANCES: [Tolerance, string][] = [
  [75, 'Leicht (75 Cent)'],
  [50, 'Normal (50 Cent)'],
  [30, 'Streng (30 Cent)'],
]

/** Settings sheet. Shell renders it while open; it fires `close` when done. */
export class GuSettingsSheet extends LitElement {
  static properties = { confirming: { state: true }, mic: { state: true }, level: { state: true }, note: { state: true } }
  static styles = [
    sheetStyles,
    css`
    input[type='range'] { width: 100%; min-height: 44px; accent-color: var(--accent); }
    .meter { height: 10px; border-radius: 5px; background: var(--ink); overflow: hidden; margin: 8px 0; }
    .meter div { height: 100%; background: var(--accent); }
    .confirm { margin-top: 16px; padding: 16px; border-radius: 14px; background: var(--ink); }
    .head { display: flex; justify-content: space-between; align-items: center; }
  `,
  ]

  declare confirming: boolean
  declare mic: 'off' | 'on' | 'failed'
  declare level: number
  declare note: string
  private timer = 0
  private unsubscribe = () => {}
  /** The practice screen's mic was already running: only listen, leave it on at the end. */
  private borrowed = false

  constructor() {
    super()
    this.confirming = false
    this.mic = 'off'
    this.level = 0
    this.note = ''
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.stopMic()
  }

  private async startMic() {
    const { pitch } = getContext()
    this.borrowed = pitch.active()
    if (!this.borrowed && (await pitch.start(() => 0)) !== 'ok') {
      this.mic = 'failed'
      return
    }
    this.unsubscribe = pitch.on('frame', (f) => {
      if (f.midi !== null) this.note = noteName(f.midi)
    })
    this.mic = 'on'
    this.timer = window.setInterval(() => (this.level = pitch.level()), 100)
  }

  private stopMic() {
    if (this.mic !== 'on') return
    clearInterval(this.timer)
    this.unsubscribe()
    if (!this.borrowed) getContext().pitch.stop()
    this.mic = 'off'
    this.note = ''
    this.level = 0
  }

  private close() {
    this.stopMic()
    this.dispatchEvent(new Event('close'))
  }

  private async lock() {
    const { vault, route } = getContext()
    await vault.lock()
    this.close()
    route('#/start')
  }

  render() {
    const { settings, pitch } = getContext()
    const s = settings.get()
    const offset = (e: Event) => {
      const ms = +(e.target as HTMLInputElement).value
      settings.set({ micOffsetMs: ms })
      pitch.setOffsetMs(ms)
      this.requestUpdate()
    }
    return html`<div class="backdrop" @click=${(e: Event) => e.target === e.currentTarget && this.close()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="t">
        <div class="head"><h2 id="t">Einstellungen</h2><button aria-label="Schließen" @click=${this.close}>✕</button></div>

        <h3>Toleranz</h3>
        <div class="row" role="group" aria-label="Toleranz">
          ${TOLERANCES.map(
            ([t, label]) =>
              html`<button aria-pressed=${s.tolerance === t} @click=${() => {
                settings.set({ tolerance: t })
                this.requestUpdate()
              }}>${label}</button>`,
          )}
        </div>

        <h3><label for="offset">Verzögerung Mikrofon</label></h3>
        <input id="offset" type="range" min="-300" max="300" step="10" .value=${String(s.micOffsetMs)} @input=${offset} />
        <p>${s.micOffsetMs} ms</p>
        <p>Wenn dein Ton zu früh oder zu spät angezeigt wird.</p>

        <h3>Mikrofon testen</h3>
        ${
          this.mic === 'on'
            ? html`<div class="meter" role="meter" aria-label="Pegel" aria-valuemin="0" aria-valuemax="1" aria-valuenow=${this.level}><div style="width:${Math.min(100, this.level * 300)}%"></div></div>
              <p aria-live="polite">${this.note || '–'}</p>
              <button @click=${this.stopMic}>Test beenden</button>`
            : html`<button @click=${this.startMic}>Mikrofon testen</button>
              ${this.mic === 'failed' ? html`<p role="alert">Kein Zugriff auf das Mikrofon.</p>` : ''}`
        }

        <h3>Kopfhörer</h3>
        <p>${HEADPHONE_TEXT}</p>

        <div style="height:24px"></div>
        ${
          this.confirming
            ? html`<div class="confirm" role="alertdialog" aria-describedby="c">
              <p id="c">Alle Lieder und Ergebnisse werden von diesem Gerät gelöscht. Fortfahren?</p>
              <div class="row"><button class="danger" @click=${this.lock}>Löschen</button><button @click=${() => (this.confirming = false)}>Abbrechen</button></div>
            </div>`
            : html`<button class="danger" @click=${() => (this.confirming = true)}>Sperren und Daten löschen</button>`
        }
      </div>
    </div>`
  }
}

customElements.define('gu-settings-sheet', GuSettingsSheet)
