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
  all(ctx).find((e) => /^(BUTTON|LABEL|A)$/.test(e.tagName) && (e.textContent!.replace(/\s+/g, ' ').trim() === t || e.getAttribute('aria-label') === t)) as
    | HTMLElement
    | undefined
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

/** Run-through of s1 with fake audio (never ends), a fake clock and a manual tick; records what the cue engine is sent and what played. */
async function run(ctx: any, itemId?: string) {
  ctx.sent = [] as string[]
  ctx.played = 0
  ctx.el = null
  document.body.innerHTML = ''
  const deps = {
    now: () => ctx.now,
    every: (_ms: number, fn: () => void) => {
      ctx.tick = fn
      return () => {}
    },
    play: () => {
      ctx.played++
      return { ended: new Promise<void>(() => {}), stop: () => {} }
    },
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

/** The play control of the paused run-through. */
async function pressPlay(ctx: any) {
  const b = all(ctx).find((e) => e.matches('.controls .main'))
  if (!b) throw new Error(`no play control in: ${text(ctx)}`)
  ;(b as HTMLElement).click()
  await settle(ctx.el)
}

/** Paused-view scene of the spec. */
function pausedScene(ctx: any) {
  fake(ctx)
  settings.set({ roles: ['lena'], dialog: { ...settings.get().dialog, hint: 'start' } })
  ctx.script = {
    scenes: [
      scene('s1', [
        line('i1', 'vater', 'Da bist du ja.'),
        line('i2', 'lena', 'Ich bin gerannt.'),
        line('i3', 'lena', 'Den ganzen Weg.'),
        line('i4', 'vater', 'Komm jetzt rein.'),
        line('i5', 'lena', 'Wir gehen gleich nach Hause'),
      ]),
      scene('s2', [line('j1', 'vater', 'Na dann.'), line('j2', 'lena', 'Bis gleich.'), line('j3', 'vater', 'Tschüss.')]),
    ],
  }
}
const repeatIn = (ctx: any, sceneId: string, from: string, to: string) => {
  pausedScene(ctx)
  settings.set({ dialogRepeats: { [sceneId]: { from, to } } })
}
const row = (ctx: any, id: string) => {
  const r = all(ctx).find((e) => e.getAttribute('data-id') === id) as HTMLElement | undefined
  if (!r) throw new Error(`no row ${id} in: ${text(ctx)}`)
  return r
}
const tap = async (ctx: any, el: HTMLElement) => {
  el.click()
  await settle(ctx.el)
}
const press = async (ctx: any, t: string) => {
  const b = clickable(ctx, t)
  if (!b) throw new Error(`no "${t}" in: ${text(ctx)}`)
  await tap(ctx, b)
}
const tapPress = async (ctx: any, id: string, t: string) => {
  await tap(ctx, row(ctx, id))
  await press(ctx, t)
}
const sheet = (ctx: any) => all(ctx).find((e) => e.matches('[role=dialog]'))
const chip = (ctx: any) => all(ctx).find((e) => e.matches('.repeat'))
/** Row id right below the `Hier geht es weiter` marker. */
const hereAt = (ctx: any) => {
  const els = all(ctx)
  const k = els.findIndex((e) => e.textContent === 'Hier geht es weiter')
  if (k < 0) throw new Error(`no marker in: ${text(ctx)}`)
  return els
    .slice(k)
    .find((e) => e.hasAttribute('data-id'))
    ?.getAttribute('data-id')
}

/** Opens the run-through of s1 at `itemId`, presses play, clears `ctx.sent`. */
async function running(ctx: any, itemId?: string) {
  await run(ctx, itemId)
  await pressPlay(ctx)
  ctx.sent = []
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
    await running(ctx)
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
  When(/^the run-through starts at "([^"]+)" and I press play$/, (ctx, t) => running(ctx, ctx.dirs[t]))
  When(/^the run-through starts at the line and I press play$/, (ctx) => running(ctx, 'm001'))
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
    await running(ctx)
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
    await running(ctx)
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
    await running(ctx)
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
    await running(ctx, 'g001')
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
    expect(ctx.c.returnTo).toBe(null) // used up: opening the song item later starts paused
  })
  When(/^I press the space bar$/, async (ctx) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }))
    await settle(ctx.el)
  })
  Given(/^scene s1 with m1 of vater, a1 of lena, m2 and m3 of vater$/, (ctx) => {
    fake(ctx)
    ctx.script = { scenes: [scene('s1', [line('m1', 'vater', 'Na?'), line('a1', 'lena', 'Ja.'), line('m2', 'vater', 'Gut.'), line('m3', 'vater', 'Schön.')])] }
  })
  Given(/^the repeat in s1 is from (\w+) to (\w+)$/, (_ctx, from, to) => settings.set({ dialogRepeats: { s1: { from, to } } }))
  When(/^the run-through (?:plays|runs at) (\w+)$/, (ctx, id) => running(ctx, id))
  Then(/^the up-next hint reads "([^"]+)"$/, (ctx, t) => {
    expect(
      all(ctx)
        .find((e) => e.matches('.next b'))
        ?.textContent?.replace(/\s+/g, ' '),
    ).toBe(t)
  })
  Then(/^no up-next hint is shown$/, (ctx) => {
    expect(ctx.el.dialog.cue.state).toBe('playing')
    expect(all(ctx).some((e) => e.matches('.next'))).toBe(false)
  })

  // Paused scene view and repeat
  Given(/^the paused-view scene$/, (ctx) => pausedScene(ctx))
  When(/^the run-through opens at s1$/, (ctx) => run(ctx))
  Given(/^the run-through paused at (s1|i\d)$/, (ctx, at) => {
    pausedScene(ctx)
    return run(ctx, at === 's1' ? undefined : at)
  })
  Given(/^repeat in s1 from (i\d) to (i\d)$/, (ctx, from, to) => {
    repeatIn(ctx, 's1', from, to)
    return run(ctx)
  })
  Given(/^repeat in s1 from (i\d) to (i\d), paused at (i\d)$/, (ctx, from, to, at) => {
    repeatIn(ctx, 's1', from, to)
    return run(ctx, at)
  })
  Given(/^repeat in (s\d) from (\w\d) to (\w\d) stored$/, (ctx, sceneId, from, to) => repeatIn(ctx, sceneId, from, to))
  Then(/^the cue state is paused and no effect ran$/, (ctx) => {
    expect(ctx.el.dialog.cue.state).toBe('paused')
    expect(ctx.el.dialog.cue.effects).toEqual([])
    expect(ctx.played).toBe(0)
  })
  Then(/^"Hier geht es weiter" stands above (i\d)$/, (ctx, id) => {
    expect(hereAt(ctx)).toBe(id)
  })
  Then(/^the flow shows i1 to i5 and "([^"]+)"$/, (ctx, hint) => {
    expect(all(ctx).flatMap((e) => e.getAttribute('data-id') ?? [])).toEqual(['i1', 'i2', 'i3', 'i4', 'i5'])
    expect(row(ctx, 'i5').textContent).toContain(hint)
    expect(text(ctx)).not.toContain('nach Hause')
  })
  Then(/^there is no back button$/, (ctx) => {
    expect(clickable(ctx, 'Zurück zum vorigen Eintrag')).toBeUndefined()
  })
  When(/^I tap (i\d)$/, (ctx, id) => tap(ctx, row(ctx, id)))
  When(/^I tap the header$/, (ctx) => tap(ctx, all(ctx).find((e) => e.tagName === 'HEADER') as HTMLElement))
  When(/^I tap (i\d) and press "([^"]+)"$/, (ctx, id, t) => tapPress(ctx, id, t))
  When(/^I set "Von" at (i\d) and "Bis" at (i\d)$/, async (ctx, a, b) => {
    await tapPress(ctx, a, 'Von')
    await tapPress(ctx, b, 'Bis')
  })
  When(/^I set "Von" at (i\d)$/, (ctx, id) => tapPress(ctx, id, 'Von'))
  When(/^I change the roles and open s1$/, (ctx) => {
    settings.set({ roles: ['vater'] })
    return run(ctx)
  })
  Then(/^a sheet shows "([^"]+)", "([^"]+)" and "([^"]+)"$/, (ctx, a, b, c) => {
    const s = sheet(ctx)
    expect(s).toBeTruthy()
    for (const t of [a, b, c]) expect(clickable(ctx, t)?.closest('[role=dialog]')).toBe(s)
  })
  Then(/^the sheet shows the text of (i\d)$/, (ctx, id) => {
    const item = ctx.script.scenes[0].items.find((i: ScriptItem) => i.id === id)
    expect(sheet(ctx)?.textContent).toContain(item.text)
  })
  Then(/^no sheet is shown$/, (ctx) => {
    expect(sheet(ctx)).toBeUndefined()
  })
  Then(/^settings\.dialogRepeats\.s1 is from (i\d)( without an end)?$/, (ctx, id, noEnd) => {
    expect(settings.get().dialogRepeats.s1).toStrictEqual({ from: id })
    if (noEnd) expect(all(ctx).some((e) => e.matches('.tag') && e.textContent === 'Bis')).toBe(false)
  })
  Then(/^the cue option repeat is from (i\d) in s1$/, (ctx, id) => {
    expect(ctx.el.dialog.options.repeat).toEqual({ sceneId: 's1', from: id })
  })
  Then(/^the chip reads "([^"]+)"$/, (ctx, t) => {
    expect(chip(ctx)?.textContent?.replace(/\s+/g, ' ').trim()).toBe(t)
  })
  Then(/^the card is marked in the range$/, (ctx) => {
    expect(
      all(ctx)
        .find((e) => e.matches('.current'))
        ?.classList.contains('in'),
    ).toBe(true)
  })
  Then(/^the tag "(Von|Bis)" is shown$/, (ctx, tag) => {
    expect(all(ctx).some((e) => e.matches('.tag') && e.textContent === tag)).toBe(true)
  })
  Then(/^no chip is shown and settings\.dialogRepeats has no s1$/, (ctx) => {
    expect(chip(ctx)).toBeUndefined()
    expect(settings.get().dialogRepeats).not.toHaveProperty('s1')
  })
  Then(/^the chip is visible$/, (ctx) => {
    expect(chip(ctx)).toBeTruthy()
  })
  Then(/^the cue engine receives resume$/, (ctx) => {
    expect(ctx.sent).toEqual(['resume'])
    expect(ctx.el.dialog.cue.state).not.toBe('paused')
  })

  // Text settings
  Given(/^empty settings$/, async (ctx) => {
    fake(ctx)
    await mount(ctx, 'gu-text-settings')
  })
  Then(/^the sheet shows "([^"]+)", ([\d,]+ s), ([\d,]+×) and directions on$/, (ctx, hint, silence, rate) => {
    expect(clickable(ctx, hint)!.getAttribute('aria-pressed')).toBe('true')
    expect(text(ctx)).toContain(silence)
    expect(clickable(ctx, rate)!.getAttribute('aria-pressed')).toBe('true')
    const box = (clickable(ctx, 'Regieanweisungen anzeigen') as HTMLLabelElement).querySelector('input') as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(text(ctx)).not.toContain('Szene wiederholen')
  })
})
