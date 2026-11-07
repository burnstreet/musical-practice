import { expect } from 'vitest'
import { type AppContext, setContext } from '../../src/app/context'
import { settings } from '../../src/app/settings'
import type { Script, ScriptItem } from '../../src/core/types'
import { steps } from '../gherkin'
import '../../src/app/screens/roles'
import '../../src/app/screens/songs'
import '../../src/app/screens/text'
import '../../src/app/screens/run'
import '../../src/app/settings-sheet'

const ROLES = [
  { id: 'lena', name: 'Lena', sings: true, speaks: true },
  { id: 'vater', name: 'Vater', sings: true, speaks: true },
]
const line = (id: string, role: string, text: string): ScriptItem => ({ id, type: 'line', role, text, audio: '0000000000000000' })
const scene = (id: string, items: ScriptItem[]) => ({ id, title: `Titel ${id}`, items })

/** Fresh fake context per scenario; also resets DOM and storage. */
function fake(ctx: any) {
  if (ctx.c) return ctx
  document.body.innerHTML = ''
  localStorage.clear()
  ctx.roles = ROLES
  ctx.songs = []
  ctx.script = { scenes: [scene('s1', [line('l001', 'vater', 'Hallo.')])] } as Script
  ctx.hasScript = true
  ctx.routed = [] as string[]
  ctx.now = 0
  ctx.c = {
    settings,
    live: null,
    returnTo: null,
    route: (to: string) => ctx.routed.push(to),
    openSettings: () => {},
    library: {
      songs: () => ctx.songs,
      roles: () => ctx.roles,
      isReady: () => true,
      onProgress: () => {},
      hasScript: () => ctx.hasScript,
      scriptReady: () => ctx.hasScript,
      getScript: async () => ({ script: ctx.script, audio: async () => new Blob([], { type: 'audio/mpeg' }) }),
    },
    history: { badge: async () => null },
    pitch: { start: async () => 'ok', stop: () => {}, on: () => () => {}, level: () => 0, active: () => false, devices: async () => [] },
  } as unknown as AppContext
  setContext(ctx.c)
  return ctx
}

const settle = async (el: any) => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
  await el.updateComplete
}

/** All elements across shadow roots. */
const deepAll = (n: Element | ShadowRoot): Element[] => [...n.children].flatMap((c) => [c, ...(c.shadowRoot ? deepAll(c.shadowRoot) : []), ...deepAll(c)])
const deepText = (n: Node): string =>
  n.nodeType === Node.TEXT_NODE ? (n.textContent ?? '') : [...((n as Element).shadowRoot?.childNodes ?? []), ...n.childNodes].map(deepText).join(' ')
const text = (ctx: any) => deepText(ctx.el).replace(/\s+/g, ' ')
const all = (ctx: any) => deepAll(ctx.el.shadowRoot)
const clickable = (ctx: any, t: string) =>
  all(ctx).find((e) => /^(BUTTON|LABEL|A)$/.test(e.tagName) && e.textContent!.replace(/\s+/g, ' ').trim() === t) as HTMLElement | undefined
const chips = (ctx: any) => all(ctx).filter((e) => e.matches('[aria-pressed]') && e.closest('.chips'))
const chipNames = (ctx: any) => chips(ctx).map((e) => e.textContent!.trim())
const card = (ctx: any) => {
  const c = all(ctx).find((e) => e.matches('.current'))
  if (!c) throw new Error(`no current card in: ${text(ctx)}`)
  return c.textContent!.replace(/\s+/g, ' ')
}

async function mount(ctx: any, tag: string, props: Record<string, unknown> = {}) {
  if (ctx.el) return ctx.el
  ctx.el = Object.assign(document.createElement(tag), props)
  document.body.append(ctx.el)
  await settle(ctx.el)
  return ctx.el
}

/** Run-through of s1 with fake audio (never ends), a fake clock and a manual tick; records what the cue engine is sent. */
async function run(ctx: any, itemId?: string) {
  ctx.sent = [] as string[]
  ctx.el = null
  document.body.innerHTML = ''
  const deps = {
    now: () => ctx.now,
    every: (_ms: number, fn: () => void) => {
      ctx.tick = fn
      return () => {}
    },
    play: () => ({ ended: new Promise<void>(() => {}), stop: () => {} }),
  }
  const el = await mount(ctx, 'gu-run', { sceneId: 's1', itemId: itemId ?? '', deps })
  const dialog = el.dialog
  const send = dialog.send.bind(dialog)
  dialog.send = (ev: { type: string }) => {
    ctx.sent.push(ev.type)
    send(ev)
  }
  return el
}

export default steps(({ Given, When, Then }) => {
  // Role bar
  Given(/^settings\.roles \[(.*)\]$/, (ctx, ids) => {
    fake(ctx)
    settings.set({ roles: ids ? ids.split(',').map((s) => s.trim()) : [] })
  })
  Given(/^roles clara \(sings\), erzaehler \(speaks\) and esel \(neither\)$/, (ctx) => {
    fake(ctx)
    ctx.roles = [
      { id: 'clara', name: 'Clara', sings: true, speaks: false },
      { id: 'erzaehler', name: 'Erzähler', sings: false, speaks: true },
      { id: 'esel', name: 'Esel', sings: false, speaks: false },
    ]
  })
  When(/^the role bar renders$/, (ctx) => mount(ctx, 'gu-roles'))
  When(/^I expand the role bar$/, async (ctx) => {
    await mount(ctx, 'gu-roles')
    if (!chips(ctx).length) {
      clickable(ctx, 'ändern')?.click()
      await settle(ctx.el)
    }
  })
  Then(/^it reads "([^"]+)" with "([^"]+)" and shows no chips$/, (ctx, names, change) => {
    expect(text(ctx)).toContain(names)
    expect(text(ctx)).toContain(change)
    expect(chips(ctx)).toEqual([])
  })
  Then(/^it shows "([^"]+)" and the role chips, and no "([^"]+)"$/, (ctx, none, done) => {
    expect(text(ctx)).toContain(none)
    expect(chipNames(ctx)).toEqual(['Lena', 'Vater'])
    expect(text(ctx)).not.toContain(done)
  })
  Then(/^chips "([^"]+)" and "([^"]+)" exist and no chip "([^"]+)"$/, (ctx, a, b, no) => {
    expect(chipNames(ctx)).toEqual([a, b])
    expect(chipNames(ctx)).not.toContain(no)
  })

  // Scene selection
  Given(/^a stored position (s\d+) for role set \[(.*)\]$/, (ctx, sceneId, ids) => {
    fake(ctx)
    ctx.script = { scenes: ['s1', 's2', 's3', 's4'].map((id) => scene(id, [line(`${id}aa`, 'vater', 'Hallo.')])) }
    settings.set({ roles: ids.split(','), dialogPositions: { [ids]: { sceneId, itemId: `${sceneId}aa`, at: Date.now() } } })
  })
  When(/^the text screen renders$/, (ctx) => mount(ctx, 'gu-text'))
  Then(/^"([^"]+)" is visible$/, (ctx, t) => {
    expect(text(ctx)).toContain(t)
  })
  Given(/^scene s2 with (\d+) lines of lena and roles \[lena\]$/, (ctx, n) => {
    fake(ctx)
    const mine = Array.from({ length: +n }, (_, i) => line(`a00${i}`, 'lena', 'Ja.'))
    ctx.script = { scenes: [scene('s1', [line('m001', 'vater', 'Hallo.')]), scene('s2', [line('m002', 'vater', 'Na?'), ...mine])] }
    settings.set({ roles: ['lena'] })
  })
  Then(/^row (\d+) shows "([^"]+)"$/, async (ctx, n, t) => {
    await mount(ctx, 'gu-text')
    const row = all(ctx).find((e) => e.getAttribute('data-scene') === `s${n}`)!
    expect(row.textContent).toContain(t)
    const other = all(ctx).find((e) => e.getAttribute('data-scene') === 's1')!
    expect(other.textContent).not.toContain('Zeilen') // hidden at 0
  })
  Given(/^a library without script$/, (ctx) => {
    fake(ctx)
    ctx.hasScript = false
  })
  Then(/^the "Text" tab is hidden$/, async (ctx) => {
    await mount(ctx, 'gu-songs')
    expect(all(ctx).some((e) => e.getAttribute('role') === 'tab' && e.textContent!.trim() === 'Text')).toBe(false)
  })

  // Run-through
  Given(/^the cue state playing line of vater "([^"]+)"$/, async (ctx, t) => {
    fake(ctx)
    settings.set({ roles: ['lena'] })
    ctx.script = { scenes: [scene('s1', [line('m001', 'vater', t), line('a001', 'lena', 'Ja.')])] }
    await run(ctx)
    expect(ctx.el.dialog.cue.state).toBe('playing')
  })
  Then(/^a card shows "([^"]+)" and "([^"]+)"$/, (ctx, a, b) => {
    expect(card(ctx)).toContain(a)
    expect(card(ctx)).toContain(b)
  })
  Then(/^the card shows "([^"]+)", the inline direction "([^"]+)" and "([^"]+)", and no "\["$/, (ctx, a, dir, b) => {
    expect(card(ctx)).toContain(a)
    expect(card(ctx)).toContain(b)
    expect(card(ctx)).not.toContain('[')
    const em = all(ctx).find((e) => e.matches('.current .inl'))
    expect(em?.textContent).toBe(dir)
  })
  Given(/^roles \[lena\] and scene s1 with directions "([^"]+)", "([^"]+)", "([^"]+)" and a line of vater$/, (ctx, a, b, c) => {
    fake(ctx)
    settings.set({ roles: ['lena'] })
    ctx.dirs = { [a]: 'd001', [b]: 'd002', [c]: 'd003' }
    ctx.script = {
      scenes: [scene('s1', [...[a, b, c].map((text, i): ScriptItem => ({ id: `d00${i + 1}`, type: 'direction', text })), line('m001', 'vater', 'Hallo.')])],
    }
  })
  When(/^the run-through starts at "([^"]+)"$/, (ctx, t) => run(ctx, ctx.dirs[t]))
  When(/^the run-through starts at the line$/, (ctx) => run(ctx, 'm001'))
  Then(/^the direction card is highlighted$/, (ctx) => {
    expect(ctx.el.dialog.cue.state).toBe('direction')
    expect(
      all(ctx)
        .find((e) => e.matches('.current.direction'))
        ?.classList.contains('me'),
    ).toBe(true)
  })
  Then(/^in the flow "([^"]+)" is highlighted and "([^"]+)" and "([^"]+)" are not$/, (ctx, yes, no1, no2) => {
    const dir = (t: string) => all(ctx).find((e) => e.matches('.past .dir') && e.textContent === t)!
    expect(dir(yes).classList.contains('me')).toBe(true)
    expect(dir(no1).classList.contains('me')).toBe(false)
    expect(dir(no2).classList.contains('me')).toBe(false)
  })
  Given(/^roles \[lena\] and scene s1 with a line of vater, two lines of lena and a line of vater$/, (ctx) => {
    fake(ctx)
    settings.set({ roles: ['lena'] })
    ctx.script = {
      scenes: [scene('s1', [line('m001', 'vater', 'Na?'), line('a001', 'lena', 'Ja.'), line('a002', 'lena', 'Gut.'), line('m002', 'vater', 'Schön.')])],
    }
  })
  When(/^the run-through starts at the last line$/, (ctx) => run(ctx, 'm002'))
  Then(/^the progress reads "([^"]+)"$/, (ctx, t) => {
    expect(
      all(ctx)
        .find((e) => e.matches('.progress'))
        ?.getAttribute('aria-label'),
    ).toContain(t)
  })
  Given(/^a script not ready yet$/, (ctx) => {
    fake(ctx)
    ctx.c.library.scriptReady = () => false
  })
  Then(/^one disabled row reads "([^"]+)"$/, (ctx, t) => {
    const rows = all(ctx).filter((e) => e.matches('.row'))
    expect(rows.length).toBe(1)
    expect((rows[0] as HTMLButtonElement).disabled).toBe(true)
    expect(rows[0].textContent!.trim()).toBe(t)
  })
  Given(/^settings\.dialog\.hint "(\w+)" and the cue state waiting with my line "([^"]+)"$/, async (ctx, hint, t) => {
    fake(ctx)
    settings.set({ roles: ['lena'], dialog: { ...settings.get().dialog, hint: hint as 'start' } })
    ctx.script = { scenes: [scene('s1', [line('a001', 'lena', t), line('m001', 'vater', 'Gut.')])] }
    ctx.full = t
    await run(ctx)
  })
  Then(/^the card reads "([^"]+)" and "([^"]+)" and offers "([^"]+)"$/, (ctx, a, b, c) => {
    expect(card(ctx)).toContain(a)
    expect(card(ctx)).toContain(b)
    expect(card(ctx)).not.toContain(ctx.full)
    expect(clickable(ctx, c)).toBeTruthy()
  })
  When(/^I press "([^"]+)"$/, async (ctx, t) => {
    const b = clickable(ctx, t)
    if (!b) throw new Error(`no "${t}" in: ${text(ctx)}`)
    b.click()
    await settle(ctx.el)
  })
  Then(/^the card reads "([^"]+)"$/, (ctx, t) => {
    expect(card(ctx)).toContain(t)
  })
  Given(/^the cue state waiting$/, async (ctx) => {
    fake(ctx)
    settings.set({ roles: ['lena'] })
    ctx.script = { scenes: [scene('s1', [line('a001', 'lena', 'Ich komme.'), line('m001', 'vater', 'Gut.')])] }
    await run(ctx)
    expect(ctx.el.dialog.cue.state).toBe('waiting')
  })
  Then(/^the cue engine receives tap$/, (ctx) => {
    expect(ctx.sent).toEqual(['tap'])
    expect(ctx.el.dialog.cue.state).toBe('playing')
  })
  Given(/^the cue effect missed$/, async (ctx) => {
    fake(ctx)
    settings.set({ roles: ['lena'] })
    ctx.script = { scenes: [scene('s1', [line('a001', 'lena', 'Ich komme.'), line('m001', 'vater', 'Gut.')])] }
    await run(ctx)
    ctx.now = 20000
    ctx.tick()
    await settle(ctx.el)
  })
  Then(/^"([^"]+)" and "([^"]+)" are visible$/, (ctx, a, b) => {
    expect(text(ctx)).toContain(a)
    expect(clickable(ctx, b)).toBeTruthy()
  })
  Given(/^the cue state song with song "(\d+)"$/, async (ctx, id) => {
    fake(ctx)
    settings.set({ roles: ['lena'] })
    ctx.songs = [{ id, number: +id, title: 'Schneelied', durationSec: 60, roles: ['lena'], files: {} }]
    ctx.script = { scenes: [scene('s1', [line('m001', 'vater', 'Hör mal.'), { id: 'g001', type: 'song', songId: id }, line('m002', 'vater', 'Schön.')])] }
    await run(ctx, 'g001')
    expect(ctx.el.dialog.cue.state).toBe('song')
  })
  Then(/^the route is "([^"]+)"$/, (ctx, hash) => {
    expect(ctx.routed.at(-1)).toBe(hash)
  })
  When(/^I come back$/, async (ctx) => {
    // the practice screen's back button routes to returnTo
    const back = ctx.c.returnTo as string
    const m = back.match(/^#\/text\/([^/]+)\/(.+)$/)!
    expect(m[1]).toBe('s1')
    await run(ctx, m[2])
  })
  Then(/^the run-through resumes at the song item$/, (ctx) => {
    expect(ctx.el.dialog.cue.state).toBe('song')
    expect(ctx.el.dialog.cue.turn[0].id).toBe('g001')
    expect(card(ctx)).toContain('Lied 4 · Schneelied')
  })
  When(/^I press the space bar$/, async (ctx) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }))
    await settle(ctx.el)
  })

  // Text settings
  Given(/^empty settings$/, async (ctx) => {
    fake(ctx)
    await mount(ctx, 'gu-text-settings')
  })
  Then(/^the sheet shows "([^"]+)", ([\d,]+ s), ([\d,]+×), directions on and loop off$/, (ctx, hint, silence, rate) => {
    expect(clickable(ctx, hint)!.getAttribute('aria-pressed')).toBe('true')
    expect(text(ctx)).toContain(silence)
    expect(clickable(ctx, rate)!.getAttribute('aria-pressed')).toBe('true')
    const box = (t: string) => (clickable(ctx, t) as HTMLLabelElement).querySelector('input') as HTMLInputElement
    expect(box('Regieanweisungen anzeigen').checked).toBe(true)
    expect(box('Szene wiederholen').checked).toBe(false)
  })
})
