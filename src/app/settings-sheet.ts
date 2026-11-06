import { css, html, LitElement } from 'lit'
import { type Calibration, type CalibrationRun, delayFor, runCalibration } from '../core/calibration'
import { noteName, type Tolerance } from '../core/scorer'
import { getContext } from './context'
import type { DialogSettings } from './settings'
import { sheetStyles } from './sheet'

export const HEADPHONE_TEXT = 'Bitte mit Kopfhörern üben, sonst hört das Mikrofon die Aufnahme mit.'
export const CALIBRATION_TIP =
  'Tipp: Miss für jeden Kopfhörer einmal die Verzögerung (Einstellungen, „Verzögerung messen“). Dann passen Noten und Bewertung zu dem, was du hörst.'
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
        <p>${CALIBRATION_TIP}</p>

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

const HINTS: [DialogSettings['hint'], string][] = [
  ['show', 'Zeigen'],
  ['start', 'Anfang'],
  ['hide', 'Verstecken'],
]
const RATES = [0.8, 0.9, 1, 1.1, 1.2, 1.3]
/** `n` with one decimal and a German comma: 1.2 → "1,2". */
export const oneDecimalDe = (n: number) => n.toFixed(1).replace('.', ',')

/** Text settings sheet (artboard D5), opened from scene selection and run-through. Saves settings.dialog at once; fires `close`. */
export class GuTextSettings extends LitElement {
  static properties = { mic: { state: true }, level: { state: true } }
  static styles = [
    sheetStyles,
    css`
    .sheet { background: var(--bg); border-radius: 24px 24px 0 0; padding: 12px 20px 24px; display: flex; flex-direction: column; gap: 18px; border-top: 0; }
    .grip { width: 40px; height: 5px; border-radius: 3px; background: var(--line); align-self: center; }
    .head { display: flex; align-items: center; justify-content: space-between; }
    h2 { margin: 0; }
    .done { height: 40px; min-height: 40px; border-radius: 20px; border: 0; background: var(--accent); color: var(--ink); font-size: 14px; font-weight: 700; }
    section { display: flex; flex-direction: column; gap: 8px; }
    .t { font-size: 14px; font-weight: 700; }
    small { font-size: 12px; color: var(--muted); }
    .seg { display: flex; background: var(--surface); border-radius: 14px; padding: 3px; gap: 3px; }
    .seg button { flex: 1; height: 40px; min-height: 40px; border-radius: 11px; border: 0; font-size: 14px; font-weight: 400; }
    .line { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .val { font-size: 14px; font-weight: 700; color: var(--accent); }
    input[type='range'] { width: 100%; min-height: 32px; margin: 0; accent-color: var(--accent); }
    .rates { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
    .rates button { height: 44px; padding: 0; border: 2px solid var(--line); font-size: 13px; font-weight: 400; }
    button[aria-pressed='true'] { font-weight: 700; }
    .box { display: flex; flex-direction: column; background: var(--surface); border-radius: 16px; }
    .box label { justify-content: space-between; gap: 12px; min-height: 52px; padding: 0 14px; font-size: 14px; }
    .box hr { height: 1px; border: 0; background: var(--bg); margin: 0 14px; }
    .phones { display: flex; align-items: center; gap: 12px; background: var(--surface); border-radius: 16px; padding: 12px 14px; font-size: 13px; line-height: 1.45; color: var(--accent); }
    .phones div { flex: 1; color: var(--text); }
    .meter { height: 10px; border-radius: 5px; background: var(--line); overflow: hidden; }
    .meter div { height: 100%; border-radius: 5px; background: var(--accent); }
  `,
  ]

  declare mic: 'off' | 'on' | 'failed'
  declare level: number
  private timer = 0

  constructor() {
    super()
    this.mic = 'off'
    this.level = 0
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.stopMic()
  }

  private set(p: Partial<DialogSettings>) {
    const { settings } = getContext()
    settings.set({ dialog: { ...settings.get().dialog, ...p } })
    this.requestUpdate()
  }

  private async startMic() {
    const { pitch, settings } = getContext()
    if ((await pitch.start(() => performance.now() / 1000, undefined, settings.get().micDeviceId)) !== 'ok') {
      this.mic = 'failed'
      return
    }
    this.mic = 'on'
    this.timer = window.setInterval(() => (this.level = pitch.level()), 100)
  }

  private stopMic() {
    if (this.mic !== 'on') return
    clearInterval(this.timer)
    getContext().pitch.stop()
    this.mic = 'off'
    this.level = 0
  }

  private close() {
    this.stopMic()
    this.dispatchEvent(new Event('close'))
  }

  render() {
    const d = getContext().settings.get().dialog
    return html`<div class="backdrop" @click=${(e: Event) => e.target === e.currentTarget && this.close()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="tt">
        <div class="grip"></div>
        <div class="head"><h2 id="tt">Einstellungen Text</h2><button class="done" @click=${this.close}>Fertig</button></div>

        <section>
          <div class="t">Eigene Zeile</div>
          <div class="seg" role="group" aria-label="Eigene Zeile">
            ${HINTS.map(([h, label]) => html`<button aria-pressed=${d.hint === h} @click=${() => this.set({ hint: h })}>${label}</button>`)}
          </div>
          <small>Anfang: die ersten drei Wörter, der Rest zum Aufdecken.</small>
        </section>

        <section>
          <div class="line"><label for="silence" class="t">Pause bis weiter</label><span class="val">${oneDecimalDe(d.silenceMs / 1000)} s</span></div>
          <input id="silence" type="range" min="500" max="3000" step="100" .value=${String(d.silenceMs)}
            @input=${(e: Event) => this.set({ silenceMs: +(e.target as HTMLInputElement).value })} />
          <div class="line"><small>0,5 s</small><small>So lange still, dann geht es weiter.</small><small>3 s</small></div>
        </section>

        <section>
          <div class="t">Sprechtempo der anderen</div>
          <div class="rates" role="group" aria-label="Sprechtempo">
            ${RATES.map((r) => html`<button aria-pressed=${Math.abs(d.rate - r) < 0.01} @click=${() => this.set({ rate: r })}>${oneDecimalDe(r)}×</button>`)}
          </div>
        </section>

        <div class="box">
          <label>Regieanweisungen anzeigen<input type="checkbox" .checked=${d.showDirections} @change=${(e: Event) => this.set({ showDirections: (e.target as HTMLInputElement).checked })} /></label>
          <hr />
          <label>Szene wiederholen<input type="checkbox" .checked=${d.loopScene} @change=${(e: Event) => this.set({ loopScene: (e.target as HTMLInputElement).checked })} /></label>
        </div>

        <div class="phones">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 14v-2a9 9 0 0118 0v2"/><rect x="3" y="14" width="4" height="7" rx="2"/><rect x="17" y="14" width="4" height="7" rx="2"/></svg>
          <div>Mit Kopfhörern üben. Sonst hört das Mikro die anderen Stimmen und geht zu früh weiter.</div>
        </div>

        <section>
          ${
            this.mic === 'on'
              ? html`<div class="line"><span class="t">Mikro testen</span><small>sprich etwas</small></div>
                <div class="meter" role="meter" aria-label="Mikrofonpegel" aria-valuemin="0" aria-valuemax="1" aria-valuenow=${this.level}><div style="width:${Math.min(100, this.level * 300)}%"></div></div>`
              : html`<button @click=${this.startMic}>Mikro testen</button>
                ${this.mic === 'failed' ? html`<p role="alert">Kein Zugriff auf das Mikrofon.</p>` : ''}`
          }
        </section>
      </div>
    </div>`
  }
}

customElements.define('gu-text-settings', GuTextSettings)
