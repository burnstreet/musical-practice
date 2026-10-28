import { expect, it } from 'vitest'
import { type AppContext, setContext } from '../src/app/context'
import type { GuPractice } from '../src/app/screens/practice'
import { settings } from '../src/app/settings'
import '../src/app/screens/practice'

// After "Phrase n bei 80 % üben" the engine runs at 80 % looped; practice must show that, not its defaults.
it('practice shows the engine tempo and loop it enters with', async () => {
  document.body.innerHTML = ''
  localStorage.clear()
  settings.set({ roles: ['maria'] })
  const phrase = { index: 0, label: 'p0', start: 0, end: 3 }
  const song = {
    id: '08',
    bpm: 100,
    key: 'F',
    timeSig: [4, 4],
    bars: [0, 2],
    phrases: [phrase],
    notes: [{ midi: 74, start: 1, end: 2, role: 'maria', phrase: 0, syllable: 'la', bar: 0, beat: 2, dur: 1 }],
  }
  const loaded = {
    meta: { id: '08', number: 8, title: '[Titel]', durationSec: 10, roles: ['maria'], files: {} },
    song,
    voices: new Blob(),
    backing: new Blob(),
  }
  setContext({
    library: { roles: () => [{ id: 'maria', name: 'Maria', sings: true }], getSong: async () => loaded },
    engine: { load: async () => {}, setMode: () => {}, on: () => {}, time: () => 0, tempo: () => 80, loop: () => phrase },
    pitch: { start: async () => 'ok', on: () => () => {}, stop: () => {}, delay: () => 0 },
    settings,
    live: null,
    route: () => {},
    openSettings: () => {},
  } as unknown as AppContext)
  const el = document.createElement('gu-practice') as GuPractice
  el.songId = '08'
  document.body.append(el)
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
  await el.updateComplete
  const root = el.shadowRoot!
  expect(root.querySelector('[aria-label="Tempo 80 Prozent"]')?.textContent?.trim()).toBe('80%')
  expect(root.querySelector('[aria-label="Phrase wiederholen"]')?.getAttribute('aria-pressed')).toBe('true')
  expect(root.textContent).toContain('· F · 80 BPM')
})
