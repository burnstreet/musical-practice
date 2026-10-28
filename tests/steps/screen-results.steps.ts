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
  scoredNotes: 8,
  hits: 4,
  hitPct: 50,
  meanCents: 10,
  tendency: 'ok',
  rangeMidi: [60, 64],
  worstPhrase: 2,
  tip: 'Tipp Text',
  ...o,
})

const deepText = (n: Node): string =>
  n.nodeType === Node.TEXT_NODE ? (n.textContent ?? '') : [...((n as Element).shadowRoot?.childNodes ?? []), ...n.childNodes].map(deepText).join(' ')

function given(ctx: any, p: any = {}, count = 3) {
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
    setTempo: (t: number) => {
      ctx.engine.tempo = t
    },
    setLoop: (l: any) => {
      ctx.engine.loop = l
    },
    time: () => ctx.engine.t,
    playing: () => ctx.engine.on,
  }
  const passes = Array.from({ length: count }, (_, i) => (i === count - 1 ? pass(p) : pass({ hitPct: 10 * (i + 1) })))
  setContext({
    settings,
    engine: ctx.engine,
    route: (to: string) => ctx.routed.push(to),
    live: {
      songId: 's',
      song: {
        meta: { number: 8, title: '[Titel]', durationSec: 20 },
        song: { phrases, sections: [], notes: [], bars: [0, 4, 8, 12, 16], key: 'F', bpm: 100, timeSig: [4, 4] },
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
const text = async (ctx: any) => deepText(await mount(ctx)).replace(/\s+/g, ' ')
const press = async (ctx: any, label: string) => {
  const el = await mount(ctx)
  const b = [...el.shadowRoot!.querySelectorAll('button')].find((x) => x.textContent!.trim() === label)
  if (!b) throw new Error(`no button "${label}" in ${await text(ctx)}`)
  b.click()
}

export default steps(({ Given, When, Then }) => {
  Given(/^pass 3 with hitPct (\d+), meanCents (-?\d+), tendency (\w+), rangeMidi \[(\d+), (\d+)\], tolerance (\d+)$/, (ctx, h, m, t, lo, hi, tol) => {
    settings.set({ tolerance: +tol as any })
    given(ctx, { hitPct: +h, meanCents: +m, tendency: t, rangeMidi: [+lo, +hi] })
    settings.set({ tolerance: +tol as any })
  })
  Given(/^meanCents (-?\d+), tendency (\w+), tolerance (\d+)$/, (ctx, m, t, tol) => {
    given(ctx, { meanCents: +m, tendency: t })
    settings.set({ tolerance: +tol as any })
  })
  Given(/^one pass$/, (ctx) => given(ctx, {}, 1))
  Given(/^three passes$/, (ctx) => given(ctx, {}, 3))
  Given(/^worstPhrase (\d+)$/, (ctx, w) => given(ctx, { worstPhrase: +w }))
  When(/^the screen renders$/, (ctx) => mount(ctx))
  When(/^I press "(.*)"$/, (ctx, l) => press(ctx, l))
  Then(/^it shows (.*)$/, async (ctx, list) => {
    const t = await text(ctx)
    const values = [...(await mount(ctx)).shadowRoot!.querySelectorAll('.v')].map((v) => v.textContent!.trim())
    for (const m of list.matchAll(/"([^"]*)"/g)) {
      if (/^(sauber|(leicht )?zu (hoch|tief))$/.test(m[1]))
        expect(values).toContain(m[1]) // tendency value exactly, not a substring
      else expect(t).toContain(m[1])
    }
  })
  Then(/^no "Verlauf" element$/, async (ctx) => expect(await text(ctx)).not.toContain('Verlauf'))
  Then(/^"Verlauf" shows three points$/, async (ctx) => {
    const el = await mount(ctx)
    expect(await text(ctx)).toContain('Verlauf')
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
  Then(/^no element with text "Aufnahme anhören" exists$/, async (ctx) => {
    given(ctx)
    expect(await text(ctx)).not.toContain('Aufnahme anhören')
  })
})
