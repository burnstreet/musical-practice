import { LitElement, css, html, svg } from 'lit'
import { getContext } from '../context'

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`

export class GuResults extends LitElement {
  static properties = { songId: { type: String } }
  declare songId: string

  static styles = css`
    :host { display: block; min-height: 100vh; box-sizing: border-box; background: var(--bg); color: var(--text); font-family: var(--font-body); padding: 28px 20px 24px; }
    .page { max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    header { display: flex; align-items: center; gap: 12px; }
    h1 { margin: 0; font: 600 19px var(--font-display); }
    .card { background: var(--surface); border-radius: 24px; padding: 16px; }
    .top { display: flex; align-items: center; gap: 20px; padding: 22px 20px; }
    .ring { position: relative; width: 120px; height: 120px; flex: none; }
    .ring .c { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .ring b { font: 600 34px/1 var(--font-display); }
    .k, .ring span { font-size: 12px; color: var(--muted); }
    .v { font-size: 18px; font-weight: 700; }
    .stats { display: flex; flex-direction: column; gap: 10px; }
    h2 { margin: 0 0 10px; font-size: 13px; }
    .labels { display: flex; justify-content: space-around; font-size: 11px; color: var(--muted); }
    .tip { border-radius: 18px; padding: 14px 16px; font-size: 14px; line-height: 1.45; }
    button { font: 700 14px var(--font-body); color: var(--text); background: var(--surface); border: 0; border-radius: 26px; height: 52px; cursor: pointer; }
    .close { width: 44px; height: 44px; border-radius: 22px; flex: none; }
    .primary { height: 56px; border-radius: 28px; background: var(--accent); color: var(--ink); font-size: 16px; }
    svg { display: block; width: 100%; height: auto; }
    @media (min-width: 900px) { .page { max-width: 960px; } :host { padding: 24px 40px 40px; } }
  `

  private chart(phrases: { index: number }[], p: any, tol: number) {
    const W = 318, H = 120, Z = 60
    const by = new Map<number, number | null>(p.phrases.map((x: any) => [x.index, x.meanCents]))
    const range = Math.max(tol * 1.5, ...[...by.values()].map((c) => Math.abs(c ?? 0)))
    const k = 50 / range
    const slot = W / phrases.length
    return html`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Abweichung je Phrase">
      <rect x="0" y=${Z - tol * k} width=${W} height=${2 * tol * k} fill="var(--other)" fill-opacity="0.15" />
      <line x1="0" y1=${Z} x2=${W} y2=${Z} stroke="var(--other)" stroke-width="1.5" />
      ${phrases.map(({ index }, i) => {
        const c = by.get(index)
        if (c == null) return null
        const h = Math.max(Math.abs(c) * k, 2)
        return svg`<rect x=${i * slot + slot * 0.2} y=${c >= 0 ? Z - h : Z} width=${slot * 0.6} height=${h} rx="4" fill=${Math.abs(c) > tol ? '#FFFFFF' : 'var(--accent)'} />`
      })}
    </svg>
    <div class="labels">${phrases.map((_, i) => html`<span>Phrase ${i + 1}</span>`)}</div>`
  }

  private trend(t: number[]) {
    const pts = t.map((v, i) => [10 + (i * 298) / (t.length - 1), 50 - v * 0.4] as const)
    return html`<div class="card trend"><h2>Verlauf</h2>
      <svg viewBox="0 0 318 56" role="img" aria-label="Verlauf">
        <polyline points=${pts.map((q) => q.join(',')).join(' ')} fill="none" stroke="var(--accent)" stroke-width="2" />
        ${pts.map(([x, y]) => svg`<circle cx=${x} cy=${y} r="4" fill="var(--accent)" />`)}
      </svg></div>`
  }

  private drill(p: number) {
    const c = getContext()
    c.engine.setLoop(c.live!.song.song.phrases[p])
    c.engine.setTempo(80)
    c.engine.pause()
    c.engine.seek(c.live!.song.song.phrases[p].start)
    c.route(`#/practice/${this.songId}`)
  }

  private again() {
    const c = getContext()
    c.engine.setLoop(null)
    c.engine.setTempo(100)
    c.engine.pause()
    c.engine.seek(0)
    c.route(`#/practice/${this.songId}`)
  }

  render() {
    const c = getContext()
    const passes = c.live!.session.passes()
    const p = passes.at(-1)
    const tol = c.settings.get().tolerance
    const worst = p?.worstPhrase ?? null
    const close = html`<button class="close" aria-label="Schließen" @click=${() => c.route('#/songs')}>✕</button>`
    if (!p) return html`<div class="page"><header>${close}<h1>Keine Töne gesungen.</h1></header></div>`
    const far = p.meanCents !== null && Math.abs(p.meanCents) > tol
    const tendency = p.tendency === 'ok' ? 'sauber' : `${far ? '' : 'leicht '}zu ${p.tendency === 'high' ? 'hoch' : 'tief'}`
    const range = p.rangeMidi ? `${noteName(p.rangeMidi[0])} – ${noteName(p.rangeMidi[1])}` : '–'
    const stat = (k: string, v: string) => html`<div><div class="k">${k}</div><div class="v">${v}</div></div>`
    return html`<div class="page">
      <header>${close}<div><h1>${c.live!.song.song.id}</h1><div class="k">Durchgang ${passes.length}</div></div></header>
      <div class="card top">
        <div class="ring"><svg viewBox="0 0 120 120" aria-label="${p.hitPct} Prozent Treffsicherheit"><circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" stroke-width="12" /><circle cx="60" cy="60" r="50" fill="none" stroke="var(--accent)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(p.hitPct * 314) / 100} 314" transform="rotate(-90 60 60)" /></svg>
          <div class="c"><b>${`${p.hitPct}%`}</b><span>getroffen</span></div></div>
        <div class="stats">${stat('Ø Abweichung', p.meanCents === null ? '–' : `${Math.round(Math.abs(p.meanCents))} Cent`)}${stat('Tendenz', tendency)}${stat('Tonumfang', range)}</div>
      </div>
      <div class="card"><h2>Abweichung je Phrase</h2>${this.chart(c.live!.song.song.phrases, p, tol)}</div>
      <div class="card tip">${p.tip}</div>
      ${passes.length > 1 ? this.trend(c.live!.session.trend()) : null}
      ${worst === null ? null : html`<button class="primary" @click=${() => this.drill(worst)}>Phrase ${worst + 1} bei 80 % üben</button>`}
      <button @click=${() => this.again()}>Nochmal ganz</button>
    </div>`
  }
}

customElements.define('gu-results', GuResults)

