import 'fake-indexeddb/auto'
import { expect } from 'vitest'
import type { RoleId } from '../../src/core/content'
import { openDb } from '../../src/core/db'
import { createHistory } from '../../src/core/history'
import type { PassResult } from '../../src/core/scorer'
import type { Vault } from '../../src/core/vault'
import { steps } from '../gherkin'

let n = 0
const pass = (hitPct: number) => ({ hitPct }) as PassResult
const roles = (s: string) => s.split(',').map((r) => r.trim()) as RoleId[]

/** Fresh database per scenario; a fake vault gives us the wipe hook. */
function setup(ctx: any) {
  if (ctx.h) return
  const hooks: (() => Promise<void>)[] = []
  ctx.lock = async () => {
    for (const h of hooks) await h()
  }
  const vault = { onWipe: (fn: () => Promise<void>) => void hooks.push(fn) } as unknown as Vault
  const name = `hist${n++}`
  let t = 0
  ctx.h = createHistory({ vault, db: () => openDb(name), now: () => `t${String(t++).padStart(3, '0')}` })
}

export default steps(({ Given, When, Then }) => {
  Given(/^passes with hitPct 40 and 70 for song "08" roles \[maria, chor\]$/, (ctx) => {
    setup(ctx)
    ctx.passes = [pass(40), pass(70)]
  })
  When(/^I record them$/, (ctx) => ctx.h.record('08', roles('maria,chor'), ctx.passes))
  Then(/^badge\("08", \[chor, maria\]\) is 70 and list has one entry with bestHitPct 70 and passes 2$/, async (ctx) => {
    expect(await ctx.h.badge('08', roles('chor,maria'))).toBe(70)
    const l = await ctx.h.list('08', roles('chor,maria'))
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ bestHitPct: 70, passes: 2, lastHitPct: 70 })
  })

  Given(/^21 recorded sessions for the same key$/, async (ctx) => {
    setup(ctx)
    for (let i = 0; i < 21; i++) await ctx.h.record('08', ['chor'], [pass(i)])
  })
  Then(/^list returns 20, newest first$/, async (ctx) => {
    const l = await ctx.h.list('08', ['chor'])
    expect(l.map((s: any) => s.lastHitPct)).toEqual(Array.from({ length: 20 }, (_, i) => 20 - i))
  })

  When(/^I record an empty pass list$/, async (ctx) => {
    setup(ctx)
    await ctx.h.record('08', ['chor'], [])
  })
  Then(/^list is unchanged and badge stays null$/, async (ctx) => {
    expect(await ctx.h.list('08', ['chor'])).toEqual([])
    expect(await ctx.h.badge('08', ['chor'])).toBeNull()
  })

  Given(/^a session recorded for \[maria\]$/, async (ctx) => {
    setup(ctx)
    await ctx.h.record('08', ['maria'], [pass(50)])
  })
  Then(/^badge\("08", \[chor\]\) is null$/, async (ctx) => expect(await ctx.h.badge('08', ['chor'])).toBeNull())

  Given(/^recorded sessions$/, async (ctx) => {
    setup(ctx)
    await ctx.h.record('08', ['maria'], [pass(50)])
    await ctx.h.record('09', ['chor'], [pass(60)])
  })
  When(/^wipe runs$/, (ctx) => ctx.lock())
  Then(/^every badge is null$/, async (ctx) => {
    expect(await ctx.h.badge('08', ['maria'])).toBeNull()
    expect(await ctx.h.badge('09', ['chor'])).toBeNull()
  })
})
