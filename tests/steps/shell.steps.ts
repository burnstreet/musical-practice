import { expect } from 'vitest'
import type { ShellDeps } from '../../src/app/context'
import type { GuApp } from '../../src/app/shell'
import type { VaultState } from '../../src/core/vault'
import { production } from '../../src/production'
import { steps } from '../gherkin'
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
      lock: async () => {
        for (const w of wipes) await w()
        ctx.state = 'locked'
      },
      onWipe: (fn: () => Promise<void>) => void wipes.push(fn),
    },
    library: {
      fetchManifest: async () => null,
      sizeInfo: () => null,
      sync: async () => {},
      fetchLibraryCipher: async () => null,
      onProgress: () => {},
      songs: () => [],
      roles: () => [],
      isReady: (id: string) => ctx.ready.has(id),
      getSong: async () => {
        throw new Error('fake')
      },
      wipe: async () => {},
    },
    history: { record: async () => {}, list: async () => [], badge: async () => null, wipe: async () => {} },
    engine: { latency: () => 0 } as any,
    pitch: { devices: async () => [], inputLatency: () => 0 } as any,
    sw: { activateWaiting: async () => false },
    isIosSafariTab: () => false,
  } as ShellDeps
  return ctx.deps
}

const settle = async (el: GuApp) => {
  // a few macrotasks: async handlers (lock, hashchange) chain several awaits
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
  await el.updateComplete
}

/** Visible text across shadow roots. */
const deepText = (n: Node): string =>
  n.nodeType === Node.TEXT_NODE ? (n.textContent ?? '') : [...((n as Element).shadowRoot?.childNodes ?? []), ...n.childNodes].map(deepText).join(' ')

/** All elements across shadow roots. */
const deepAll = (n: Element | ShadowRoot): Element[] => [...n.children].flatMap((c) => [c, ...(c.shadowRoot ? deepAll(c.shadowRoot) : []), ...deepAll(c)])

/** Clickable element (button, label) whose text is exactly t. */
const byText = (root: Element, t: string) => {
  const hit = deepAll(root.shadowRoot!).find((e) => /^(BUTTON|LABEL)$/.test(e.tagName) && e.textContent!.trim() === t) as HTMLElement | undefined
  if (!hit) throw new Error(`no button "${t}" in: ${deepText(root)}`)
  return hit
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
  Given(/^vault state (locked|unlocked)$/, (ctx, st) => {
    deps(ctx)
    ctx.state = st
  })
  Given(/^vault unlocked and song "(\w+)" not ready$/, (ctx) => {
    deps(ctx)
    ctx.state = 'unlocked'
  })

  When(/^I open "([^"]+)"$/, async (ctx, hash) => {
    const el = await app(ctx)
    location.hash = hash
    await settle(el)
  })

  // Updates: fake worker control; the shell only ever asks it at launch
  const fakeSw = (ctx: any, waiting: boolean) => {
    ctx.sw = { waiting, active: false, activateWaiting: async () => (ctx.sw.active = ctx.sw.waiting) }
    deps(ctx).sw = ctx.sw
  }
  Given(/^a new service worker was installed during the previous run$/, (ctx) => fakeSw(ctx, true))
  When(/^the app launches$/, (ctx) => app(ctx))
  Then(/^the new worker is active and a toast "([^"]+)" shows$/, (ctx, msg) => {
    expect(ctx.sw.active).toBe(true)
    expect(deepText(ctx.el)).toContain(msg)
  })
  Given(/^a practice session running$/, async (ctx) => {
    fakeSw(ctx, false)
    ctx.ready.add('05')
    location.hash = '#/practice/05'
    await app(ctx)
  })
  When(/^a new service worker finishes installing$/, async (ctx) => {
    ctx.sw.waiting = true
    await settle(ctx.el)
  })
  Then(/^no toast, no reload, route unchanged$/, (ctx) => {
    expect(ctx.sw.active).toBe(false)
    expect(deepText(ctx.el)).not.toContain('Neue Version geladen')
    expect(location.hash).toBe('#/practice/05')
  })

  // Settings
  const press = async (ctx: any, t: string) => {
    byText(ctx.el, t).click()
    await settle(ctx.el)
  }
  const openSettings = async (ctx: any) => {
    const el = await app(ctx)
    el.ctx.openSettings()
    await settle(el)
  }
  When(/^I choose "([^"]+)"$/, async (ctx, t) => {
    await openSettings(ctx)
    await press(ctx, t)
  })
  Then(/^settings\.tolerance is (\d+) after reload$/, async (_ctx, n) => {
    const { settings } = await import('../../src/app/settings')
    expect(JSON.parse(localStorage.getItem(`${production.storageId}.settings`)!).tolerance).toBe(+n)
    expect(settings.get().tolerance).toBe(+n)
  })
  Given(/^unlocked with songs stored$/, (ctx) => {
    const d = deps(ctx)
    ctx.files = new Set(['a', 'b'])
    ctx.sessions = ['s1']
    d.vault.onWipe(async () => ctx.files.clear())
    d.vault.onWipe(async () => {
      ctx.sessions = []
    })
  })
  When(/^I press "Sperren und Daten löschen" and (?:confirm|choose) "([^"]+)"$/, async (ctx, choice) => {
    ctx.files ??= new Set(['a'])
    await openSettings(ctx)
    await press(ctx, 'Sperren und Daten löschen')
    expect(deepText(ctx.el)).toContain('Alle Lieder und Ergebnisse werden von diesem Gerät gelöscht. Fortfahren?')
    await press(ctx, choice)
  })
  Then(/^vault is locked, library has no files, history empty, route is "([^"]+)"$/, (ctx, hash) => {
    expect(ctx.state).toBe('locked')
    expect(ctx.files.size).toBe(0)
    expect(ctx.sessions).toEqual([])
    expect(location.hash).toBe(hash)
    expect(ctx.el.hash).toBe(hash)
  })
  Then(/^nothing changes$/, (ctx) => {
    expect(ctx.state).toBe('unlocked')
    expect(ctx.files.size).toBe(1)
    expect(location.hash).toBe('#/songs')
    expect(deepText(ctx.el)).not.toContain('Fortfahren?')
  })

  // Headphone sheet: "start practice" = what the practice screen does before play
  const startPractice = async (ctx: any) => {
    const el = await app(ctx)
    ctx.played = false
    ctx.gate = el.ctx.ensureHeadphoneSheet().then(() => {
      ctx.played = true
    })
    await settle(el)
  }
  const sheetShown = (ctx: any) => deepText(ctx.el).includes('Kopfhörer aufsetzen')
  Given(/^headphoneSheetSeen (true|false)$/, async (ctx, v) => {
    deps(ctx)
    const { settings } = await import('../../src/app/settings')
    settings.set({ headphoneSheetSeen: v === 'true' })
  })
  When(/^I (?:start practice and )?press "Weiter" (with|without) (?:"Nicht mehr anzeigen" checked|the checkbox)$/, async (ctx, w) => {
    await startPractice(ctx)
    expect(sheetShown(ctx)).toBe(true)
    expect(ctx.played).toBe(false)
    if (w === 'with') byText(ctx.el, 'Nicht mehr anzeigen').querySelector('input')!.click()
    await press(ctx, 'Weiter')
    await ctx.gate
  })
  Then(/^playback starts and the sheet never shows again$/, async (ctx) => {
    expect(ctx.played).toBe(true)
    expect(sheetShown(ctx)).toBe(false)
    await startPractice(ctx)
    await ctx.gate
    expect(sheetShown(ctx)).toBe(false)
  })
  Then(/^the sheet shows again at the next practice start$/, async (ctx) => {
    expect(ctx.played).toBe(true)
    await startPractice(ctx)
    expect(sheetShown(ctx)).toBe(true)
  })

  // Install hint: real UA detection behind the injected function
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
  const CARD = 'Zum Startbildschirm hinzufügen, damit die Lieder gespeichert bleiben: Teilen-Symbol, dann „Zum Home-Bildschirm“.'
  const reload = async (ctx: any) => {
    ctx.el.remove()
    ctx.el = null
    return app(ctx)
  }
  Given(/^user agent iOS Safari, not standalone, installHintSeen false$/, async (ctx) => {
    const { isIosSafariTab } = await import('../../src/app/platform')
    deps(ctx).isIosSafariTab = () => isIosSafariTab(IOS, false)
  })
  Then(/^the songs screen shows the install card$/, async (ctx) => {
    await app(ctx)
    expect(location.hash).toBe('#/songs')
    expect(deepText(ctx.el)).toContain(CARD)
  })
  When(/^I press "Verstanden"$/, (ctx) => press(ctx, 'Verstanden'))
  Then(/^the card is gone after reload$/, async (ctx) => {
    expect(deepText(ctx.el)).not.toContain(CARD)
    await reload(ctx)
    expect(deepText(ctx.el)).not.toContain(CARD)
  })
  Given(/^Android Chrome, or iOS standalone$/, async (ctx) => {
    const { isIosSafariTab } = await import('../../src/app/platform')
    ctx.variants = [() => isIosSafariTab(ANDROID, false), () => isIosSafariTab(IOS, true)]
  })
  Then(/^no install card$/, async (ctx) => {
    for (const v of ctx.variants) {
      deps(ctx).isIosSafariTab = v
      await (ctx.el ? reload(ctx) : app(ctx))
      expect(location.hash).toBe('#/songs')
      expect(deepText(ctx.el)).not.toContain(CARD)
    }
  })

  Then(/^the route is "([^"]+)"$/, (ctx, hash) => {
    expect(location.hash).toBe(hash)
    expect(ctx.el.hash).toBe(hash)
  })
})
