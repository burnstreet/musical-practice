import { expect, vi } from 'vitest'
import { steps } from '../gherkin'
import { setContext, type AppContext } from '../../src/app/context'
import type { VaultState, UnlockResult } from '../../src/core/vault'
import '../../src/app/screens/start'

const manifest = { library: 'lib', keyId: 'k', salt: '', iterations: 1, totalBytes: 95400000, songCount: 1, files: {} }

/** Fake context per scenario; resets DOM and hash. */
function fake(ctx: any) {
  if (ctx.c) return ctx.c as AppContext
  document.body.innerHTML = ''
  history.replaceState(null, '', '#/start')
  ctx.state = 'locked' as VaultState
  ctx.answer = 'ok' as UnlockResult
  ctx.size = null
  ctx.synced = false
  ctx.routed = ''
  ctx.c = {
    vault: { state: () => ctx.state, unlock: async () => ctx.answer },
    library: {
      fetchManifest: async () => (ctx.size ? manifest : null),
      sizeInfo: () => (ctx.size ? { songCount: 1, totalBytes: ctx.size } : null),
      sync: async () => { ctx.synced = true },
      fetchLibraryCipher: async () => new ArrayBuffer(1),
      songs: () => [{ id: 's', title: '[Titel]' }],
    },
    route: (to: string) => { ctx.routed = to },
  } as unknown as AppContext
  setContext(ctx.c)
  return ctx.c
}

const tick = async (el: any) => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
  await el.updateComplete
}

async function render(ctx: any) {
  if (ctx.el) return ctx.el
  fake(ctx)
  ctx.el = document.createElement('gu-start')
  document.body.append(ctx.el)
  await tick(ctx.el)
  return ctx.el
}

const text = (ctx: any) => ctx.el.shadowRoot.textContent as string

export default steps(({ Given, When, Then }) => {
  Given(/^a manifest with totalBytes (\d+)$/, (ctx, n) => { fake(ctx); ctx.size = Number(n) })
  When(/^the start screen renders$/, (ctx) => render(ctx))
  Then(/^it shows "([^"]+)"$/, (ctx, s) => expect(text(ctx).replace(/\s+/g, ' ')).toContain(s))

  Given(/^the vault answers (wrong-password|ok)$/, (ctx, a) => { fake(ctx); ctx.size = 1e6; ctx.answer = a })
  When(/^I submit "([^"]*)"$/, async (ctx, pw) => {
    const el = await render(ctx)
    const input = el.shadowRoot.querySelector('input') as HTMLInputElement
    input.value = pw
    input.dispatchEvent(new Event('input'))
    await el.updateComplete
    el.shadowRoot.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
    await tick(el)
  })
  When(/^I submit the password$/, async (ctx) => {
    const el = await render(ctx)
    const input = el.shadowRoot.querySelector('input') as HTMLInputElement
    input.value = 'geheim'
    input.dispatchEvent(new Event('input'))
    await el.updateComplete
    el.shadowRoot.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
    await tick(el)
  })
  Then(/^"([^"]+)" is visible, the field is empty and focused, and no song title is anywhere in the DOM$/, (ctx, s) => {
    expect(text(ctx)).toContain(s)
    const input = ctx.el.shadowRoot.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('')
    expect(ctx.el.shadowRoot.activeElement).toBe(input)
    expect(document.body.textContent + text(ctx)).not.toContain('[Titel]')
  })
  Then(/^library\.sync was called and the route is "([^"]+)"$/, (ctx, r) => {
    expect(ctx.synced).toBe(true)
    expect(ctx.routed).toBe(r)
  })

  Given(/^vault state password-changed$/, (ctx) => { fake(ctx); ctx.state = 'password-changed' })
  Then(/^"([^"]+)" is visible$/, (ctx, s) => expect(text(ctx)).toContain(s))
})
