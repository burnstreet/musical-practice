import { expect } from 'vitest'
import { type Cue, type CueEvent, type CueOptions, cueStart, cueStep, hintText, repeatRange } from '../../src/core/cue'
import type { Script } from '../../src/core/types'
import { steps } from '../gherkin'

const line = (id: string, role: string) => ({ id, type: 'line' as const, role, text: `text ${id}`, audio: '0000000000000000' })
const sample: Script = {
  scenes: [
    {
      id: 's1',
      title: '',
      items: [
        { id: 'd1', type: 'direction', text: 'Sie sitzt.' },
        line('l1', 'vater'),
        line('l2', 'vater'),
        line('l3', 'lena'),
        line('l4', 'lena'),
        line('l5', 'vater'),
        { id: 'g1', type: 'song', songId: '01' },
      ],
    },
    { id: 's2', title: '', items: [line('m1', 'vater')] },
  ],
}
const list = (s: string) => s.split(',').map((x) => x.trim())

const env = (ctx: any) => {
  ctx.script = sample
  ctx.opts ??= { roles: ['lena'], directionMs: 2500, hardTimeoutMs: 20000, showDirections: true, repeat: null } satisfies CueOptions
  return ctx.opts
}
const start = (ctx: any, itemId?: string, now = 0, paused?: boolean) => {
  env(ctx)
  const sceneId = itemId ? sample.scenes.find((s) => s.items.some((i) => i.id === itemId))!.id : 's1'
  ctx.now = now
  ctx.cue = cueStart(ctx.script, ctx.opts, { sceneId, itemId, paused }, now)
}
const send = (ctx: any, ev: CueEvent, at = ctx.now) => {
  ctx.now = at
  ctx.cue = cueStep(ctx.cue, ev, at)
}
const hasEffect = (ctx: any, e: object) => expect((ctx.cue as Cue).effects).toContainEqual(e)
const play = (ctx: any, ids: string) => hasEffect(ctx, { type: 'play', itemIds: list(ids) })

export default steps(({ Given, When, Then }) => {
  Given(/^the sample script$/, (ctx) => void env(ctx))
  Given(/^directions are not shown$/, (ctx) => {
    env(ctx).showDirections = false
  })
  Given(/^roles \[(.*)\]$/, (ctx, r) => {
    env(ctx).roles = list(r)
  })
  Given(/^I am playing (\w+)$/, (ctx, id) => start(ctx, id))
  Given(/^I am waiting at (\w+)(?: since (\d+) ms)?$/, (ctx, id, ms) => start(ctx, id, +(ms ?? 0)))
  Given(
    /^(directions are not shown and )?repeat in (\w+) from (\w+)(?: to (\w+))?(?: and I am (?:playing|waiting at|at the song) (\w+))?$/,
    (ctx, hidden, sceneId, from, to, at) => {
      if (hidden) env(ctx).showDirections = false
      env(ctx).repeat = { sceneId, from, to }
      if (at) start(ctx, at)
    },
  )

  When(/^I start at s1$/, (ctx) => start(ctx))
  When(/^I start at s1 (\w+) paused$/, (ctx, id) => start(ctx, id, 0, true))
  When(/^I start at s1 after the direction$/, (ctx) => {
    start(ctx)
    send(ctx, { type: 'tick' }, 2500)
  })
  When(/^a tick comes at (\d+) ms$/, (ctx, ms) => send(ctx, { type: 'tick' }, +ms))
  When(/^audio ends$/, (ctx) => send(ctx, { type: 'audioEnded' }))
  When(/^speech starts and speech ends$/, (ctx) => {
    send(ctx, { type: 'speechStart' })
    send(ctx, { type: 'speechEnd' })
  })
  When(/^speech starts$/, (ctx) => send(ctx, { type: 'speechStart' }))
  When(/^speech starts at (\d+) ms and a tick comes at (\d+) ms$/, (ctx, a, b) => {
    send(ctx, { type: 'speechStart' }, +a)
    send(ctx, { type: 'tick' }, +b)
  })
  When(/^I tap$/, (ctx) => send(ctx, { type: 'tap' }))
  When(/^audio ends and I tap$/, (ctx) => {
    send(ctx, { type: 'audioEnded' })
    send(ctx, { type: 'tap' })
  })
  When(/^I skip$/, (ctx) => send(ctx, { type: 'skip' }))
  When(/^I ask for a prompt$/, (ctx) => send(ctx, { type: 'prompt' }))
  When(/^I go back$/, (ctx) => send(ctx, { type: 'back' }))
  When(/^I pause$/, (ctx) => send(ctx, { type: 'pause' }))
  When(/^I resume$/, (ctx) => send(ctx, { type: 'resume' }))

  Then(/^the state is (\w+)$/, (ctx, s) => {
    expect(ctx.cue.state).toBe(s)
  })
  Then(/^the state is (\w+) in scene (\w+)$/, (ctx, s, scene) => {
    expect(ctx.cue.state).toBe(s)
    expect(ctx.cue.sceneId).toBe(scene)
  })
  Then(/^the state is (\w+) with (play|turn) \[(.*)\](?: and (mic on|mic off|the effects hold stop|no effects))?$/, (ctx, s, kind, ids, and) => {
    expect(ctx.cue.state).toBe(s)
    if (kind === 'play') play(ctx, ids)
    else expect(ctx.cue.turn.map((i: any) => i.id)).toEqual(list(ids))
    if (and === 'no effects') expect(ctx.cue.effects).toEqual([])
    else if (and === 'the effects hold stop') hasEffect(ctx, { type: 'stop' })
    else if (and) hasEffect(ctx, { type: 'mic', on: and === 'mic on' })
  })
  Then(/^the state is (\w+) with mic (on|off)$/, (ctx, s, m) => {
    expect(ctx.cue.state).toBe(s)
    hasEffect(ctx, { type: 'mic', on: m === 'on' })
  })
  Then(/^the state is paused with stop and mic off$/, (ctx) => {
    expect(ctx.cue.state).toBe('paused')
    hasEffect(ctx, { type: 'stop' })
    hasEffect(ctx, { type: 'mic', on: false })
  })
  Then(/^the effects hold missed and the state is (\w+) (\w+)$/, (ctx, s, id) => {
    hasEffect(ctx, { type: 'missed' })
    expect(ctx.cue.state).toBe(s)
    expect(ctx.cue.turn[0].id).toBe(id)
  })
  Then(/^the repeat range is (\w+) to (\w+)$/, (ctx, from, to) => {
    expect(repeatRange(ctx.script, ctx.opts)).toEqual({ from, to })
  })
  Then(/^the next turn is \[(.*)\]$/, (ctx, ids) => {
    expect(ctx.cue.next.map((i: any) => i.id)).toEqual(list(ids))
  })
  Then(/^the position is (\w+), (\w+)$/, (ctx, sceneId, itemId) => {
    expect(ctx.cue.position()).toEqual({ sceneId, itemId })
  })

  Then(/^hintText "(.*)" with (show|hide|start) is "(.*)"$/, (_ctx, text, mode, out) => {
    expect(hintText(text, mode as 'show' | 'hide' | 'start')).toBe(out)
  })
})
