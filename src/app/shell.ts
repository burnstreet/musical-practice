import { LitElement, html } from 'lit'

// Placeholder root element; ticket shell replaces it.
export class GuApp extends LitElement {
  render() {
    return html`<p>Gesangs-Übetool</p>`
  }
}

customElements.define('gu-app', GuApp)
