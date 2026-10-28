import { html, LitElement } from 'lit'
import { CALIBRATION_TIP, HEADPHONE_TEXT } from './settings-sheet'
import { sheetStyles } from './sheet'

/** Before-play sheet. Fires `done` with detail `{ dontShow }`. */
export class GuHeadphoneSheet extends LitElement {
  static styles = sheetStyles

  private done() {
    const dontShow = this.renderRoot.querySelector<HTMLInputElement>('input')!.checked
    this.dispatchEvent(new CustomEvent('done', { detail: { dontShow } }))
  }

  render() {
    return html`<div class="backdrop">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="t">
        <h2 id="t">Kopfhörer aufsetzen</h2>
        <p>${HEADPHONE_TEXT}</p>
        <p>${CALIBRATION_TIP}</p>
        <label><input type="checkbox" />Nicht mehr anzeigen</label>
        <div style="height:16px"></div>
        <button class="primary" @click=${this.done}>Weiter</button>
      </div>
    </div>`
  }
}

customElements.define('gu-headphone-sheet', GuHeadphoneSheet)
