import { beforeEach, expect, it } from 'vitest'
import { setContext, type AppContext } from '../src/app/context'
import { settings } from '../src/app/settings'
import '../src/app/settings-sheet'

let calls: string[]
let listeners: number
const world = (active: boolean) => {
  calls = []
  listeners = 0
  setContext({
    settings,
    pitch: {
      active: () => active,
      start: async () => { calls.push('start'); return 'ok' },
      stop: () => calls.push('stop'),
      on: () => { listeners++; return () => void listeners-- },
      level: () => 0,
      setOffsetMs: () => {},
    },
  } as unknown as AppContext)
}

async function testAndClose() {
  document.body.innerHTML = ''
  const el = document.createElement('gu-settings-sheet') as HTMLElement & { updateComplete: Promise<boolean> }
  document.body.append(el)
  await el.updateComplete
  const button = (label: string) => [...el.shadowRoot!.querySelectorAll('button')].find((b) => b.textContent!.trim() === label)!
  button('Mikrofon testen').click()
  await new Promise((r) => setTimeout(r, 0))
  await el.updateComplete
  expect(listeners).toBe(1)
  el.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Schließen"]')!.click()
}

beforeEach(() => localStorage.clear())

it('mic test during practice listens to the running mic and leaves it on', async () => {
  world(true)
  await testAndClose()
  expect(calls).toEqual([])
  expect(listeners).toBe(0)
})

it('mic test without practice starts and stops the mic', async () => {
  world(false)
  await testAndClose()
  expect(calls).toEqual(['start', 'stop'])
  expect(listeners).toBe(0)
})
