import { expect } from 'vitest'
import { type AppContext, setContext } from '../../src/app/context'
import { features } from '../../src/app/features'
import { ownSpans as mergedSpans } from '../../src/app/repeat'
import { entryCountdown, type GuPractice } from '../../src/app/screens/practice'
import { settings } from '../../src/app/settings'
import { leadInStart } from '../../src/core/audio-engine'
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
      sections: [],
    },
  }
}

/** Fresh fakes per scenario; also resets DOM, storage and hash. */
function world(ctx: any) {
  if (ctx.app) return ctx
  document.body.innerHTML = ''
  localStorage.clear()
  history.replaceState(null, '', '#/practice/08')
  features.results = false
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
        ctx.engineL.pause?.forEach((fn: () => void) => {
          fn()
        }) // like the real engine
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
      seekLeadIn: (s: number) => {
        const to = leadInStart(s, ctx.data.song.bars)
        log(`seek ${to}`)
        ctx.time = to
      },
      loop: () => ctx.loop ?? null,
      time: () => ctx.time,
      playing: () => ctx.playing,
      latency: () => ctx.latency ?? 0,
      ctxTime: () => 0,
      click: () => () => {},
      on: on(ctx.engineL),
    },
    pitch: {
      start: async (...args: any[]) => {
        log('pitch.start')
        ctx.startArgs = args
        return ctx.startResult
      },
      stop: () => log('pitch.stop'),
      setDelayMs: () => {},
      delay: () => ctx.delay ?? 0,
      on: (ev: string, fn: (x: any) => void) => {
        on(ctx.pitchL)(ev, fn)
        return () => {}
      },
      level: () => 0,
      inputLatency: () => 0,
      setDevice: async () => 'ok' as const,
      devices: async () => [],
      clocks: () => [() => 0, () => 0],
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
  ctx.el.requestFrame = (cb: () => void) => setTimeout(cb, 0) // happy-dom: no real animation frames
  document.body.append(ctx.el)
  await settle(ctx.el)
  ctx.draws = { staff: [], roll: [] }
  for (const name of ['staff', 'roll']) {
    const canvas = ctx.el.shadowRoot!.querySelector(`.${name} canvas`) as HTMLCanvasElement
    Object.defineProperty(canvas, 'clientWidth', { value: 600, configurable: true }) // happy-dom has no layout
    Object.defineProperty(canvas, 'clientHeight', { value: 188, configurable: true })
    canvas.getContext = (() => recorder(canvas, ctx.draws[name])) as any
  }
  await tick(ctx, ctx.time)
  return ctx.el
}

/** Fake 2D context: logs [method, ...args] of the last draw (cleared by `clearRect`, which starts every draw). */
function recorder(canvas: HTMLCanvasElement, log: unknown[][]) {
  const props: Record<string, unknown> = { canvas }
  return new Proxy(props, {
    get: (o, k: string) =>
      k in o
        ? o[k]
        : (...args: unknown[]) => {
            if (k === 'clearRect') log.length = 0
            log.push([k, ...args, o.textBaseline])
            return { width: 10, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 5 }
          },
    set: (o, k: string, v) => {
      o[k] = v
      return true
    },
  })
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
    fn({ t: ctx.time, at: ctx.time, midi: null, clarity: 1, rms: 0.1, ...f })
  })
  await settle(ctx.el)
}

export default steps(({ Given, When, Then }) => {
  Given(/^my next note starts at ([\d.]+) in bars of 2 s$/, (ctx, start) => {
    ctx.song = fixture().song // Maria D5 from 8.0, bars every 2 s
    expect(ctx.song.notes.find((n: Note) => n.role === 'maria').start).toBe(+start)
  })
  Then(/^at ([\d.]+)(?: at tempo (\d+))? the readout shows (?:"([^"]+)"|no countdown)$/, (ctx, t, tempo, text) => {
    expect(entryCountdown(ctx.song, ['maria'], +t, +(tempo ?? 100))).toBe(text ?? '')
  })

  Given(/^song "(\w+)" loaded with key "(\w+)", bpm (\d+), title placeholder$/, (ctx, _id, key, bpm) => {
    world(ctx)
    Object.assign(ctx.data.song, { key, bpm: +bpm })
  })
  When(/^the screen renders at bar (\d+) with the staff (\d+) px wide$/, async (ctx, bar, px) => {
    await screen(ctx)
    Object.defineProperty(ctx.el.shadowRoot!.querySelector('.staff canvas'), 'clientWidth', { value: +px }) // happy-dom has no layout
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
  Given(/^a delay of ([\d.]+) s, playback at ([\d.]+) and a frame (\d+) cents above D5 scored at ([\d.]+)$/, async (ctx, delay, at, n, t) => {
    ctx.delay = +delay
    await screen(ctx)
    await tick(ctx, +at)
    await frame(ctx, { midi: 74 + +n / 100, t: +t, at: +at })
  })
  Given(/^target D5 and the screen paused$/, async (ctx) => {
    const el = await screen(ctx)
    await tick(ctx, 8.5)
    ctx.raf = [] as (() => void)[]
    el.requestFrame = (cb: () => void) => ctx.raf.push(cb)
    ctx.renders = 0
    const updated = el.updated.bind(el)
    el.updated = (changed: Map<string, unknown>) => {
      ctx.renders++
      updated(changed)
    }
  })
  When(/^(\d+) pitch frames arrive before the next animation frame$/, async (ctx, n) => {
    for (let i = 1; i <= +n; i++) await frame(ctx, { midi: 74 + i / 100 })
  })
  Then(/^the screen has not redrawn$/, (ctx) => expect(ctx.renders).toBe(0))
  When(/^the animation frame runs$/, async (ctx) => {
    ctx.raf.splice(0).forEach((cb: () => void) => {
      cb()
    })
    await settle(ctx.el)
  })
  Then(/^the screen redrew once and the readout shows "([^"]+)"$/, (ctx, s) => {
    expect(ctx.renders).toBe(1)
    expect(text(ctx.el)).toContain(s)
  })
  Given(/^a sung frame (\d+) cents (above|below)(?: with tolerance (\d+))?$/, async (ctx, n, dir, tol) => {
    if (tol) settings.set({ tolerance: +tol as any })
    await frame(ctx, { midi: 74 + ((dir === 'above' ? 1 : -1) * +n) / 100 })
  })
  Given(/^target D5 and no sung frame$/, async (ctx) => {
    await screen(ctx)
    await tick(ctx, 8.5)
  })
  const meter = (ctx: any) => ctx.el.shadowRoot!.querySelector('.meter')!.parentElement as HTMLElement
  Then(/^the meter is labelled "(\w+)" and "(\w+)" and shows no dot$/, (ctx, lo, hi) => {
    expect(meter(ctx).textContent).toContain(lo)
    expect(meter(ctx).textContent).toContain(hi)
    expect(meter(ctx).querySelector('.dot')).toBeNull()
  })
  Then(/^the meter shows a dot$/, (ctx) => expect(meter(ctx).querySelector('.dot')).not.toBeNull())
  Then(/^neither the readout nor the mic indicator is a control$/, (ctx) => {
    const mic = byLabel(ctx.el, 'Mikrofon aktiv')!
    expect(mic.getAttribute('role')).toBe('img')
    expect(mic.classList.contains('round')).toBe(false) // .round is the button look
    expect(ctx.el.shadowRoot!.querySelector('.readout')!.querySelector('button, input, [role="slider"]')).toBeNull()
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
  const pause = (ctx: any) => press(ctx, features.results ? 'Pause und Auswertung' : 'Pause')
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
    await pause(ctx)
  }
  Given(/^a pass with (at least one|no) entered note$/, async (ctx, which) => {
    await screen(ctx)
    await play(ctx)
    expect(ctx.playing).toBe(true)
    if (which !== 'no') await enterNote(ctx, 1)
  })
  Given(/^the results screen is enabled$/, (ctx) => {
    world(ctx)
    features.results = true
  })
  When(/^the engine is paused from outside the screen$/, async (ctx) => {
    ctx.app.engine.pause()
    await settle(ctx.el)
  })
  Then(/^the transport shows "Abspielen" and session\.endPass ran$/, (ctx) => {
    expect(byLabel(ctx.el, 'Abspielen')).not.toBeNull()
    expect(ctx.app.live.session.passes()).toHaveLength(1)
  })
  When(/^I press pause$/, (ctx) => pause(ctx))
  When(/^I press the back button$/, (ctx) => press(ctx, 'Zurück zur Auswahl'))
  Then(/^the route is "([^"]+)"$/, (_ctx, hash) => expect(location.hash).toBe(hash))
  Then(/^session\.endPass ran and the route (?:is|stays) "([^"]+)"$/, (ctx, hash) => {
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
    features.results = true // even with the results screen on, a denied mic gives no results
    await enterNote(ctx, 1)
    await pause(ctx)
    expect(location.hash).toBe('#/practice/08')
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
    await pause(ctx)
    expect(location.hash).toBe('#/practice/08') // listen only: pause just pauses
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

  // Repeat selector
  const KIND: Record<string, string> = { Aus: 'off', Phrase: 'phrase', Abschnitt: 'section', Einsatz: 'einsatz', 'A–B': 'ab' }
  const chip = (ctx: any, label: string) => ctx.el.shadowRoot!.querySelector(`.chip[data-kind="${KIND[label]}"]`) as HTMLElement
  const status = (ctx: any) => ctx.el.shadowRoot!.querySelector('.status')
  const pairs = (s: string) => [...s.matchAll(/\[([\d.]+),([\d.]+)\]/g)].map((m) => [+m[1], +m[2]] as [number, number])
  const phraseSong = (ctx: any) => {
    ctx.data.song.phrases = [
      [0, 3],
      [4, 9],
      [10, 14],
      [16, 20],
      [22, 26],
      [28, 32],
    ].map(([start, end], index) => ({ index, label: `p${index}`, start, end }))
    ctx.data.song.notes.push(note(74, 30, 31, 'maria', 5)) // a later own entry to skip to
  }
  const ownSpans = (ctx: any, spans: [number, number][]) => {
    ctx.data.song.bars = Array.from({ length: 30 }, (_, i) => i * 2)
    ctx.data.song.notes = spans.map(([s, e], i) => note(74, s, e, 'maria', i))
  }
  const at = async (ctx: any, t: number) => {
    await screen(ctx)
    await tick(ctx, t)
  }

  Given(/^the heard time is inside phrase (\d+) spanning \[([\d.]+),([\d.]+)\]$/, async (ctx, i, a, b) => {
    world(ctx)
    phraseSong(ctx)
    expect(ctx.data.song.phrases[+i]).toMatchObject({ start: +a, end: +b })
    await at(ctx, +a + 2)
  })
  Given(
    /^sections "([^"]+)" \[([\d.]+),([\d.]+)\] and "([^"]+)" \[([\d.]+),([\d.]+)\] and the heard time ([\d.]+)$/,
    async (ctx, n1, a1, b1, n2, a2, b2, t) => {
      world(ctx)
      ctx.data.song.sections = [
        { name: n1, start: +a1, end: +b1 },
        { name: n2, start: +a2, end: +b2 },
      ]
      await at(ctx, +t)
    },
  )
  Given(/^my own spans (\[.+\])(?:, bars every 2 s)? and the heard time ([\d.]+)$/, async (ctx, list, t) => {
    world(ctx)
    ownSpans(ctx, pairs(list))
    await at(ctx, +t)
  })
  Given(/^a song without sections$/, async (ctx) => {
    world(ctx)
    ctx.data.song.sections = []
    await screen(ctx)
  })
  Given(/^the "(\w+)" repeat is on$/, async (ctx, label) => {
    await at(ctx, 0)
    await tap(ctx, chip(ctx, label))
  })
  Given(/^the "(\w+)" repeat is on and a pass is running$/, async (ctx, label) => {
    await at(ctx, 0)
    await play(ctx)
    await tap(ctx, chip(ctx, label))
  })
  Given(/^the "(\w+)" repeat is on for phrase (\d+)$/, async (ctx, label, i) => {
    world(ctx)
    phraseSong(ctx)
    await at(ctx, ctx.data.song.phrases[+i].start + 1)
    await tap(ctx, chip(ctx, label))
    ctx.before = ctx.loop
  })
  Given(/^the "Einsatz" repeat is on for a span starting at ([\d.]+) in bars of 2 s$/, async (ctx, start) => {
    world(ctx)
    ownSpans(ctx, [[+start, +start + 10]])
    await at(ctx, 0)
    await tap(ctx, chip(ctx, 'Einsatz'))
  })
  When(/^I tap the chip "([^"]+)"$/, async (ctx, label) => {
    await screen(ctx)
    await tap(ctx, chip(ctx, label))
  })
  When(/^playback runs on into phrase (\d+)$/, (ctx, i) => tick(ctx, ctx.data.song.phrases[+i].start + 1))
  When(/^I tap the progress bar at a time inside phrase (\d+)$/, async (ctx, i) => {
    const input = ctx.el.shadowRoot!.querySelector('input[aria-label="Position"]') as HTMLInputElement
    input.value = String(ctx.data.song.phrases[+i].start + 1)
    input.dispatchEvent(new Event('input'))
    await settle(ctx.el)
  })
  When(/^the repeat wraps$/, (ctx) => {
    ctx.engineL.loop?.forEach((fn: (p: unknown) => void) => {
      fn(ctx.data.song.phrases[0])
    })
  })
  When(/^the heard time is ([\d.]+)$/, (ctx, t) => tick(ctx, +t))

  Then(/^the repeat range is the range \[([\d.]+),([\d.]+)\] with phrase (\d+) and no lead-in$/, (ctx, a, b, i) => {
    expect(ctx.loop).toEqual({ start: +a, end: +b, phrase: ctx.data.song.phrases[+i] })
  })
  Then(/^the repeat range is the range \[([\d.]+),([\d.]+)\] with lead-in$/, (ctx, a, b) => {
    expect(ctx.loop).toEqual({ start: +a, end: +b, leadIn: true })
  })
  Then(/^the repeat range is the range \[([\d.]+),([\d.]+)\] without phrase and without lead-in$/, (ctx, a, b) => {
    expect(ctx.loop).toEqual({ start: +a, end: +b })
  })
  Then(/^the range is \[([\d.]+),([\d.]+)\]$/, (ctx, a, b) => expect(ctx.loop).toEqual({ start: +a, end: +b }))
  Then(/^no repeat range is set$/, (ctx) => expect(ctx.loop ?? null).toBeNull())
  Then(/^no repeat range is set and no status line is shown$/, (ctx) => {
    expect(ctx.loop ?? null).toBeNull()
    expect(status(ctx)).toBeNull()
  })
  Then(/^no repeat range is set and the chip reads "([^"]+)"$/, (ctx, label) => {
    expect(ctx.loop ?? null).toBeNull()
    expect(chip(ctx, 'A–B').textContent!.trim()).toBe(label)
  })
  Then(/^the status line reads "([^"]+)"$/, (ctx, s) => expect(status(ctx)!.textContent!.trim()).toBe(s))
  Then(/^the chip reads "([^"]+)" and the status line reads "([^"]+)"$/, (ctx, label, s) => {
    expect(chip(ctx, 'A–B').textContent!.trim()).toBe(label)
    expect(status(ctx)!.textContent!.trim()).toBe(s)
  })
  Then(/^only the chip "(\w+)" is active and the repeat range is that span's range$/, (ctx, label) => {
    const on = [...ctx.el.shadowRoot!.querySelectorAll('.chip[aria-pressed="true"]')]
    expect(on).toEqual([chip(ctx, label)])
    expect(ctx.loop).toMatchObject({ start: 8, end: 11, leadIn: true }) // Maria's notes 8–9.5 and 10–11 merge
  })
  Then(/^the repeat range is still the range of phrase (\d+)$/, (ctx, i) => {
    const p = ctx.data.song.phrases[+i]
    expect(ctx.loop).toEqual({ start: p.start, end: p.end, phrase: p })
  })
  Then(/^the chip "(\w+)" is still active and the repeat range is unchanged$/, (ctx, label) => {
    expect(chip(ctx, label).getAttribute('aria-pressed')).toBe('true')
    expect(ctx.loop).toBe(ctx.before)
  })
  Then(/^the chips are (".+)$/, (ctx, list) => {
    const labels = [...ctx.el.shadowRoot!.querySelectorAll('.chip')].map((c: Element) => c.textContent!.trim())
    expect(labels).toEqual([...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]))
  })
  Then(/^session\.endPass did not run and re-entered notes replace earlier attempts$/, (ctx) => {
    expect(ctx.app.live.session.passes()).toHaveLength(0)
    expect(ctx.playing).toBe(true)
  })

  // A–B
  Given(/^bars every 2 s and the heard time ([\d.]+)$/, (ctx, t) => at(ctx, +t))
  Given(/^A is set at ([\d.]+)(?: and bars every 2 s)?$/, async (ctx, t) => {
    await at(ctx, +t)
    await tap(ctx, chip(ctx, 'A–B'))
  })
  When(/^the heard time is ([\d.]+) and I tap the chip again$/, async (ctx, t) => {
    await tick(ctx, +t)
    await tap(ctx, chip(ctx, 'A–B'))
  })
  When(/^I set B at ([\d.]+)$/, async (ctx, t) => {
    await tick(ctx, +t)
    await tap(ctx, chip(ctx, 'A–B'))
  })
  When(/^I tap the chip a third time$/, (ctx) => tap(ctx, chip(ctx, 'A–B')))

  // Dimming and sections
  const sections = (ctx: any) => {
    ctx.data.song.sections = [
      { name: 'Strophe 1', start: 8, end: 24 },
      { name: 'Refrain', start: 24, end: 40 },
    ]
  }
  const progress = (ctx: any) => ctx.el.shadowRoot!.querySelector('.progress') as HTMLElement
  const pct = (ctx: any, t: number) => `${(t / ctx.data.meta.durationSec) * 100}%`
  /** Flag labels: the only texts hung from the top (row labels sit on the middle, syllables on the baseline). */
  const flags = (ctx: any, canvas: string) => ctx.draws[canvas].filter((c: unknown[]) => c[0] === 'fillText' && c.at(-1) === 'top').map(([, s]: unknown[]) => s)
  const dimmed = (ctx: any, start: number, end: number) => {
    for (const canvas of ['staff', 'roll'])
      expect(
        ctx.draws[canvas].some(([k]: unknown[]) => k === 'fillRect'),
        canvas,
      ).toBe(true)
    const range = progress(ctx).querySelector<HTMLElement>('.range')!
    expect(range.style.left).toBe(pct(ctx, start))
    expect(range.style.right).toBe(pct(ctx, ctx.data.meta.durationSec - end))
    expect(progress(ctx).querySelectorAll('.dim').length).toBeGreaterThan(0)
  }
  Given(/^the "Abschnitt" repeat is on for \[24\.0,40\.0\]$/, async (ctx) => {
    world(ctx)
    sections(ctx)
    await at(ctx, 30)
    await tap(ctx, chip(ctx, 'Abschnitt'))
    expect(ctx.loop).toMatchObject({ start: 24, end: 40 })
    ctx.calls.length = 0
  })
  Then(/^staff, roll and progress bar are drawn with a dim range \[([\d.]+),([\d.]+)\] and a flag "([^"]+)" at ([\d.]+)$/, (ctx, a, b, name) => {
    dimmed(ctx, +a, +b)
    expect(flags(ctx, 'roll')).toEqual([name])
    expect(progress(ctx).querySelector('.leadin')).not.toBeNull()
  })
  Then(/^the heard audio, the mic and the scorer are untouched$/, (ctx) => {
    expect(ctx.calls).toEqual([])
    expect(byLabel(ctx.el, 'Mikrofon aktiv')).not.toBeNull()
  })
  Then(/^the staff, the roll and the progress bar are drawn with a dim range from ([\d.]+) to the song end$/, (ctx, a) => {
    dimmed(ctx, +a, ctx.data.meta.durationSec)
    expect(flags(ctx, 'roll')).toEqual(['A'])
  })
  Given(/^an A–B repeat \[([\d.]+),([\d.]+)\]$/, async (ctx, a, b) => {
    await at(ctx, +a)
    await tap(ctx, chip(ctx, 'A–B'))
    await tick(ctx, +b)
    await tap(ctx, chip(ctx, 'A–B'))
    expect(ctx.loop).toEqual({ start: +a, end: +b })
  })
  Then(/^the roll draws flags "A" at ([\d.]+) and "B" at ([\d.]+)$/, (ctx) => {
    expect(flags(ctx, 'roll')).toEqual(['A', 'B'])
  })
  Given(/^no repeat$/, (ctx) => at(ctx, 9))
  Then(/^staff, roll and progress bar are drawn without a dim range$/, (ctx) => {
    for (const canvas of ['staff', 'roll'])
      expect(
        ctx.draws[canvas].some(([k]: unknown[]) => k === 'fillRect'),
        canvas,
      ).toBe(false)
    expect(ctx.draws.roll.length).toBeGreaterThan(0) // it did draw
    expect(progress(ctx).querySelector('.dim, .range')).toBeNull()
  })
  Given(/^sections "Strophe 1"(?: \[8\.0,24\.0\])? and "Refrain"(?: \[24\.0,40\.0\])?$/, async (ctx) => {
    world(ctx)
    sections(ctx)
    await at(ctx, 2)
  })
  Then(/^the progress bar shows two labelled segments, also without a repeat$/, (ctx) => {
    expect(ctx.loop ?? null).toBeNull()
    const segs = [...progress(ctx).querySelectorAll<HTMLElement>('.seg')]
    expect(segs.map((s) => s.textContent!.trim())).toEqual(['Strophe 1', 'Refrain'])
    expect(segs[1].style.left).toBe(pct(ctx, 24))
  })
  When(/^I tap the segment "([^"]+)"$/, async (ctx, name) => {
    const seg = [...progress(ctx).querySelectorAll<HTMLElement>('.seg')].find((s) => s.textContent!.trim() === name)!
    await tap(ctx, seg)
  })
  Then(/^the chip "Abschnitt" is active, the repeat range is \[([\d.]+),([\d.]+)\] with lead-in and time\(\) is ([\d.]+)$/, (ctx, a, b, t) => {
    expect(chip(ctx, 'Abschnitt').getAttribute('aria-pressed')).toBe('true')
    expect(ctx.loop).toEqual({ start: +a, end: +b, leadIn: true })
    expect(ctx.time).toBe(+t)
  })

  // Skip
  const SKIPS = ['Zum vorigen Einsatz', 'Zum nächsten Einsatz']
  const disabled = (ctx: any, label: string) => (byLabel(ctx.el, label) as HTMLButtonElement).disabled
  When(/^I tap "(Zum (?:vorigen|nächsten) Einsatz)"$/, (ctx, label) => press(ctx, label))
  Then(/^time\(\) is ([\d.]+)$/, (ctx, t) => expect(ctx.time).toBe(+t))
  Given(/^bars of 2 s and my role spans (\[.+\])$/, (ctx, list) => {
    world(ctx)
    ownSpans(ctx, pairs(list))
  })
  Then(/^the own spans are (\[.+\])$/, (ctx, list) => {
    expect(mergedSpans(ctx.data.song, ['maria']).map((s) => [s.start, s.end])).toEqual(pairs(list))
  })
  Then(/^"(Zum nächsten Einsatz)" from ([\d.]+) has no target$/, async (ctx, label, t) => {
    await at(ctx, +t)
    expect(disabled(ctx, label)).toBe(true)
  })
  Then(/^"(Zum (?:vorigen|nächsten) Einsatz)" is disabled$/, (ctx, label) => expect(disabled(ctx, label)).toBe(true))
  Given(/^the heard time ([\d.]+)(?: and no later span)?$/, (ctx, t) => at(ctx, +t))
  Given(/^an empty role set$/, async (ctx) => {
    ctx.el.remove()
    ctx.el = null
    settings.set({ roles: [] })
    await screen(ctx)
  })
  Then(/^both skip buttons are disabled$/, (ctx) => {
    for (const label of SKIPS) expect(disabled(ctx, label)).toBe(true)
  })
  Given(/^the "Einsatz" repeat is on for (\[[\d.,]+\]) and my next own span is (\[[\d.,]+\])$/, async (ctx, a, b) => {
    world(ctx)
    ownSpans(ctx, [...pairs(a), ...pairs(b)])
    await at(ctx, pairs(a)[0][0] + 2)
    await tap(ctx, chip(ctx, 'Einsatz'))
    expect(ctx.loop).toEqual({ start: pairs(a)[0][0], end: pairs(a)[0][1], leadIn: true })
    await tick(ctx, pairs(a)[0][0] + 5)
  })
  Then(/^the repeat range is the range \[([\d.]+),([\d.]+)\] with lead-in and time\(\) is ([\d.]+)$/, (ctx, a, b, t) => {
    expect(ctx.loop).toEqual({ start: +a, end: +b, leadIn: true })
    expect(ctx.time).toBe(+t)
    expect(chip(ctx, 'Einsatz').getAttribute('aria-pressed')).toBe('true')
  })
  Then(/^the repeat range is unchanged and time\(\) is the lead-in landing$/, (ctx) => {
    expect(ctx.loop).toBe(ctx.before)
    expect(chip(ctx, 'Phrase').getAttribute('aria-pressed')).toBe('true')
    expect(ctx.time).toBe(leadInStart(30, ctx.data.song.bars)) // the later own entry at 30.0
  })

  // Intro skip
  const intro = (ctx: any) =>
    [...ctx.el.shadowRoot!.querySelectorAll('button')].find((b: HTMLElement) => b.textContent!.trim() === 'Intro überspringen') as HTMLElement | undefined
  Given(/^the first sung note of any role starts at ([\d.]+)(?: and bars every 2 s)?$/, (ctx, t) => {
    world(ctx)
    ctx.data.song.notes = [note(69, +t, +t + 1, 'josef', 0), note(74, +t + 2, +t + 3, 'maria', 0)] // not mine first: any role counts
  })
  Then(/^the button "Intro überspringen" is visible$/, (ctx) => expect(intro(ctx)).toBeDefined())
  When(/^I press it$/, (ctx) => tap(ctx, intro(ctx)!))
  Then(/^the button "Intro überspringen" is not shown$/, async (ctx) => {
    await screen(ctx)
    expect(intro(ctx)).toBeUndefined()
  })
})
