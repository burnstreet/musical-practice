import { css, html, LitElement } from 'lit'
import { type Calibration, type CalibrationRun, delayFor, runCalibration } from '../core/calibration'
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
  static properties = {
    confirming: { state: true },
    mic: { state: true },
    level: { state: true },
    note: { state: true },
    inputs: { state: true },
    cal: { state: true },
  }
  static styles = [
    sheetStyles,
    css`
    input[type='range'] { width: 100%; min-height: 44px; accent-color: var(--accent); }
    .meter { height: 10px; border-radius: 5px; background: var(--ink); overflow: hidden; margin: 8px 0; }
    .meter div { height: 100%; background: var(--accent); }
    .confirm { margin-top: 16px; padding: 16px; border-radius: 14px; background: var(--ink); }
    .head { display: flex; justify-content: space-between; align-items: center; }
    select { width: 100%; min-height: 44px; font: inherit; }
  `,
  ]

  declare confirming: boolean
  declare mic: 'off' | 'on' | 'failed'
  declare level: number
  declare note: string
  /** Audio inputs; labels appear once the mic was allowed. */
  declare inputs: { deviceId: string; label: string }[]
  /** Latency calibration: idle, running, its result, or why it gave none. */
  declare cal: 'idle' | 'running' | Calibration | 'unclear' | 'no-mic'
  /** Runner; tests swap it. */
  calibrate = runCalibration
  private run: { run: CalibrationRun; restore: () => void } | null = null
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
    this.inputs = []
    this.cal = 'idle'
  }

  connectedCallback() {
    super.connectedCallback()
    void this.loadInputs()
  }

  private async loadInputs() {
    this.inputs = await getContext().pitch.devices()
  }

  private async chooseMic(id: string) {
    getContext().settings.set({ micDeviceId: id })
    await getContext().pitch.setDevice(id)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.stopMic()
    this.cancelCal()
  }

  /** Clicks on the playback context, mic on its clock; on success the offset the pitch engine still needs. */
  private async measure() {
    const { engine, pitch, settings } = getContext()
    this.stopMic()
    if (engine.playing()) engine.pause() // clicks, not the song
    const id = settings.get().micDeviceId
    const clocks = pitch.active() ? pitch.clocks() : null // the practice mic gets its clocks back
    const restore = () => (clocks ? void pitch.start(...clocks, id) : pitch.stop())
    const run = this.calibrate(engine, pitch, id)
    this.run = { run, restore }
    this.cal = 'running'
    this.timer = window.setInterval(() => (this.level = pitch.level()), 50)
    const result = await run.done.finally(() => {
      clearInterval(this.timer)
      this.level = 0
    })
    if (this.run?.run !== run) return // cancelled
    this.run = null
    if (result && result !== 'no-mic') {
      const ms = delayFor(result.ms)
      settings.set({ delayMs: ms })
      pitch.setDelayMs(ms)
    }
    restore()
    this.cal = result ?? 'unclear'
  }

  private cancelCal() {
    if (!this.run) return
    this.run.run.cancel()
    this.run.restore()
    this.run = null
    this.cal = 'idle'
  }

  private async startMic() {
    const { pitch } = getContext()
    this.borrowed = pitch.active()
    if (!this.borrowed && (await pitch.start(() => 0, undefined, getContext().settings.get().micDeviceId)) !== 'ok') {
      this.mic = 'failed'
      return
    }
    this.unsubscribe = pitch.on('frame', (f) => {
      if (f.midi !== null) this.note = noteName(f.midi)
    })
    this.mic = 'on'
    void this.loadInputs() // labels are readable now
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
    this.cancelCal()
    this.dispatchEvent(new Event('close'))
  }

  private async lock() {
    const { vault, route } = getContext()
    await vault.lock()
    this.close()
    route('#/start')
  }

  /** Mic level bar: shows that the phone hears something. */
  private meter() {
    return html`<div class="meter" role="meter" aria-label="Pegel" aria-valuemin="0" aria-valuemax="1" aria-valuenow=${this.level}><div style="width:${Math.min(100, this.level * 300)}%"></div></div>`
  }

  render() {
    const { settings, pitch, engine } = getContext()
    const s = settings.get()
    const ms = (sec: number) => Math.round(sec * 1000)
    const delay = (e: Event) => {
      const ms = +(e.target as HTMLInputElement).value
      settings.set({ delayMs: ms })
      pitch.setDelayMs(ms)
      this.requestUpdate()
    }
    const delayMs = s.delayMs ?? delayFor(ms(engine.latency() + pitch.inputLatency()))
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

        <h3><label for="delay">Verzögerung</label></h3>
        <input id="delay" type="range" min="0" max="1500" step="10" .value=${String(delayMs)} @input=${delay} />
        <p>${delayMs} ms${s.delayMs === null ? ' (automatisch)' : ''}</p>
        <p>Zeit vom Klang im Kopfhörer bis zum Mikrofon, für die Bewertung. Am besten messen lassen.</p>
        <p>Vom Browser gemeldet: Wiedergabe ${ms(engine.latency())} ms · Mikrofon ${ms(pitch.inputLatency())} ms</p>
        <button ?disabled=${this.cal === 'running'} @click=${this.measure}>Verzögerung messen</button>
        <p>Sag „ta“ genau mit jedem Klick – oder halte den Kopfhörer ans Mikrofon.</p>
        ${
          this.cal === 'running'
            ? html`<p role="status">Messung läuft …</p>${this.meter()}<button @click=${this.cancelCal}>Abbrechen</button>`
            : this.cal === 'unclear'
              ? html`<p role="alert">Nicht eindeutig – bitte nochmal.</p>`
              : this.cal === 'no-mic'
                ? html`<p role="alert">Kein Zugriff auf das Mikrofon.</p>`
                : this.cal !== 'idle'
                  ? html`<p role="status">Gemessen: ${this.cal.ms} ms (±${this.cal.spreadMs} ms)</p>`
                  : ''
        }
        <h3><label for="mic">Mikrofon</label></h3>
        <select id="mic" @change=${(e: Event) => this.chooseMic((e.target as HTMLSelectElement).value)}>
          <option value="" ?selected=${!s.micDeviceId}>Automatisch (eingebautes Mikrofon)</option>
          ${this.inputs.map((d, i) => html`<option value=${d.deviceId} ?selected=${s.micDeviceId === d.deviceId}>${d.label || `Mikrofon ${i + 1}`}</option>`)}
        </select>

        <h3>Mikrofon testen</h3>
        ${
          this.mic === 'on'
            ? html`${this.meter()}
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
