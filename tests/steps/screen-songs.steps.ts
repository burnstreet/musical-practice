import { expect } from 'vitest'
import { steps } from '../gherkin'
import { setContext, type AppContext } from '../../src/app/context'
import { settings } from '../../src/app/settings'
import type { DownloadProgress } from '../../src/core/library'
import '../../src/app/screens/songs'

const MB = 1_000_000
const meta = (id: string, roles: string[]) => ({ id, number: Number(id), title: `Lied ${id}`, durationSec: 60, roles, files: { voices: 'v', backing: 'b', notes: 'n' } })

/** Fresh fake context per scenario; also resets DOM and storage. */
function fake(ctx: any) {
  if (ctx.c) return ctx
  document.body.innerHTML = ''
  localStorage.clear()
  ctx.roles = []
  ctx.songs = []
  ctx.notReady = new Set<string>()
  ctx.badges = {} as Record<string, number>
  ctx.routed = [] as string[]
  ctx.c = {
    settings,
    route: (to: string) => ctx.routed.push(to),
    openSettings: () => {},
    library: {
      songs: () => ctx.songs,
      roles: () => ctx.roles,
      isReady: (id: string) => !ctx.notReady.has(id),
      onProgress: (fn: (p: DownloadProgress) => void) => { ctx.emit = fn },
    },
    history: { badge: async (id: string) => ctx.badges[id] ?? null },
  } as unknown as AppContext
  setContext(ctx.c)
  return ctx
}

const settle = async (el: any) => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
  await el.updateComplete
}

async function mount(ctx: any) {
  if (ctx.el) return ctx.el
  ctx.el = document.createElement('gu-songs')
  document.body.append(ctx.el)
  await settle(ctx.el)
  return ctx.el
}

const q = (ctx: any, sel: string) => ctx.el.shadowRoot.querySelector(sel) as HTMLElement | null
const text = (ctx: any) => ctx.el.shadowRoot.textContent.replace(/\s+/g, ' ')
const row = (ctx: any, n: string) => q(ctx, `[data-song="${n.padStart(2, '0')}"]`)!
const chip = (ctx: any, name: string) =>
  [...ctx.el.shadowRoot.querySelectorAll('.chip')].find((b: any) => b.textContent.trim() === name) as HTMLElement | undefined
const button = (ctx: any, name: string) =>
  [...ctx.el.shadowRoot.querySelectorAll('button, label')].find((b: any) => b.textContent.trim() === name) as HTMLElement

export default steps(({ Given, When, Then }) => {
  Given(/^roles maria \(sings\) and esel \(not sings\)$/, (ctx) => {
    fake(ctx)
    ctx.roles = [{ id: 'maria', name: 'Maria', sings: true }, { id: 'esel', name: 'Esel', sings: false }]
  })
  Given(/^song "(\d+)" with roles \[(.*)\] and song "(\d+)" with roles \[(.*)\]$/, (ctx, a, ra, b, rb) => {
    fake(ctx)
    ctx.roles = ['maria', 'chor', 'josef'].map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1), sings: true }))
    const ids = (s: string) => s.split(',').map((x) => x.trim())
    ctx.songs = [meta(b, ids(rb)), meta(a, ids(ra))]
  })
  Given(/^history badge (\d+) for song "(\d+)" with the selected roles$/, (ctx, pct, id) => {
    fake(ctx)
    ctx.songs = [meta(id, [])]
    ctx.badges[id] = Number(pct)
  })
  Given(/^song "(\d+)" not ready$/, async (ctx, id) => {
    fake(ctx)
    ctx.songs = [meta(id, [])]
    ctx.notReady.add(id)
    await mount(ctx)
  })
  Given(/^sync at (\d+) of (\d+) MB$/, async (ctx, done, total) => {
    fake(ctx)
    await mount(ctx)
    ctx.emit({ doneBytes: Number(done) * MB, totalBytes: Number(total) * MB, readySongs: [], done: false })
    await settle(ctx.el)
  })
  Given(/^row (\d+) expanded with "([^"]+)" chosen$/, async (ctx, n, mode) => {
    fake(ctx)
    ctx.songs = [meta(n.padStart(2, '0'), [])]
    await mount(ctx)
    row(ctx, n).click()
    await settle(ctx.el)
    button(ctx, mode).click()
    await settle(ctx.el)
  })

  When(/^the screen renders$/, async (ctx) => { await mount(ctx) })
  When(/^I select "([^"]+)"$/, async (ctx, name) => {
    await mount(ctx)
    chip(ctx, name)!.click()
    await settle(ctx.el)
  })
  When(/^sync finishes without error$/, async (ctx) => {
    ctx.emit({ doneBytes: 95 * MB, totalBytes: 95 * MB, readySongs: [], done: true })
    await settle(ctx.el)
  })
  When(/^I press "([^"]+)"$/, async (ctx, name) => {
    button(ctx, name).click()
    await settle(ctx.el)
  })

  Then(/^a chip "([^"]+)" exists and no chip "([^"]+)"$/, (ctx, yes, no) => {
    expect(chip(ctx, yes)).toBeTruthy()
    expect(chip(ctx, no)).toBeUndefined()
  })
  Then(/^row (\d+) shows the marker and row (\d+) does not$/, (ctx, a, b) => {
    expect(row(ctx, a).querySelector('.dot')).toBeTruthy()
    expect(row(ctx, b).querySelector('.dot')).toBeNull()
    expect(settings.get().roles).toEqual(['maria'])
  })
  Then(/^row (\d+) shows "([^"]+)"$/, (ctx, n, t) => { expect(row(ctx, n).textContent).toContain(t) })
  Then(/^row (\d+) shows "([^"]+)" and does not expand on tap$/, async (ctx, n, t) => {
    expect(row(ctx, n).textContent).toContain(t)
    row(ctx, n).click()
    await settle(ctx.el)
    expect(text(ctx)).not.toContain('Üben starten')
  })
  Then(/^"([^"]+)" is visible$/, (ctx, t) => { expect(text(ctx)).toContain(t) })
  Then(/^the progress bar is hidden$/, (ctx) => { expect(q(ctx, '.progress')).toBeNull() })
  Then(/^settings\.mode is "(\w+)" and the route is "([^"]+)"$/, (ctx, mode, route) => {
    expect(settings.get().mode).toBe(mode)
    expect(ctx.routed).toEqual([route])
  })
})
