import 'fake-indexeddb/auto'
import { expect } from 'vitest'
import type { RoleId } from '../../src/core/content'
import { openDb } from '../../src/core/db'
import { createHistory, dayBars } from '../../src/core/history'
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
  ctx.h = createHistory({ vault, db: () => openDb(name), now: () => `t${String(t++).padStart(3, '0')}`, today: () => ctx.today })
}
const dayPass = (notes: number, hits: number, meanCents: number, clean: number, entries: number, sections: [string, number, number][] = []) =>
  ({
    scoredNotes: notes,
    hits,
    meanCents,
    notes: Array.from({ length: entries }, (_, i) => ({ entry: { clean: i < clean } })),
    sections: sections.map(([label, n, h]) => ({ label, notes: n, hits: h })),
  }) as unknown as PassResult

const EMPTY_DAY = { passes: 0, notes: 0, hits: 0, centsSum: 0, centsPasses: 0, entries: 0, cleanEntries: 0 }

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
  Given(/^today is "(.*)"$/, (ctx, day) => {
    setup(ctx)
    ctx.today = day
  })
  When(/^I record a pass with (\d+) notes, (\d+) hits, meanCents (-?\d+), (\d+) of (\d+) entries clean$/, (ctx, n, h, c, clean, e) =>
    ctx.h.recordPass('08', ['maria'], dayPass(+n, +h, +c, +clean, +e)),
  )
  Then(/^days has one entry "(.*)" with (.*)$/, async (ctx, day, list) => {
    const d = await ctx.h.days('08', ['maria'])
    expect(d).toHaveLength(1)
    expect(d[0].day).toBe(day)
    for (const [, k, v] of list.matchAll(/(\w+) (\d+)/g)) expect(d[0][k], k).toBe(+v)
  })
  Then(/^days lists (.*)$/, async (ctx, list) => {
    expect((await ctx.h.days('08', ['maria'])).map((d: any) => d.day)).toEqual([...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]))
  })
  When(/^I record two passes with section "(\w+)" twice, each 2 notes and 1 hit$/, async (ctx, name) => {
    for (let i = 0; i < 2; i++)
      await ctx.h.recordPass(
        '08',
        ['maria'],
        dayPass(4, 2, 0, 0, 0, [
          [name, 2, 1],
          [name, 2, 1],
        ]),
      )
  })
  Then(/^the day has section "(\w+)" with notes (\d+) and hits (\d+)$/, async (ctx, name, n, h) => {
    expect((await ctx.h.days('08', ['maria']))[0].sections[name]).toEqual({ notes: +n, hits: +h })
  })
  Given(/^(day "[^"]+" with \d+ notes, .*)$/, (ctx, list) => {
    ctx.days = []
    for (const [, day, n, h] of list.matchAll(/day "([^"]+)" with (\d+) notes, (\d+) hits/g))
      ctx.days.push({ ...EMPTY_DAY, day, passes: 1, notes: +n, hits: +h, sections: {} })
  })
  Given(/^day "(.*)" with centsSum (-?\d+) over 1 pass, (\d+) of (\d+) entries clean, section "(\w+)" (\d+) of (\d+) hits$/, (ctx, day, c, k, e, s, h, n) => {
    ctx.days ??= []
    ctx.days.push({ ...EMPTY_DAY, day, passes: 1, centsSum: +c, centsPasses: 1, entries: +e, cleanEntries: +k, sections: { [s]: { notes: +n, hits: +h } } })
  })
  When(/^I make the "(\w+)" bars up to "(.*)"$/, (ctx, span, today) => {
    ctx.bars = dayBars(ctx.days, span as 'week', today)
  })
  Then(/^the bars start "(.*)" and their hits are (.*)$/, (ctx, day, list) => {
    expect(ctx.bars[0].day).toBe(day)
    expect(ctx.bars.map((b: any) => b.hitPct ?? '-').join(', ')).toBe(list)
  })
  Then(/^the bars start "(.*)" and there are (\d+)$/, (ctx, day, n) => {
    expect(ctx.bars[0].day).toBe(day)
    expect(ctx.bars).toHaveLength(+n)
  })
  Then(/^the last bar has cents (-?\d+), cleanPct (\d+) and section "(\w+)" (\d+)$/, (ctx, c, k, s, v) => {
    expect(ctx.bars.at(-1)).toMatchObject({ cents: +c, cleanPct: +k, sections: { [s]: +v } })
  })
  Then(/^days for \[(\w+)\] is empty$/, async (ctx, role) => expect(await ctx.h.days('08', [role])).toEqual([]))
  When(/^wipe runs$/, (ctx) => ctx.lock())
  Then(/^every badge is null$/, async (ctx) => {
    expect(await ctx.h.badge('08', ['maria'])).toBeNull()
    expect(await ctx.h.badge('09', ['chor'])).toBeNull()
  })
})
