import { expect } from 'vitest'
import { type AppContext, setContext } from '../../src/app/context'
import type { GuPractice } from '../../src/app/screens/practice'
import { settings } from '../../src/app/settings'
import type { Note, Song, SongMeta } from '../../src/core/content'
import type { PitchFrame } from '../../src/core/types'
import { steps } from '../gherkin'
import '../../src/app/screens/practice'

const note = (midi: number, start: number, end: number, role: Note['role'], phrase: number, syllable = 'la'): Note => ({
  midi,
  start,
  end,
  role,
  phrase,
  syllable,
  bar: Math.floor(start / 2),
  beat: 0,
  dur: 1,
})

/** 16 bars of 2 s. Josef sings in phrase 0, Maria D5 then F5 in phrase 1. */
function fixture(): { meta: SongMeta; song: Song } {
  return {
    meta: { id: '08', number: 8, title: '[Titel]', durationSec: 135, roles: ['josef', 'maria', 'esel'], files: { voices: 'v', backing: 'b', notes: 'n' } },
    song: {
      id: '08',
      bpm: 93,
      key: 'F',
      timeSig: [4, 4],
      bars: Array.from({ length: 16 }, (_, i) => i * 2),
      notes: [note(69, 1, 2, 'josef', 0), note(74, 8, 9.5, 'maria', 1, 'ge'), note(77, 10, 11, 'maria', 1)],
      phrases: [
        { index: 0, label: 'p0', start: 0, end: 3 },
        { index: 1, label: 'p1', start: 8, end: 11 },
      ],
    },
  }
}

/** Fresh fakes per scenario; also resets DOM, storage and hash. */
function world(ctx: any) {
  if (ctx.app) return ctx
  document.body.innerHTML = ''
  localStorage.clear()
  history.replaceState(null, '', '#/practice/08')
  settings.set({ roles: ['maria'] })
  ctx.data = fixture()
  ctx.calls = [] as string[]
  ctx.time = 0
  ctx.playing = false
  ctx.startResult = 'ok'
  ctx.recorded = null
  const on = (store: Record<string, ((x: any) => void)[]>) => (ev: string, fn: (x: any) => void) => {
    if (!store[ev]) store[ev] = []
    store[ev].push(fn)
  }
  ctx.engineL = {} as Record<string, ((x: any) => void)[]>
  ctx.pitchL = {} as Record<string, ((x: any) => void)[]>
  const log = (s: string) => ctx.calls.push(s)
  ctx.app = {
    vault: {} as any,
    library: {
      roles: () => [
        { id: 'josef', name: 'Josef', sings: true },
        { id: 'maria', name: 'Maria', sings: true },
        { id: 'esel', name: 'Esel', sings: true },
      ],
      getSong: async (id: string) => ({ ...ctx.data, voices: new Blob(), backing: new Blob(), id }),
    } as any,
    history: {
      record: async (id: string, roles: string[], passes: unknown[]) => {
        ctx.recorded = { id, roles, passes }
      },
    } as any,
    engine: {
      load: async () => log('load'),
      unload: () => log('unload'),
      play: async () => {
        log('play')
        ctx.playing = true
      },
      pause: () => {
        log('pause')
        ctx.playing = false
      },
      seek: (s: number) => {
        log(`seek ${s}`)
        ctx.time = s
      },
      setMode: (m: string) => {
        log(`mode ${m}`)
        ctx.mode = m
      },
      setTempo: (t: number) => {
        log(`tempo ${t}`)
        ctx.tempo = t
      },
      setLoop: (p: unknown) => {
        ctx.loop = p
      },
      tempo: () => ctx.tempo ?? 100,
      loop: () => ctx.loop ?? null,
      time: () => ctx.time,
      playing: () => ctx.playing,
      latency: () => ctx.latency ?? 0,
      on: on(ctx.engineL),
    },
    pitch: {
      start: async (...args: (() => number)[]) => {
        log('pitch.start')
        ctx.startArgs = args
        return ctx.startResult
      },
      stop: () => log('pitch.stop'),
      setOffsetMs: () => {},
      on: (ev: string, fn: (x: any) => void) => {
        on(ctx.pitchL)(ev, fn)
        return () => {}
      },
      level: () => 0,
      active: () => false,
    },
    sw: {} as any,
    isIosSafariTab: () => false,
    settings,
    live: null,
    route: (to: string) => {
      location.hash = to
    },
    openSettings: () => {},
    ensureHeadphoneSheet: async () => {},
  } as AppContext
  setContext(ctx.app)
  return ctx
}

const settle = async (el: GuPractice) => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
  await el.updateComplete
}

async function screen(ctx: any): Promise<GuPractice> {
  world(ctx)
  if (ctx.el) return ctx.el
  ctx.el = document.createElement('gu-practice') as GuPractice
  ctx.el.songId = '08'
  document.body.append(ctx.el)
  await settle(ctx.el)
  return ctx.el
}

const text = (el: Element) => el.shadowRoot!.textContent!.replace(/\s+/g, ' ')
const byLabel = (el: Element, label: string) => el.shadowRoot!.querySelector<HTMLElement>(`[aria-label="${label}"]`)

async function tick(ctx: any, t: number) {
  ctx.time = t
  ctx.engineL.tick?.forEach((fn: (t: number) => void) => {
    fn(t)
  })
  await settle(ctx.el)
}

async function frame(ctx: any, f: Partial<PitchFrame>) {
  ctx.pitchL.frame?.forEach((fn: (f: PitchFrame) => void) => {
    fn({ t: ctx.time, midi: null, clarity: 1, rms: 0.1, ...f })
  })
  await settle(ctx.el)
}

export default steps(({ Given, When, Then }) => {
  Given(/^song "(\w+)" loaded with key "(\w+)", bpm (\d+), title placeholder$/, (ctx, _id, key, bpm) => {
    world(ctx)
    Object.assign(ctx.data.song, { key, bpm: +bpm })
  })
  When(/^the screen renders at bar (\d+)$/, async (ctx, bar) => {
    await screen(ctx)
    await tick(ctx, ctx.data.song.bars[+bar - 1] + 0.5)
  })
  Then(/^the subline reads "([^"]+)"$/, (ctx, s) => {
    expect(text(ctx.el)).toContain(s)
    expect(text(ctx.el)).toContain('Lied 8 · [Titel]')
  })

  const button = (ctx: any, has: string) => {
    const b = [...ctx.el.shadowRoot!.querySelectorAll('button')].find((b: HTMLElement) => b.textContent!.includes(has)) as HTMLButtonElement | undefined
    if (!b) throw new Error(`no button with "${has}" in: ${text(ctx.el)}`)
    return b
  }
  const tap = async (ctx: any, b: HTMLElement, n = 1) => {
    for (let i = 0; i < n; i++) {
      b.click()
      await settle(ctx.el)
    }
  }

  Given(/^mode (all|others|backing)$/, (ctx, m) => {
    world(ctx)
    settings.set({ mode: m as any })
  })
  When(/^I tap the voicetrack button twice$/, async (ctx) => {
    await screen(ctx)
    expect(ctx.mode).toBe('all')
    await tap(ctx, button(ctx, 'Voicetrack'), 2)
  })
  Then(/^the button shows "([^"]+)" and engine mode is (\w+)$/, (ctx, label, m) => {
    expect(button(ctx, 'Voicetrack').textContent).toContain(label)
    expect(ctx.mode).toBe(m)
    expect(settings.get().mode).toBe(m)
  })

  // Readout: playhead inside Maria's D5 (8–9.5 s)
  Given(/^target D5 and a sung frame (?:(\d+) cents above|at D4 plus (\d+) cents)$/, async (ctx, above, d4) => {
    await screen(ctx)
    await tick(ctx, 8.5)
    await frame(ctx, { midi: above ? 74 + +above / 100 : 62 + +d4 / 100 })
  })
  Given(/^a sung frame (\d+) cents (above|below)(?: with tolerance (\d+))?$/, async (ctx, n, dir, tol) => {
    if (tol) settings.set({ tolerance: +tol as any })
    await frame(ctx, { midi: 74 + ((dir === 'above' ? 1 : -1) * +n) / 100 })
  })
  Then(/^the readout shows (".+)$/, (ctx, list) => {
    for (const [, s] of list.matchAll(/"([^"]+)"/g)) {
      if (/^[A-G]#?\d$/.test(s))
        expect(ctx.el.shadowRoot!.querySelector('.readout big')!.textContent).toBe(s) // the sung note, not the "Ziel" label
      else expect(text(ctx.el)).toContain(s)
    }
  })

  // Passes
  const press = async (ctx: any, label: string) => {
    const b = byLabel(ctx.el, label)
    if (!b) throw new Error(`no "${label}" in: ${ctx.el.shadowRoot!.innerHTML}`)
    await tap(ctx, b)
  }
  const play = (ctx: any) => press(ctx, 'Abspielen')
  const enterNote = async (ctx: any, i: number) => {
    const n = ctx.data.song.notes[i]
    ctx.engineL.enter?.forEach((fn: (n: Note) => void) => {
      fn(n)
    })
    await tick(ctx, n.start + 0.5)
    await frame(ctx, { midi: n.midi })
  }
  const pass = async (ctx: any) => {
    await play(ctx)
    await enterNote(ctx, 1)
    await press(ctx, 'Pause und Auswertung')
  }
  Given(/^a pass with (at least one|no) entered note$/, async (ctx, which) => {
    await screen(ctx)
    await play(ctx)
    expect(ctx.playing).toBe(true)
    if (which !== 'no') await enterNote(ctx, 1)
  })
  When(/^I press pause$/, (ctx) => press(ctx, 'Pause und Auswertung'))
  Then(/^session\.endPass ran and the route is "([^"]+)"$/, (ctx, hash) => {
    expect(ctx.app.live.session.passes()).toHaveLength(1)
    expect(location.hash).toBe(hash)
  })
  Then(/^the route stays and playback is paused$/, (ctx) => {
    expect(location.hash).toBe('#/practice/08')
    expect(ctx.playing).toBe(false)
    expect(byLabel(ctx.el, 'Abspielen')).not.toBeNull()
  })

  // Mic and roles
  Given(/^engine latency ([\d.]+)$/, (ctx, s) => {
    world(ctx).latency = +s
  })
  When(/^the screen opens$/, (ctx) => screen(ctx))
  Then(/^pitch\.start got the song time and a playback latency of ([\d.]+)$/, (ctx, s) => {
    ctx.time = 12
    expect(ctx.startArgs[0]()).toBe(12)
    expect(ctx.startArgs[1]()).toBeCloseTo(+s, 6)
  })
  Given(/^pitch\.start returns (denied|unsupported)$/, (ctx, r) => {
    world(ctx).startResult = r
  })
  Then(/^the banner "([^"]+)" is visible and play works$/, async (ctx, banner) => {
    await screen(ctx)
    expect(text(ctx.el)).toContain(banner)
    expect(byLabel(ctx.el, 'Mikrofon aus')).not.toBeNull()
    await play(ctx)
    expect(ctx.playing).toBe(true)
    await enterNote(ctx, 1)
    await press(ctx, 'Pause und Auswertung')
    expect(location.hash).toBe('#/practice/08') // results disabled
  })
  Given(/^roles \[(\w+)\] selected for song "(\w+)"$/, (ctx, role) => {
    world(ctx)
    settings.set({ roles: [role as any], mode: 'others' })
  })
  Then(/^the hint "([^"]+)" is visible, no mic button, mode is all$/, async (ctx, hint) => {
    await screen(ctx)
    expect(text(ctx.el)).toContain(hint)
    expect(byLabel(ctx.el, 'Mikrofon aktiv') ?? byLabel(ctx.el, 'Mikrofon aus')).toBeNull()
    expect(ctx.calls).not.toContain('pitch.start')
    expect(ctx.mode).toBe('all')
    expect(button(ctx, 'Voicetrack').textContent).toContain('alle Stimmen')
    await play(ctx)
    await press(ctx, 'Pause und Auswertung')
    expect(location.hash).toBe('#/songs')
  })

  // Tempo
  When(/^I tap tempo three times$/, async (ctx) => {
    await screen(ctx)
    for (const t of [100, 90, 80]) await press(ctx, `Tempo ${t} Prozent`)
  })
  Then(/^the button shows "(\d+)%" and engine tempo is (\d+)$/, (ctx, shown, t) => {
    expect(byLabel(ctx.el, `Tempo ${shown} Prozent`)!.textContent!.trim()).toBe(`${shown}%`)
    expect(ctx.tempo).toBe(+t)
    expect(text(ctx.el)).toContain('· F · 65 BPM') // 93 × 0.7
  })

  // Leaving
  Given(/^two completed passes$/, async (ctx) => {
    await screen(ctx)
    await pass(ctx)
    await pass(ctx)
    expect(ctx.app.live.session.passes()).toHaveLength(2)
  })
  When(/^I navigate back$/, (ctx) => press(ctx, 'Zurück zur Auswahl'))
  Then(/^history\.record was called with two passes and engine\.unload ran$/, (ctx) => {
    expect(ctx.recorded).toMatchObject({ id: '08', roles: ['maria'] })
    expect(ctx.recorded.passes).toHaveLength(2)
    expect(ctx.calls).toContain('unload')
    expect(ctx.calls).toContain('pitch.stop')
    expect(ctx.app.live).toBeNull()
    expect(location.hash).toBe('#/songs')
  })
})
