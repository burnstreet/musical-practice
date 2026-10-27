import { expect } from 'vitest'
import { steps } from '../gherkin'
import type { ShellDeps } from '../../src/app/context'
import type { GuApp } from '../../src/app/shell'
import type { VaultState } from '../../src/core/vault'
import '../../src/app/shell'

/** Fresh fake deps per scenario; also resets DOM, storage and hash. */
function deps(ctx: any): ShellDeps {
  if (ctx.deps) return ctx.deps
  document.body.innerHTML = ''
  localStorage.clear()
  history.replaceState(null, '', '#')
  ctx.state = 'unlocked' as VaultState
  ctx.ready = new Set<string>()
  const wipes: (() => Promise<void>)[] = []
  ctx.deps = {
    vault: {
      init: async () => ctx.state,
      unlock: async () => 'ok',
      state: () => ctx.state,
      decrypt: async (c: ArrayBuffer) => c,
      lock: async () => { for (const w of wipes) await w(); ctx.state = 'locked' },
      onWipe: (fn: () => Promise<void>) => void wipes.push(fn),
    },
    library: {
      fetchManifest: async () => null,
      sizeInfo: () => null,
      sync: async () => {},
      onProgress: () => {},
      songs: () => [],
      roles: () => [],
      isReady: (id: string) => ctx.ready.has(id),
      getSong: async () => { throw new Error('fake') },
      wipe: async () => {},
    },
    history: { record: async () => {}, list: async () => [], badge: async () => null, wipe: async () => {} },
    engine: {} as any,
    pitch: {} as any,
    sw: { activateWaiting: async () => false },
    isIosSafariTab: () => false,
  } as ShellDeps
  return ctx.deps
}

const settle = async (el: GuApp) => {
  await new Promise((r) => setTimeout(r, 0))
  await el.updateComplete
}

async function app(ctx: any): Promise<GuApp> {
  if (ctx.el) return ctx.el
  const { GuApp } = await import('../../src/app/shell')
  GuApp.deps = deps(ctx)
  ctx.el = document.createElement('gu-app') as GuApp
  document.body.append(ctx.el)
  await ctx.el.ready
  await settle(ctx.el)
  return ctx.el
}

export default steps(({ Given, When, Then }) => {
  Given(/^vault state (locked|unlocked)$/, (ctx, st) => { deps(ctx); ctx.state = st })
  Given(/^vault unlocked and song "(\w+)" not ready$/, (ctx) => { deps(ctx); ctx.state = 'unlocked' })

  When(/^I open "([^"]+)"$/, async (ctx, hash) => {
    const el = await app(ctx)
    location.hash = hash
    await settle(el)
  })

  Then(/^the route is "([^"]+)"$/, (ctx, hash) => {
    expect(location.hash).toBe(hash)
    expect(ctx.el.hash).toBe(hash)
  })
})
