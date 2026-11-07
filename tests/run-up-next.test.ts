import { beforeEach, expect, it } from 'vitest'
import { type AppContext, setContext } from '../src/app/context'
import type { GuRun } from '../src/app/screens/run'
import { settings } from '../src/app/settings'
import { CUE_DEFAULTS, type CueRepeat, cueStart } from '../src/core/cue'
import type { ScriptItem } from '../src/core/types'
import '../src/app/screens/run'

const line = (id: string, role: string): ScriptItem => ({ id, type: 'line', role, text: `Text ${id}`, audio: '0000000000000000' })
const script = { scenes: [{ id: 's1', title: '', items: [line('m001', 'vater'), line('a001', 'lena'), line('m002', 'vater')] }] }

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  settings.set({ roles: ['lena'] })
  setContext({
    settings,
    route: () => {},
    library: {
      songs: () => [],
      roles: () => [
        { id: 'lena', name: 'Lena', speaks: true },
        { id: 'vater', name: 'Vater', speaks: true },
      ],
      getScript: async () => ({ script, audio: async () => new Blob() }),
    },
    pitch: { start: async () => 'ok', stop: () => {}, on: () => () => {}, level: () => 0, active: () => false },
  } as unknown as AppContext)
})

/** Run-through playing `itemId` with the cue option `repeat`; returns the `Gleich du` hint, '' when none. */
async function upNext(itemId: string, repeat: CueRepeat | null) {
  const deps = { now: () => 0, every: () => () => {}, play: () => ({ ended: new Promise<void>(() => {}), stop: () => {} }) }
  const el = Object.assign(document.createElement('gu-run') as GuRun, { sceneId: 's1', deps })
  document.body.append(el)
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
  const cue = cueStart(script, { roles: ['lena'], ...CUE_DEFAULTS, showDirections: true, repeat }, { sceneId: 's1', itemId }, 0)
  expect(cue.state).toBe('playing')
  el.dialog = { ...el.dialog!, cue }
  await el.updateComplete
  return el.shadowRoot!.querySelector('.next b')?.textContent?.replace(/\s+/g, ' ') ?? ''
}

it('my turn next, no repeat', async () => {
  expect(await upNext('m001', null)).toBe('Gleich du · Lena, 1 Zeile')
})

it('my turn is the last turn of the repeat: dann wieder von vorn', async () => {
  expect(await upNext('m001', { sceneId: 's1', from: 'm001', to: 'a001' })).toBe('Gleich du · Lena, 1 Zeile · dann wieder von vorn')
})

it('the repeat wraps into my turn', async () => {
  expect(await upNext('m002', { sceneId: 's1', from: 'a001', to: 'm002' })).toBe('Gleich du · Lena, 1 Zeile')
})

it('next turn of another role: no hint', async () => {
  expect(await upNext('m002', null)).toBe('')
})
