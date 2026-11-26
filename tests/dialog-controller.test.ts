import { beforeEach, describe, expect, it } from 'vitest'
import type { AppContext } from '../src/app/context'
import { type DialogDeps, openDialog, verseStart } from '../src/app/dialog'
import { settings } from '../src/app/settings'
import type { PitchFrame, Script, ScriptItem } from '../src/core/types'

const line = (id: string, role: string): ScriptItem => ({ id, type: 'line', role, text: `Text ${id}`, audio: '0000000000000000' })
const script = { scenes: [{ id: 's1', title: '', items: [line('m001', 'vater'), line('a001', 'lena'), line('m002', 'vater')] }] }
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
}

function setup(s: Script = script) {
  const t = { now: 0, played: [] as [string, number][], end: [] as (() => void)[], frame: null as ((f: PitchFrame) => void) | null, mic: false }
  const ctx = {
    settings,
    library: { getScript: async () => ({ script: s, audio: async (id: string) => new Blob([id]) }) },
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
    snippet: () => ({ ended: new Promise<void>(() => {}), stop: () => {} }),
  }
  return { t, ctx, deps }
}

const songScript: Script = { scenes: [{ id: 's1', title: '', items: [{ id: 'g1', type: 'song', songId: '01' }, line('m002', 'vater')] }] }
const note = (start: number, syllable: string) => ({ start, syllable })
const withSong = (s: Record<string, unknown>) => ({ song: { sections: [], notes: [], ...s }, voices: new Blob(), backing: new Blob() })

describe('song snippet', () => {
  beforeEach(() => {
    localStorage.clear()
    settings.set({ roles: ['lena'], dialog: { ...settings.get().dialog, shortSongs: true } })
  })

  function snippetSetup(ready = true, song = withSong({ sections: [{ name: 'Strophe 1', start: 12, end: 20 }] })) {
    const { t, ctx, deps } = setup(songScript)
    const snippets: [number, number][] = []
    const ends: (() => void)[] = []
    ;(ctx.library as any).isReady = () => ready
    ;(ctx.library as any).getSong = async () => song
    deps.snippet = (_song, start, ms) => {
      snippets.push([start, ms])
      return { ended: new Promise<void>((r) => ends.push(r)), stop: () => {} }
    }
    return { t, ctx, deps, snippets, ends }
  }

  it('plays 5 s from verse 1, then moves on by itself', async () => {
    const { ctx, deps, snippets, ends } = snippetSetup()
    const d = await openDialog(ctx, { sceneId: 's1' }, () => {}, deps)
    await flush()
    expect(snippets).toEqual([[12, 5000]])
    expect(d.cue.state).toBe('song')
    ends[0]()
    await flush()
    expect(d.cue.state).toBe('playing')
    expect(d.cue.position().itemId).toBe('m002')
  })

  it('a snippet of an older cue stays silent after pause', async () => {
    const { ctx, deps, ends } = snippetSetup()
    const d = await openDialog(ctx, { sceneId: 's1' }, () => {}, deps)
    await flush()
    d.send({ type: 'pause' })
    ends[0]()
    await flush()
    expect(d.cue.state).toBe('paused')
  })

  it('a song that is not ready keeps the card waiting', async () => {
    const { ctx, deps, snippets } = snippetSetup(false)
    const d = await openDialog(ctx, { sceneId: 's1' }, () => {}, deps)
    await flush()
    expect(snippets).toEqual([])
    expect(d.cue.state).toBe('song')
  })

  it('a snippet that cannot load keeps the card waiting', async () => {
    const { ctx, deps, snippets } = snippetSetup()
    ;(ctx.library as any).getSong = async () => {
      throw new Error('broken')
    }
    const d = await openDialog(ctx, { sceneId: 's1' }, () => {}, deps)
    await flush()
    expect(snippets).toEqual([])
    expect(d.cue.state).toBe('song')
  })

  it('without the setting no snippet plays', async () => {
    settings.set({ dialog: { ...settings.get().dialog, shortSongs: false } })
    const { ctx, deps, snippets } = snippetSetup()
    const d = await openDialog(ctx, { sceneId: 's1' }, () => {}, deps)
    await flush()
    expect(snippets).toEqual([])
    expect(d.cue.state).toBe('song')
  })

  it('starts at the first sung note without a verse 1, else at 0', () => {
    expect(verseStart(withSong({ notes: [note(3, ''), note(5, 'La')] }).song as any)).toBe(5)
    expect(verseStart(withSong({ notes: [note(3, '')] }).song as any)).toBe(0)
  })
})

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

  it('entering another scene: its stored repeat applies, the line plays once', async () => {
    settings.set({ dialogRepeats: { s2: { from: 'm003', to: 'a002' } } })
    const two = {
      scenes: [
        { id: 's1', title: '', items: [line('m001', 'vater')] },
        { id: 's2', title: '', items: [line('m003', 'vater'), line('a002', 'lena'), line('m004', 'vater')] },
      ],
    }
    const { t, ctx, deps } = setup(two)
    const d = await openDialog(ctx, { sceneId: 's1' }, () => {}, deps)
    await flush()
    t.end.shift()!()
    await flush()
    expect(d.cue.turn.map((i) => i.id)).toEqual(['m003'])
    expect(d.options.repeat).toEqual({ sceneId: 's2', from: 'm003', to: 'a002' })
    expect(d.cue.effects.filter((e) => e.type === 'play')).toEqual([{ type: 'play', itemIds: ['m003'] }])
    expect(t.played).toEqual([
      ['m001', 1.2],
      ['m003', 1.2],
    ])
    t.end.shift()!()
    await flush()
    expect(d.cue.next.map((i) => i.id)).toEqual(['m003'])
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
