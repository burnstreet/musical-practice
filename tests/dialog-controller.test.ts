import { beforeEach, describe, expect, it } from 'vitest'
import type { AppContext } from '../src/app/context'
import { type DialogDeps, openDialog } from '../src/app/dialog'
import { settings } from '../src/app/settings'
import type { PitchFrame, ScriptItem } from '../src/core/types'

const line = (id: string, role: string): ScriptItem => ({ id, type: 'line', role, text: `Text ${id}`, audio: '0000000000000000' })
const script = { scenes: [{ id: 's1', title: '', items: [line('m001', 'vater'), line('a001', 'lena'), line('m002', 'vater')] }] }
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
}

function setup() {
  const t = { now: 0, played: [] as [string, number][], end: [] as (() => void)[], frame: null as ((f: PitchFrame) => void) | null, mic: false }
  const ctx = {
    settings,
    library: { getScript: async () => ({ script, audio: async (id: string) => new Blob([id]) }) },
    pitch: {
      start: async () => {
        t.mic = true
        return 'ok'
      },
      stop: () => {
        t.mic = false
      },
      active: () => t.mic,
      level: () => 0.1,
      on: (_: string, fn: (f: PitchFrame) => void) => {
        t.frame = fn
        return () => {}
      },
    },
  } as unknown as AppContext
  const deps: DialogDeps = {
    now: () => t.now,
    every: () => () => {},
    play: (blob, rate) => {
      void blob.text().then((id) => t.played.push([id, rate]))
      return { ended: new Promise<void>((r) => t.end.push(r)), stop: () => {} }
    },
  }
  return { t, ctx, deps }
}

describe('dialog controller', () => {
  beforeEach(() => {
    localStorage.clear()
    settings.set({ roles: ['lena'], dialog: { ...settings.get().dialog, rate: 1.2, silenceMs: 500 } })
  })

  it('opens paused: no audio, no mic until resume', async () => {
    const { t, ctx, deps } = setup()
    const d = await openDialog(ctx, { sceneId: 's1', paused: true }, () => {}, deps)
    await flush()
    expect(d.cue.state).toBe('paused')
    expect(t.played).toEqual([])
    expect(t.mic).toBe(false)
    d.send({ type: 'resume' })
    await flush()
    expect(t.played).toEqual([['m001', 1.2]])
  })

  it('restart at an item while paused: stays paused, no audio, stores the position', async () => {
    const { t, ctx, deps } = setup()
    const d = await openDialog(ctx, { sceneId: 's1', paused: true }, () => {}, deps)
    d.restart('m002')
    await flush()
    expect(d.cue.state).toBe('paused')
    expect(d.cue.effects).toEqual([])
    expect(t.played).toEqual([])
    expect(settings.get().dialogPositions.lena).toMatchObject({ sceneId: 's1', itemId: 'm002' })
  })

  it('restart while running: the current turn plays again', async () => {
    const { t, ctx, deps } = setup()
    const d = await openDialog(ctx, { sceneId: 's1' }, () => {}, deps)
    await flush()
    d.restart()
    await flush()
    expect(d.cue.state).toBe('playing')
    expect(t.played).toEqual([
      ['m001', 1.2],
      ['m001', 1.2],
    ])
  })

  it("repeats the scene's stored range", async () => {
    settings.set({ dialogRepeats: { s1: { from: 'm001', to: 'a001' } } })
    const { ctx, deps } = setup()
    const d = await openDialog(ctx, { sceneId: 's1', itemId: 'a001', paused: true }, () => {}, deps)
    expect(d.cue.next.map((i) => i.id)).toEqual(['m001'])
  })

  it('plays other lines at the rate, opens the mic on my turn, moves on after speech and silence, stores the position', async () => {
    const { t, ctx, deps } = setup()
    const d = await openDialog(ctx, { sceneId: 's1' }, () => {}, deps)
    await flush()
    expect(t.played).toEqual([['m001', 1.2]])
    t.end.shift()!()
    await flush()
    expect(d.cue.state).toBe('waiting')
    expect(t.mic).toBe(true)
    // 300 ms quiet (floor), 500 ms speech, 700 ms quiet; frames every 10 ms, at in s
    const frames = (from: number, ms: number, rms: number) => {
      for (let x = from; x < from + ms; x += 10) t.frame!({ at: x / 1000, rms, t: 0, midi: null, clarity: 0 })
    }
    frames(0, 300, 0.002)
    frames(300, 500, 0.1)
    expect(d.cue.state).toBe('speaking')
    frames(800, 700, 0.002)
    await flush()
    expect(d.cue.state).toBe('playing')
    expect(t.mic).toBe(false)
    expect(t.played.at(-1)).toEqual(['m002', 1.2])
    d.dispose()
    expect(settings.get().dialogPositions.lena).toMatchObject({ sceneId: 's1', itemId: 'm002' })
  })

  it('a refused play pauses, so a tap on resume plays again', async () => {
    const { ctx, deps } = setup()
    const d = await openDialog(ctx, { sceneId: 's1' }, () => {}, { ...deps, play: () => ({ ended: Promise.reject(new Error('autoplay')), stop: () => {} }) })
    await flush()
    expect(d.cue.state).toBe('paused')
  })
})
