import { expect } from 'vitest'
import { getContext, setContext } from '../../src/app/context'
import { settings } from '../../src/app/settings'
import { steps } from '../gherkin'

const phrases = [0, 1, 2, 3].map((index) => ({ index, label: `p${index}`, start: index * 4 + 1, end: index * 4 + 4 }))
const pass = (o: any = {}) => ({
  notes: [],
  phrases: [0, 1, 2, 3].map((index) => ({
    index,
    label: '',
    notes: 2,
    sung: index === 1 ? 0 : 2,
    hits: 1,
    meanCents: index === 1 ? null : index === 2 ? -60 : 10,
  })),
  sections: [],
  scoredNotes: 8,
  hits: 4,
  hitPct: 50,
  low: 1,
  high: 1,
  meanCents: 10,
  tendency: 'ok',
  rangeMidi: [60, 64],
  worstPhrase: 2,
  tip: 'Tipp Text',
  ...o,
})
/** A scored note in phrase `phrase` at `start`, with an entry when given. */
const scored = (phrase: number, start: number, syllable: string, entry: any = null) => ({
  note: { start, end: start + 1, midi: 67, syllable, role: 'maria', phrase, bar: phrase * 2, beat: 0, dur: 1 },
  sung: true,
  cents: 0,
  hit: true,
  maxAbsCents: 0,
  entry,
})
const ENTRY: Record<string, any> = {
  clean: { ms: 10, cents: 0, timing: 'ok', approach: 'ok', clean: true, curve: [[10, 0]] },
  'late from below': {
    ms: 150,
    cents: -80,
    timing: 'late',
    approach: 'below',
    clean: false,
    curve: [
      [150, -80],
      [300, 0],
    ],
  },
  early: { ms: -120, cents: 0, timing: 'early', approach: 'ok', clean: false, curve: [[-120, 0]] },
  'not sung': { ms: null, cents: null, timing: null, approach: null, clean: false, curve: [] },
}
const withEntries = (list: string) => pass({ notes: list.split(', ').map((k, i) => scored(0, 1 + i * 0.5, `s${i}`, ENTRY[k])) })
const SECTIONS = [
  { name: 'Strophe', start: 0, end: 5 },
  { name: 'Refrain', start: 5, end: 20 },
]

/** Local day n days before today, as history stores it. */
const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** "2 days ago 6 of 10 hits, 1 of 2 entries clean; today …" to DaySummary[], newest first. */
const storedDays = (list: string) =>
  list
    .split('; ')
    .map((part) => {
      const ago = part.startsWith('today') ? 0 : +part.split(' ')[0]
      const d = { day: daysAgo(ago), passes: 1, notes: 0, hits: 0, centsSum: 0, centsPasses: 0, entries: 0, cleanEntries: 0, sections: {} as any }
      for (const fact of part.split(', ')) {
        const [k, n] = [...fact.matchAll(/\d+ of \d+/g)][0][0].split(' of ').map(Number)
        const section = fact.match(/section "(\w+)"/)?.[1]
        if (section) d.sections[section] = { notes: n, hits: k }
        else if (fact.endsWith('entries clean')) Object.assign(d, { entries: n, cleanEntries: k })
        else Object.assign(d, { notes: n, hits: k })
      }
      return d
    })
    .sort((a, b) => b.day.localeCompare(a.day))

const deepText = (n: Node): string =>
  n.nodeType === Node.TEXT_NODE ? (n.textContent ?? '') : [...((n as Element).shadowRoot?.childNodes ?? []), ...n.childNodes].map(deepText).join(' ')

function given(ctx: any, p: any = {}, count = 3, sections: any[] = [], days: any[] = []) {
  document.body.innerHTML = ''
  localStorage.clear()
  ctx.el = null
  ctx.routed = []
  ctx.engine = {
    loop: 'unset',
    tempo: 0,
    t: -1,
    on: true,
    play: async () => {
      ctx.engine.on = true
    },
    pause: () => {
      ctx.engine.on = false
    },
    seek: (s: number) => {
      ctx.engine.t = s
    },
    seekLeadIn: (s: number) => {
      ctx.engine.t = s
    },
    setTempo: (t: number) => {
      ctx.engine.tempo = t
    },
    setLoop: (l: any) => {
      ctx.engine.loop = l
    },
    time: () => ctx.engine.t,
    playing: () => ctx.engine.on,
  }
  const passes = Array.from({ length: count }, (_, i) => (i === count - 1 ? (p.notes ? p : pass(p)) : pass({ hitPct: 10 * (i + 1) })))
  setContext({
    settings,
    engine: ctx.engine,
    route: (to: string) => ctx.routed.push(to),
    history: { days: async () => days },
    live: {
      songId: 's',
      song: {
        meta: { number: 8, title: '[Titel]', durationSec: 20 },
        song: { phrases, sections, notes: [], bars: [0, 4, 8, 12, 16], key: 'F', bpm: 100, timeSig: [4, 4] },
      },
      session: { myNotes: () => [], passes: () => passes, trend: () => passes.map((x) => x.hitPct) },
    },
  } as any)
}

async function mount(ctx: any): Promise<HTMLElement> {
  if (ctx.el) return ctx.el
  if (!ctx.engine) given(ctx)
  await import('../../src/app/screens/results')
  const el: any = document.createElement('gu-results')
  el.songId = 's'
  document.body.append(el)
  await el.updateComplete
  ctx.el = el
  return el
}
const root = async (ctx: any) => (await mount(ctx)).shadowRoot!
const text = async (ctx: any) => deepText(await mount(ctx)).replace(/\s+/g, ' ')
const press = async (ctx: any, label: string) => {
  const el: any = await mount(ctx)
  const b = [...el.shadowRoot!.querySelectorAll('button')].find((x: Element) => x.textContent!.trim() === label || x.getAttribute('aria-label') === label)
  if (!b) throw new Error(`no button "${label}" in ${await text(ctx)}`)
  b.click()
  await el.updateComplete
}
const ROW: Record<string, string> = { 'von oben': 'above', direkt: 'ok', 'von unten': 'below' }
const COL: Record<string, string> = { 'zu früh': 'early', pünktlich: 'ok', 'zu spät': 'late' }

export default steps(({ Given, When, Then }) => {
  Given(/^pass 3 with hitPct (\d+), meanCents (-?\d+), tendency (\w+), tolerance (\d+)$/, (ctx, h, m, t, tol) => {
    given(ctx, { hitPct: +h, meanCents: +m, tendency: t })
    settings.set({ tolerance: +tol as any })
  })
  Given(/^meanCents (-?\d+), tendency (\w+), tolerance (\d+)$/, (ctx, m, t, tol) => {
    given(ctx, { meanCents: +m, tendency: t })
    settings.set({ tolerance: +tol as any })
  })
  Given(/^one pass$/, (ctx) => given(ctx, {}, 1))
  Given(/^three passes$/, (ctx) => given(ctx, {}, 3))
  Given(/^worstPhrase (\d+)$/, (ctx, w) => given(ctx, { worstPhrase: +w }))
  Given(/^a pass with (\d+) hits, (\d+) low, (\d+) high of (\d+) notes$/, (ctx, h, lo, hi, n) => given(ctx, { hits: +h, low: +lo, high: +hi, scoredNotes: +n }))
  Given(/^a pass with entries (.*)$/, (ctx, list) => given(ctx, withEntries(list)))
  Given(/^a pass without entries$/, (ctx) => given(ctx, pass({ notes: [scored(0, 1, 'la')] })))
  Given(/^a pass over sections "Strophe" and "Refrain" with one phrase each$/, (ctx) =>
    given(
      ctx,
      pass({
        notes: [scored(0, 1, 'Der', ENTRY.clean), scored(1, 5, 'Mond', ENTRY['late from below'])],
        phrases: [0, 1].map((index) => ({ index, label: '', notes: 1, sung: 1, hits: 1, meanCents: index ? 30 : 0 })),
        sections: SECTIONS.map((s, index) => ({ index, label: s.name, notes: 1, sung: 1, hits: 1, meanCents: index ? 30 : 0 })),
      }),
      3,
      SECTIONS,
    ),
  )
  Given(/^stored days: (.*)$/, (ctx, list) => given(ctx, {}, 3, [{ name: 'Refrain', start: 0, end: 20 }], storedDays(list)))
  When(/^the screen renders$/, (ctx) => mount(ctx))
  When(/^I press "(.*)"$/, (ctx, l) => press(ctx, l))
  Then(/^it shows (.*)$/, async (ctx, list) => {
    const t = await text(ctx)
    const values = [...(await root(ctx)).querySelectorAll('.v')].map((v) => v.textContent!.trim())
    for (const m of list.matchAll(/"([^"]*)"/g)) {
      if (/^(sauber|[↑↓] (etwas )?zu (hoch|tief))$/.test(m[1]))
        expect(values).toContain(m[1]) // tendency value exactly, not a substring
      else expect(t).toContain(m[1])
    }
  })
  Then(/^no text says "(.*)"$/, async (ctx, s) => expect(await text(ctx)).not.toContain(s))
  Then(/^the split shows "(.*)", "(.*)", "(.*)" and "(.*)"$/, async (ctx, lo, ok, hi, missing) => {
    expect([...(await root(ctx)).querySelectorAll('.legend small')].map((x) => x.textContent!.trim())).toEqual([lo, ok, hi])
    expect(await text(ctx)).toContain(missing)
  })
  Then(/^the grid cell (.*)$/, async (ctx, list) => {
    const r = await root(ctx)
    for (const [, row, col, n] of list.matchAll(/(von oben|direkt|von unten) \/ (zu früh|pünktlich|zu spät)(?: shows)? (\d+)/g)) {
      const cell = r.querySelector(`.cell[data-row="${ROW[row]}"][data-col="${COL[col]}"]`)!
      expect(cell.textContent!.replace('sauber', '').trim(), `${row} / ${col}`).toBe(n)
    }
  })
  Then(/^one entry card shows "(.*)" and "(.*)"$/, async (ctx, a, b) => {
    const cards = [...(await root(ctx)).querySelectorAll('.entry')]
    expect(cards).toHaveLength(1)
    expect(cards[0].textContent).toContain(a)
    expect(cards[0].textContent).toContain(b)
  })
  Then(/^(\d+) entry cards are shown$/, async (ctx, n) => expect((await root(ctx)).querySelectorAll('.entry')).toHaveLength(+n))
  Then(/^rows "(.*)" and "(.*)" are shown$/, async (ctx, a, b) =>
    expect([...(await root(ctx)).querySelectorAll('.row .name b')].map((x) => x.textContent!.trim())).toEqual([a, b]),
  )
  Then(/^there is no "Abschnitte" tab$/, async (ctx) =>
    expect([...(await root(ctx)).querySelectorAll('[role=tab]')].map((x) => x.textContent!.trim())).toEqual(['Gesamt', 'Phrasen']),
  )
  Then(/^there are (\d+) hit bars, (\d+) of them empty$/, async (ctx, n, empty) => {
    const bars = [...(await root(ctx)).querySelectorAll('.bars.hits > i')]
    expect(bars).toHaveLength(+n)
    expect(bars.filter((b) => b.classList.contains('empty'))).toHaveLength(+empty)
  })
  Then(/^no "Durchgänge" element$/, async (ctx) => expect(await text(ctx)).not.toContain('Durchgänge'))
  Then(/^"Durchgänge" shows three points$/, async (ctx) => {
    const el = await mount(ctx)
    expect(await text(ctx)).toContain('Durchgänge')
    expect(el.shadowRoot!.querySelectorAll('.trend circle').length).toBe(3)
  })
  Then(/^the repeat range is the range of phrase (\d+) with phrase (\d+) and no lead-in$/, (ctx, i, j) => {
    expect(ctx.engine.loop).toEqual({ start: phrases[+i].start, end: phrases[+i].end, phrase: phrases[+j] })
  })
  Then(/^tempo is 80, time is the phrase start, route is practice, playing is false$/, (ctx) => {
    expect(ctx.engine.tempo).toBe(80)
    expect(ctx.engine.t).toBe(phrases[2].start)
    expect(ctx.routed).toEqual(['#/practice/s'])
    expect(ctx.engine.on).toBe(false)
  })
  Then(/^the repeat range is "Refrain" with lead-in, tempo is 80, playing is false, route is practice$/, (ctx) => {
    expect(ctx.engine.loop).toEqual({ start: 5, end: 20, leadIn: true })
    expect(ctx.engine.tempo).toBe(80)
    expect(ctx.engine.t).toBe(5)
    expect(ctx.engine.on).toBe(false)
    expect(ctx.routed).toEqual(['#/practice/s'])
  })
  Then(/^the practice screen shows the chip "(\w+)" active$/, async (ctx, label) => {
    const { engine } = ctx
    const live = (getContext() as any).live
    setContext({
      settings,
      live,
      route: () => {},
      openSettings: () => {},
      library: { roles: () => [{ id: 'maria', name: 'Maria', sings: true }], getSong: async () => live.song },
      engine: { ...engine, load: async () => {}, setMode: () => {}, on: () => {}, tempo: () => engine.tempo, loop: () => engine.loop },
      pitch: { start: async () => 'ok', on: () => () => {}, stop: () => {}, delay: () => 0 },
    } as any)
    await import('../../src/app/screens/practice')
    const el: any = document.createElement('gu-practice')
    el.songId = 's'
    document.body.append(el)
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
    await el.updateComplete
    const on = [...el.shadowRoot!.querySelectorAll('.chip[aria-pressed="true"]')].map((c: Element) => c.textContent!.trim())
    expect(on).toEqual([label])
  })
  Then(/^no repeat range is set, tempo 100, time 0, route is practice$/, (ctx) => {
    expect(ctx.engine.loop).toBeNull()
    expect(ctx.engine.tempo).toBe(100)
    expect(ctx.engine.t).toBe(0)
    expect(ctx.routed).toEqual(['#/practice/s'])
  })
  Then(/^the route is practice and the engine is untouched$/, (ctx) => {
    expect(ctx.routed).toEqual(['#/practice/s'])
    expect(ctx.engine).toMatchObject({ loop: 'unset', tempo: 0, t: -1, on: true })
  })
  Then(/^no element with text "Aufnahme anhören" exists$/, async (ctx) => {
    given(ctx)
    expect(await text(ctx)).not.toContain('Aufnahme anhören')
  })
})
