import { beforeEach, expect, it } from 'vitest'
import { type AppContext, setContext } from '../src/app/context'
import { settings } from '../src/app/settings'
import type { Calibration } from '../src/core/calibration'
import '../src/app/settings-sheet'

let calls: string[]
let listeners: number
const world = (active: boolean) => {
  calls = []
  listeners = 0
  setContext({
    settings,
    engine: { latency: () => 0.0424, playing: () => false, pause: () => calls.push('pause') },
    pitch: {
      inputLatency: () => 0.008,
      devices: async () => [
        { deviceId: 'a', label: 'AirPods Pro' },
        { deviceId: 'b', label: '' },
      ],
      setDevice: async (id: string) => {
        calls.push(`device ${id}`)
        return 'ok'
      },
      active: () => active,
      start: async () => {
        calls.push('start')
        return 'ok'
      },
      stop: () => calls.push('stop'),
      on: () => {
        listeners++
        return () => void listeners--
      },
      level: () => 0.1,
      setDelayMs: (ms: number) => calls.push(`delay ${ms}`),
      clocks: () => [() => 7, () => 0],
    },
  } as unknown as AppContext)
}

async function open() {
  document.body.innerHTML = ''
  const el = document.createElement('gu-settings-sheet') as HTMLElement & { updateComplete: Promise<boolean> }
  document.body.append(el)
  await new Promise((r) => setTimeout(r, 0))
  await el.updateComplete
  return el
}

async function testAndClose() {
  const el = await open()
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

it('shows the reported latencies and their sum as the automatic delay', async () => {
  world(false)
  const el = await open()
  expect(el.shadowRoot!.textContent).toContain('Vom Browser gemeldet: Wiedergabe 42 ms · Mikrofon 8 ms')
  expect(el.shadowRoot!.textContent).toContain('50 ms (automatisch)')
})

it('lists the microphones and switches the running mic', async () => {
  world(true)
  const el = await open()
  const select = el.shadowRoot!.querySelector<HTMLSelectElement>('select#mic')!
  expect([...select.options].map((o) => o.textContent!.trim())).toEqual(['Automatisch (eingebautes Mikrofon)', 'AirPods Pro', 'Mikrofon 2'])
  select.value = 'a'
  select.dispatchEvent(new Event('change'))
  await new Promise((r) => setTimeout(r, 0))
  expect(settings.get().micDeviceId).toBe('a')
  expect(calls).toEqual(['device a'])
})

/** Opens the sheet, swaps in a calibration that ends with `result`, presses "Verzögerung messen". */
async function calibrate(result: Calibration | null) {
  const el = (await open()) as any
  el.calibrate = () => ({ done: Promise.resolve(result), cancel: () => calls.push('cancel') })
  const button = (label: string) => [...el.shadowRoot!.querySelectorAll('button')].find((b: HTMLElement) => b.textContent!.trim() === label) as HTMLElement
  button('Verzögerung messen').click()
  await new Promise((r) => setTimeout(r, 0))
  await el.updateComplete
  return { el, button }
}

it('measures the delay and uses it instead of the reported latencies', async () => {
  world(false)
  const { el } = await calibrate({ ms: 156, spreadMs: 23 })
  expect(el.shadowRoot!.textContent).toContain('Gemessen: 156 ms (±23 ms)')
  expect(settings.get().delayMs).toBe(160)
  expect(calls).toContain('delay 160')
  expect(el.shadowRoot!.querySelector('#delay').value).toBe('160')
  expect(el.shadowRoot!.textContent).not.toContain('automatisch')
  expect(calls.at(-1)).toBe('stop') // the mic is off again
})

it('asks to repeat an unclear measurement and keeps the delay', async () => {
  world(false)
  settings.set({ delayMs: 40 })
  const { el } = await calibrate(null)
  expect(el.shadowRoot!.textContent).toContain('Nicht eindeutig – bitte nochmal.')
  expect(settings.get().delayMs).toBe(40)
})

it('shows the mic level while measuring, so the user sees the phone hears them', async () => {
  world(false)
  const el = (await open()) as any
  el.calibrate = () => ({ done: new Promise(() => {}), cancel: () => {} })
  ;[...el.shadowRoot.querySelectorAll('button')].find((b: HTMLElement) => b.textContent!.trim() === 'Verzögerung messen').click()
  await new Promise((r) => setTimeout(r, 80))
  await el.updateComplete
  expect(el.shadowRoot.textContent).toContain('Messung läuft …')
  expect(el.shadowRoot.querySelector('[role="meter"]').getAttribute('aria-valuenow')).toBe('0.1')
  el.remove() // cancels the run in this world, not the next test's
})

it('restarts the practice mic with its own clocks after measuring', async () => {
  world(true)
  await calibrate({ ms: 100, spreadMs: 2 })
  expect(calls.filter((c) => c === 'start' || c === 'stop')).toEqual(['start'])
})
