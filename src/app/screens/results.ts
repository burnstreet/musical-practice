import { css, html, LitElement, svg } from 'lit'
import { joinSyllables, type Section } from '../../core/content'
import { type DayBar, type DaySummary, dayBars, localDay } from '../../core/history'
import type { Entry, NoteResult, PassResult, PhraseResult } from '../../core/scorer'
import { getContext } from '../context'
import { leadInRange, rangeOfPhrase } from '../repeat'

type View = 'all' | 'sections' | 'phrases' | 'entries' | 'days'
type Span = 'week' | 'month' | 'all'

/** Tendency words for a mean deviation: no cent numbers, singers do not know cents. */
export function tendencyLabel(c: number | null, tol: number): string {
  if (c === null) return '–'
  if (Math.abs(c) <= 15) return 'sauber'
  return `${c > 0 ? '↑' : '↓'} ${Math.abs(c) <= tol ? 'etwas ' : ''}zu ${c > 0 ? 'hoch' : 'tief'}`
}
const tone = (c: number | null) => (c === null || Math.abs(c) <= 15 ? 'ok' : c > 0 ? 'high' : 'low')
const tones = (n: number) => (n === 1 ? '1 Ton' : `${n} Töne`)

/** Chips for one entry: [css class, text]. */
function chips(e: Entry): [string, string][] {
  if (e.ms === null) return [['miss', 'nicht gesungen']]
  const out: [string, string][] = []
  if (e.approach === 'below') out.push(['low', '↑ von unten reingerutscht'])
  if (e.approach === 'above') out.push(['high', '↓ von oben reingekommen'])
  if (e.timing === 'early') out.push(['time', `← ${-e.ms} ms zu früh`])
  if (e.timing === 'late') out.push(['time', `→ ${e.ms} ms zu spät`])
  return out.length ? out : [['ok', '✓ Einsatz sauber']]
}
/** Short mark for an entry in a section row. */
const glyph = (e: Entry) =>
  e.ms === null
    ? '–'
    : `${e.approach === 'below' ? '↑' : e.approach === 'above' ? '↓' : ''}${e.timing === 'early' ? '←' : e.timing === 'late' ? '→' : ''}` || '✓'

const BACK = html`<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>`
const PLAY = html`<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>`
const ROWS = [
  ['above', '↓ von oben'],
  ['ok', 'direkt'],
  ['below', '↑ von unten'],
] as const
const COLS = [
  ['early', '← zu früh'],
  ['ok', 'pünktlich'],
  ['late', 'zu spät →'],
] as const
const SPANS = [
  ['week', '7 Tage'],
  ['month', '4 Wochen'],
  ['all', 'Alles'],
] as const
const SINCE = { week: 'diese Woche', month: 'in 4 Wochen', all: 'seit Beginn' }
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const DAY_MS = 86_400_000
const utc = (day: string) => Date.parse(`${day}T00:00:00Z`)
const dm = (day: string) => `${+day.slice(8)}.${+day.slice(5, 7)}.`
/** ISO week number of the week starting Monday `day`: the week of its Thursday. */
const kw = (day: string) => {
  const thu = utc(day) + 3 * DAY_MS
  return 1 + Math.floor((thu - Date.UTC(new Date(thu).getUTCFullYear(), 0, 1)) / (7 * DAY_MS))
}
/** "+20 Punkte diese Woche" from the first to the last value; '' with fewer than two. */
const delta = (xs: number[], span: Span) => (xs.length < 2 ? '' : `${xs.at(-1)! >= xs[0] ? '+' : '−'}${Math.abs(xs.at(-1)! - xs[0])} Punkte ${SINCE[span]}`)

export class GuResults extends LitElement {
  static properties = { songId: { type: String }, view: { state: true }, all: { state: true }, span: { state: true }, days: { state: true } }
  declare songId: string
  declare view: View
  /** Entries view: all entries, not only the off ones. */
  declare all: boolean
  declare span: Span
  /** Verlauf view: stored days, null while loading. */
  declare days: DaySummary[] | null

  constructor() {
    super()
    this.view = 'all'
    this.all = false
    this.span = 'week'
    this.days = null
  }

  static styles = css`
    :host { display: block; min-height: 100vh; box-sizing: border-box; background: var(--bg); color: var(--text); font-family: var(--font-body); padding: 28px 20px 24px; }
    .page { max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
    header { display: flex; align-items: center; gap: 12px; }
    h1 { margin: 0; font: 600 19px var(--font-display); }
    .k, small { font-size: 12px; color: var(--muted); }
    .card { background: var(--surface); border-radius: 24px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    h2 { margin: 0; font-size: 14px; display: flex; justify-content: space-between; align-items: baseline; }
    h2 small { font-weight: 400; }
    button { font: inherit; font-weight: 700; color: var(--text); background: var(--surface); border: 0; border-radius: 26px; height: 52px; cursor: pointer; }
    .round { width: 44px; height: 44px; border-radius: 22px; flex: none; display: flex; align-items: center; justify-content: center; padding: 0; }
    .primary { height: 56px; border-radius: 28px; background: var(--accent); color: var(--ink); font-size: 16px; }
    .tabs { display: flex; gap: 4px; background: var(--surface); border-radius: 24px; padding: 4px; }
    .tabs button { flex: 1; height: 44px; border-radius: 22px; background: transparent; font-size: 14px; }
    .tabs button[aria-selected='true'] { background: var(--accent); color: var(--ink); }
    .high { color: var(--high); }
    .low { color: var(--low); }
    .ok { color: var(--accent); }
    .top { flex-direction: row; align-items: center; gap: 20px; padding: 20px; }
    .ring { position: relative; width: 112px; height: 112px; flex: none; }
    .ring .c { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .ring b { font: 600 32px/1 var(--font-display); }
    .ring span { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .stats { display: flex; flex-direction: column; gap: 10px; }
    .v { font-size: 17px; font-weight: 700; }
    .hist { position: relative; height: 72px; }
    .hist .band { position: absolute; top: 0; bottom: 0; background: var(--other); opacity: 0.12; border-radius: 6px; }
    .hist .zero { position: absolute; top: 0; bottom: 0; left: 50%; width: 1.5px; background: var(--other); }
    .hist .bins { position: absolute; inset: 0; display: flex; align-items: flex-end; gap: 4px; }
    .hist .bins i { flex: 1; border-radius: 4px 4px 0 0; background: var(--accent); min-height: 2px; }
    .hist .bins i.high { background: var(--high); }
    .hist .bins i.low { background: var(--low); }
    .axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-top: -6px; }
    .split { display: flex; height: 12px; border-radius: 6px; overflow: hidden; gap: 2px; }
    .split i { background: var(--accent); }
    .split i.high { background: var(--high); }
    .split i.low { background: var(--low); }
    .legend { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; font-size: 12px; }
    .legend b { display: block; }
    .legend div:nth-child(2) { text-align: center; }
    .legend div:nth-child(3) { text-align: right; }
    .grid { display: grid; grid-template-columns: 86px repeat(3, minmax(0, 1fr)); gap: 6px; font-size: 12px; align-items: center; }
    .grid .h { text-align: center; color: var(--muted); }
    .grid .r { font-weight: 700; }
    .cell { height: 40px; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; line-height: 1.1;
      background: rgba(255, 255, 255, 0.14); }
    .cell.above { background: rgba(255, 179, 92, 0.24); }
    .cell.below { background: rgba(143, 227, 255, 0.24); }
    .cell.zero { background: none; border: 1.5px solid var(--line); color: var(--muted); font-weight: 400; }
    .cell.clean { background: var(--accent); color: var(--ink); }
    .cell.clean span { font-size: 10px; }
    .link { align-self: flex-start; height: 44px; padding: 0; background: none; color: var(--accent); font-size: 14px; }
    .tip { border-radius: 18px; padding: 14px 16px; font-size: 14px; line-height: 1.45; }
    .two { display: flex; gap: 10px; }
    .two button { flex: 1; }
    .hint { font-size: 11px; color: var(--muted); line-height: 1.5; }
    .group { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 4px 0; }
    .row { border-radius: 20px; padding: 12px 12px 12px 16px; gap: 9px; }
    .rhead { display: flex; align-items: center; gap: 12px; }
    .rhead .name { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .rhead small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rhead big { font: 600 20px/1 var(--font-display); }
    .rhead .round { background: var(--bg); color: var(--accent); }
    .dev { display: flex; align-items: center; gap: 10px; font-size: 12px; font-weight: 700; }
    .dev span { width: 140px; text-align: right; }
    .track { position: relative; flex: 1; height: 8px; border-radius: 4px; background: var(--ink); }
    .track i { position: absolute; }
    .track .band { top: -3px; bottom: -3px; box-sizing: border-box; border-left: 1.5px dashed var(--line); border-right: 1.5px dashed var(--line); }
    .track .fill { top: 0; bottom: 0; border-radius: 4px; background: var(--accent); }
    .track .fill.high { background: var(--high); }
    .track .fill.low { background: var(--low); }
    .track .zero { left: 50%; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: var(--muted); }
    .marks { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .chip { font-size: 12px; font-weight: 700; line-height: 1; padding: 5px 9px; border-radius: 12px; border: 1.5px solid currentColor; white-space: nowrap; }
    .chip.time, .chip.miss, .dot.time { color: var(--text); }
    .chip.miss { color: var(--muted); }
    .dot { min-width: 26px; height: 26px; box-sizing: border-box; padding: 0 5px; border-radius: 13px; display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700; border: 1.5px solid currentColor; }
    .dot.ok { background: var(--accent); color: var(--ink); border-color: var(--accent); }
    .dot.miss { color: var(--muted); }
    .pic { display: block; width: 100%; height: auto; background: var(--ink); border-radius: 12px; }
    .where { font-size: 12px; color: var(--muted); }
    .now { text-align: right; }
    .now big { display: block; font: 600 30px/1 var(--font-display); }
    .now small { font-weight: 700; color: var(--accent); }
    .bars { position: relative; display: flex; align-items: flex-end; gap: var(--gap); height: 100px; border-top: 1px dashed var(--line); }
    .bars::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; border-top: 1px dashed var(--line); }
    .bars.clean { height: 72px; }
    .bars i { flex: 1; position: relative; min-height: 2px; border-radius: 6px 6px 0 0; background: var(--accent); }
    .bars.clean i { background: var(--text); }
    .bars i span { position: absolute; top: -17px; left: -4px; right: -4px; text-align: center; font-size: 11px; font-style: normal; font-weight: 700; }
    .bars i.empty, .tend i.empty { height: 6px; box-sizing: border-box; border: 1.5px dashed var(--line); border-radius: 3px; background: none; }
    .labels { display: flex; gap: var(--gap); font-size: 11px; color: var(--muted); margin-top: -4px; }
    .labels span { flex: 1; min-width: 0; text-align: center; white-space: nowrap; overflow: visible; }
    .tend { position: relative; height: 84px; }
    .tend .band { position: absolute; left: 0; right: 0; top: calc(50% - var(--band)); height: calc(2 * var(--band)); background: var(--other); opacity: 0.12; border-radius: 6px; }
    .tend .mid { position: absolute; left: 0; right: 0; top: 50%; height: 1.5px; background: var(--other); }
    .tend .cols { position: absolute; inset: 0; display: flex; gap: var(--gap); }
    .tend .cols div { flex: 1; position: relative; }
    .tend .cols i { position: absolute; left: 0; right: 0; border-radius: 3px; background: var(--accent); }
    .tend .cols i.high { background: var(--high); }
    .tend .cols i.low { background: var(--low); }
    .tend .cols i.empty { top: calc(50% - 3px); background: none; }
    .spark { display: flex; align-items: center; gap: 12px; min-height: 48px; font-size: 13px; }
    .spark b:first-child { width: 78px; font-size: 14px; }
    .spark svg { flex: 1; max-width: 140px; }
    .spark .ft { flex: 1; text-align: right; }
    @media (min-width: 900px) { .page { max-width: 640px; } :host { padding: 24px 40px 40px; } }
  `

  private get c() {
    return getContext()
  }

  private drillPhrase(p: number) {
    const c = this.c
    const phrase = c.live!.song.song.phrases[p]
    c.engine.setLoop(rangeOfPhrase(phrase))
    c.engine.setTempo(80)
    c.engine.pause()
    c.engine.seek(phrase.start)
    c.route(`#/practice/${this.songId}`)
  }

  private drillSection(section: Section) {
    const c = this.c
    c.live!.repeat = { kind: 'section', section, pointA: null } // the practice screen reads the kind from here
    c.engine.setLoop(leadInRange(section))
    c.engine.setTempo(80)
    c.engine.pause()
    c.engine.seekLeadIn(section.start)
    c.route(`#/practice/${this.songId}`)
  }

  private again() {
    const c = this.c
    c.engine.setLoop(null)
    c.engine.setTempo(100)
    c.engine.pause()
    c.engine.seek(0)
    c.route(`#/practice/${this.songId}`)
  }

  private openDays() {
    const c = this.c
    this.view = 'days'
    this.days = null
    c.history.days(this.songId, c.settings.get().roles).then((d) => {
      this.days = d
    }, console.error)
  }

  /** Verlauf: day (or week) bars for hits, tendency, clean entries, sections. */
  private daysView(tol: number) {
    if (!this.days) return ''
    if (!this.days.length) return html`<p class="k">Noch keine Tage gespeichert.</p>`
    const span = this.span
    const bars = dayBars(this.days, span, localDay())
    const style = `--gap:${bars.length > 10 ? 3 : 8}px`
    const values = (k: 'hitPct' | 'cleanPct' | 'cents') => bars.flatMap((b) => (b[k] === null ? [] : [b[k]!]))
    const label = (b: DayBar, i: number) =>
      span === 'week' ? WEEKDAYS[new Date(utc(b.day)).getUTCDay()] : span === 'month' ? (i % 7 ? '' : dm(b.day)) : i % 4 ? '' : `KW ${kw(b.day)}`
    const labels = html`<div class="labels" style=${style}>${bars.map((b, i) => html`<span>${label(b, i)}</span>`)}</div>`
    const column = (cls: string, k: 'hitPct' | 'cleanPct') =>
      html`<div class="bars ${cls}" style=${style}>${bars.map((b) =>
        b[k] === null
          ? html`<i class="empty"></i>`
          : html`<i style="height:${b[k]}%">${cls === 'hits' && bars.length <= 10 ? html`<span>${b[k]}</span>` : ''}</i>`,
      )}</div>${labels}`
    const hits = values('hitPct')
    const clean = values('cleanPct')
    const cents = values('cents')
    const k = hits.length
    const practiced = span === 'all' ? `seit ${dm(this.days.at(-1)!.day)}, in ${k} von ${bars.length} Wochen geübt` : `an ${k} von ${bars.length} Tagen geübt`
    const scale = (c: number) => (Math.min(Math.abs(c), 75) / 75) * 50
    const song = this.c.live!.song.song
    const names = [...new Set(song.sections.map((s) => s.name))].filter((n) => bars.some((b) => n in b.sections))
    const spark = (name: string) => {
      const pts = bars.flatMap((b, i) =>
        name in b.sections ? [[bars.length > 1 ? (i / (bars.length - 1)) * 114 + 3 : 60, 30 - b.sections[name] * 0.28] as const] : [],
      )
      const ys = bars.flatMap((b) => (name in b.sections ? [b.sections[name]] : []))
      const [x, y] = pts.at(-1)!
      return html`<div class="spark"><b>${name}</b>
        <svg viewBox="0 0 120 32" width="120" height="32" aria-hidden="true"><polyline points=${pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" /><circle cx=${x} cy=${y} r="3.5" fill="var(--accent)" /></svg>
        <span class="ft"><span class="k">${ys[0]} % → </span><b>${ys.at(-1)} %</b></span></div>`
    }
    return html`
      <div class="tabs" role="tablist" aria-label="Zeitraum">${SPANS.map(
        ([v, l]) =>
          html`<button role="tab" aria-selected=${this.span === v} @click=${() => {
            this.span = v
          }}>${l}</button>`,
      )}</div>
      <div class="card">
        <h2><span>Töne getroffen<br /><small>${practiced}</small></span>
          <span class="now">${k ? html`<big>${`${hits.at(-1)} %`}</big><small>${delta(hits, span)}</small>` : ''}</span></h2>
        ${column('hits', 'hitPct')}
      </div>
      <div class="card">
        <h2><span>Tendenz<br /><small>oben zu hoch, unten zu tief</small></span>
          ${cents.length ? html`<span class=${tone(cents.at(-1)!)}>zuletzt ${tendencyLabel(cents.at(-1)!, tol)}</span>` : ''}</h2>
        <div class="tend" style="${style};--band:${scale(tol)}%"><i class="band"></i><i class="mid"></i>
          <div class="cols">${bars.map(
            (b) =>
              html`<div>${
                b.cents === null
                  ? html`<i class="empty"></i>`
                  : html`<i class=${tone(b.cents)} style="${b.cents >= 0 ? 'bottom' : 'top'}:50%;height:${Math.max(scale(b.cents), 4)}%"></i>`
              }</div>`,
          )}</div></div>
        ${labels}
        <small>Helles Band = sauber genug</small>
      </div>
      ${
        clean.length
          ? html`<div class="card">
              <h2><span>Einsätze sauber<br /><small>pünktlich und direkt auf dem Ton</small></span>
                <span class="now"><big>${`${clean.at(-1)} %`}</big><small>${delta(clean, span)}</small></span></h2>
              ${column('clean', 'cleanPct')}
            </div>`
          : ''
      }
      ${names.length ? html`<div class="card"><h2>Abschnitte · Töne getroffen</h2>${names.map(spark)}</div>` : ''}
      <p class="hint">Jeder Balken ist der Schnitt eines Tages${span === 'all' ? ', bei „Alles“ einer Woche' : ''}. Tage ohne Üben bleiben leer.</p>`
  }

  private trend(t: number[]) {
    const pts = t.map((v, i) => [10 + (i * 298) / (t.length - 1), 50 - v * 0.4] as const)
    return html`<div class="card trend"><h2>Durchgänge</h2>
      <svg viewBox="0 0 318 56" role="img" aria-label="Durchgänge">
        <polyline points=${pts.map((q) => q.join(',')).join(' ')} fill="none" stroke="var(--accent)" stroke-width="2" />
        ${pts.map(([x, y]) => svg`<circle cx=${x} cy=${y} r="4" fill="var(--accent)" />`)}
      </svg></div>`
  }

  private overview(p: PassResult, tol: number, entries: Entry[], trend: unknown) {
    const clean = entries.filter((e) => e.clean).length
    const sung = p.notes.flatMap((n) => (n.cents === null ? [] : [n.cents]))
    const bins = Array.from({ length: 8 }, () => 0)
    for (const x of sung) bins[Math.min(7, Math.max(0, Math.floor((x + 100) / 25)))]++
    const top = Math.max(1, ...bins)
    const split = p.low + p.hits + p.high || 1
    const band = (tol / 200) * 100
    const worst = p.worstPhrase
    return html`
      <div class="card top">
        <div class="ring"><svg viewBox="0 0 120 120" width="112" height="112" aria-label="${p.hitPct} Prozent der Töne getroffen"><circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" stroke-width="12" /><circle cx="60" cy="60" r="50" fill="none" stroke="var(--accent)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(p.hitPct * 314) / 100} 314" transform="rotate(-90 60 60)" /></svg>
          <div class="c"><b>${`${p.hitPct}%`}</b><span>Töne getroffen</span></div></div>
        <div class="stats">
          <div><div class="k">Tendenz</div><div class="v ${tone(p.meanCents)}">${tendencyLabel(p.meanCents, tol)}</div></div>
          ${entries.length ? html`<div><div class="k">Einsätze</div><div class="v">${clean} von ${entries.length} sauber</div></div>` : ''}
        </div>
      </div>
      <div class="card">
        <h2>Intonation <small>${tones(p.scoredNotes)}</small></h2>
        <div class="hist" role="img" aria-label="Verteilung der Töne von einem Halbton tiefer bis einem Halbton höher">
          <i class="band" style="left:${50 - band}%;width:${2 * band}%"></i><i class="zero"></i>
          <div class="bins">${bins.map((n, i) => html`<i class=${tone(Math.abs(i * 25 - 87.5) > tol ? i * 25 - 87.5 : 0)} style="height:${(n / top) * 100}%"></i>`)}</div>
        </div>
        <div class="axis"><span>← Halbton tiefer</span><span>genau</span><span>Halbton höher →</span></div>
        <div class="split">${[
          ['low', p.low],
          ['ok', p.hits],
          ['high', p.high],
        ].map(([k, n]) => html`<i class=${k} style="width:${((n as number) / split) * 100}%"></i>`)}</div>
        <div class="legend">
          <div><b class="low">↓ zu tief</b><small>${tones(p.low)}</small></div>
          <div><b class="ok">sauber</b><small>${tones(p.hits)}</small></div>
          <div><b class="high">↑ zu hoch</b><small>${tones(p.high)}</small></div>
        </div>
        ${p.scoredNotes > p.low + p.hits + p.high ? html`<small>${tones(p.scoredNotes - p.low - p.hits - p.high)} nicht gesungen</small>` : ''}
      </div>
      ${entries.length ? this.grid(entries) : ''}
      <div class="card tip">${p.tip}</div>
      ${trend}
      ${worst === null ? '' : html`<button class="primary" @click=${() => this.drillPhrase(worst)}>Phrase ${worst + 1} bei 80 % üben</button>`}
      <div class="two"><button @click=${() => this.again()}>Nochmal ganz</button><button @click=${() => this.openDays()}>Verlauf</button></div>`
  }

  private grid(entries: Entry[]) {
    const missing = entries.filter((e) => e.ms === null).length
    return html`<div class="card entries">
      <h2>Einsätze nach Pausen <small>${entries.length} Einsätze</small></h2>
      <div class="grid">
        <span></span>${COLS.map(([, l]) => html`<span class="h">${l}</span>`)}
        ${ROWS.map(
          ([r, rl]) =>
            html`<span class="r ${r === 'above' ? 'high' : r === 'below' ? 'low' : ''}">${rl}</span>${COLS.map(([t, tl]) => {
              const n = entries.filter((e) => e.approach === r && e.timing === t).length
              const clean = r === 'ok' && t === 'ok'
              return html`<div class="cell ${clean ? 'clean' : n ? r : 'zero'}" data-row=${r} data-col=${t} aria-label="${rl}, ${tl}: ${n}">${n}${clean ? html`<span>sauber</span>` : ''}</div>`
            })}`,
        )}
      </div>
      ${missing ? html`<small>${missing} nicht gesungen</small>` : ''}
      <button class="link" @click=${() => {
        this.view = 'entries'
      }}>Alle Einsätze ansehen →</button>
    </div>`
  }

  /** One section or phrase: hit share, where the notes go on average, its entries. */
  private row(label: string, sub: string, s: PhraseResult, tol: number, marks: unknown, drill: () => void) {
    const c = s.meanCents
    const w = c === null ? 0 : Math.max((Math.min(Math.abs(c), 75) / 75) * 50, 1.5)
    const band = (Math.min(tol, 75) / 75) * 50
    return html`<div class="card row">
      <div class="rhead">
        <div class="name"><b>${label}</b><small>${sub}</small></div>
        <big>${Math.round((100 * s.hits) / s.notes)} %</big>
        <button class="round" aria-label="${label} bei 80 % üben" @click=${drill}>${PLAY}</button>
      </div>
      <div class="dev">
        <div class="track"><i class="band" style="left:${50 - band}%;width:${2 * band}%"></i>${c === null ? '' : html`<i class="fill ${tone(c)}" style="${c >= 0 ? 'left' : 'right'}:50%;width:${w}%"></i>`}<i class="zero"></i></div>
        <span class=${tone(c)}>${tendencyLabel(c, tol)}</span>
      </div>
      <div class="marks">${marks}</div>
    </div>`
  }

  private lists(p: PassResult, tol: number) {
    const song = this.c.live!.song.song
    const legend = html`<p class="hint">Balken = wohin die Töne im Schnitt gehen, gestrichelt = Grenze zu „daneben“</p>`
    const inPhrase = (i: number) => p.notes.filter((n) => n.note.phrase === i)
    const phraseRow = (s: PhraseResult) => {
      const ns = inPhrase(s.index)
      return this.row(
        `Phrase ${s.index + 1}`,
        `„${joinSyllables(ns.map((n) => n.note.syllable))}“`,
        s,
        tol,
        ns.flatMap((n) => (n.entry ? chips(n.entry) : [])).map(([k, t]) => html`<span class="chip ${k}">${t}</span>`),
        () => this.drillPhrase(s.index),
      )
    }
    if (this.view === 'phrases' && !p.sections.length) return html`${legend}${p.phrases.map(phraseRow)}`
    const sectionOf = (n: NoteResult) => p.sections.find((s) => song.sections[s.index].start <= n.note.start && n.note.start < song.sections[s.index].end)
    if (this.view === 'phrases') {
      const of = (ph: PhraseResult) => sectionOf(inPhrase(ph.index)[0])
      return html`${legend}${p.sections.map((s) => html`<div class="group">${s.label}</div>${p.phrases.filter((ph) => of(ph) === s).map(phraseRow)}`)}
        ${p.phrases.filter((ph) => !of(ph)).map(phraseRow)}`
    }
    return html`${legend}${p.sections.map((s) => {
      const sec = song.sections[s.index]
      const entries = p.notes.filter((n) => n.entry && sectionOf(n) === s).map((n) => n.entry!)
      const clean = entries.filter((e) => e.clean).length
      return this.row(
        s.label,
        entries.length ? `Einsätze ${clean} von ${entries.length} sauber` : '',
        s,
        tol,
        entries.map(
          (e) =>
            html`<span class="dot ${e.clean ? 'ok' : e.ms === null ? 'miss' : e.approach === 'below' ? 'low' : e.approach === 'above' ? 'high' : 'time'}" role="img" aria-label=${chips(
              e,
            )
              .map((x) => x[1])
              .join(', ')}>${glyph(e)}</span>`,
        ),
        () => this.drillSection(sec),
      )
    })}<p class="hint">✓ sauber · ↑ von unten · ↓ von oben · ← zu früh · → zu spät</p>`
  }

  /** Entries with a picture: target bar, the written start, the sung line around it. */
  private entries(p: PassResult) {
    const all = p.notes.filter((n) => n.entry)
    const off = all.filter((n) => !n.entry!.clean)
    const shown = this.all ? all : off
    const x = (ms: number) => ((ms + 300) / 900) * 318
    const y = (c: number) => 40 - Math.max(-150, Math.min(150, c)) * 0.25
    return html`
      <div class="tabs" role="tablist" aria-label="Einsätze filtern">
        ${[
          [false, `Daneben (${off.length})`],
          [true, `Alle (${all.length})`],
        ].map(
          ([v, l]) =>
            html`<button role="tab" aria-selected=${this.all === v} @click=${() => {
              this.all = v as boolean
            }}>${l}</button>`,
        )}
      </div>
      ${shown.map((n) => {
        const e = n.entry!
        const lyric = joinSyllables(p.notes.filter((m) => m.note.phrase === n.note.phrase && m.note.start >= n.note.start).map((m) => m.note.syllable))
        return html`<div class="card row entry">
          <div class="rhead">
            <div class="name"><span class="where">Phrase ${n.note.phrase + 1} · Takt ${n.note.bar + 1}</span><b>„${lyric}“</b></div>
            <button class="round" aria-label="Phrase ${n.note.phrase + 1} bei 80 % üben" @click=${() => this.drillPhrase(n.note.phrase)}>${PLAY}</button>
          </div>
          <svg class="pic" viewBox="0 0 318 80" role="img" aria-label="Tonhöhe am Einsatz: ${chips(e)
            .map((c) => c[1])
            .join(', ')}">
            <rect x="0" y="0" width=${x(0)} height="80" fill="var(--bg)" opacity="0.35" />
            <text x="10" y="16" font-size="10" fill="var(--muted)">Pause</text>
            <rect x=${x(0)} y="37" width=${318 - x(0)} height="6" rx="3" fill="var(--accent)" opacity="0.5" />
            <line x1=${x(0)} y1="4" x2=${x(0)} y2="76" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="3 3" />
            <polyline points=${e.curve.map(([ms, c]) => `${x(ms).toFixed(1)},${y(c).toFixed(1)}`).join(' ')} fill="none" stroke="var(--text)" stroke-width="2.5" stroke-linejoin="round" />
          </svg>
          <div class="marks">${chips(e).map(([k, t]) => html`<span class="chip ${k}">${t}</span>`)}</div>
        </div>`
      })}
      ${
        this.all || off.length === all.length
          ? ''
          : html`<button @click=${() => {
              this.all = true
            }}>${all.length - off.length} saubere Einsätze auch zeigen</button>`
      }`
  }

  render() {
    const c = this.c
    const passes = c.live!.session.passes()
    const p = passes.at(-1)
    const tol = c.settings.get().tolerance
    const meta = c.live!.song.meta
    const toPractice = () => c.route(`#/practice/${this.songId}`)
    const back =
      this.view === 'entries' || this.view === 'days'
        ? html`<button class="round" aria-label="Zurück" @click=${() => {
            this.view = 'all'
          }}>${BACK}</button>`
        : html`<button class="round" aria-label="Zurück zum Üben" @click=${toPractice}>${BACK}</button>`
    if (!p) return html`<div class="page"><header>${back}<h1>Keine Töne gesungen.</h1></header></div>`
    const entries = p.notes.flatMap((n) => (n.entry ? [n.entry] : []))
    const tabs = [['all', 'Gesamt'], ...(p.sections.length ? [['sections', 'Abschnitte']] : []), ['phrases', 'Phrasen']] as [View, string][]
    const song = `Lied ${meta.number} · ${meta.title}`
    const [title, sub] = this.view === 'days' ? ['Verlauf', song] : [this.view === 'entries' ? 'Einsätze nach Pausen' : song, `Durchgang ${passes.length}`]
    return html`<div class="page">
      <header>${back}<div><h1>${title}</h1><div class="k">${sub}</div></div></header>
      ${
        this.view === 'days'
          ? this.daysView(tol)
          : this.view === 'entries'
            ? this.entries(p)
            : html`<div class="tabs" role="tablist" aria-label="Auswertung nach">${tabs.map(
                ([v, l]) =>
                  html`<button role="tab" aria-selected=${this.view === v} @click=${() => {
                    this.view = v
                  }}>${l}</button>`,
              )}</div>
            ${this.view === 'all' ? this.overview(p, tol, entries, passes.length > 1 ? this.trend(c.live!.session.trend()) : '') : this.lists(p, tol)}`
      }
    </div>`
  }
}

customElements.define('gu-results', GuResults)
