import { expect } from 'vitest'
// @ts-expect-error plain JS module, no types
import * as ops from '../../web/script-ops.js'
import { steps } from '../gherkin'

const { ScriptOpError, insertAfter, merge, setSay, setType, split } = ops

const script = (...items: any[]) => ({ scenes: [{ id: 's1', title: 'Eins', items }] })
const line = (id: string, role: string, text: string, say?: string) => ({ id, type: 'line', role, text, ...(say === undefined ? {} : { say }) })
const items = (ctx: any) => ctx.s.scenes[0].items
const item = (ctx: any, id: string) => items(ctx).find((i: any) => i.id === id)

// ctx.before keeps the script an op started from; a refused op leaves ctx.s alone
function run(ctx: any, op: () => unknown) {
  ctx.before = structuredClone(ctx.s)
  ctx.error = undefined
  try {
    ctx.s = op()
  } catch (e) {
    expect(e).toBeInstanceOf(ScriptOpError)
    ctx.error = (e as Error).message
  }
}

export default steps(({ Given, When, Then }) => {
  Given(/^a line "(\w+)" of (\w+) with text "([^"]+)" and say "([^"]+)"$/, (ctx, id, role, text, say) => {
    ctx.s = script(line(id, role, text, say))
  })
  Given(/^a line "(\w+)" with text "([^"]+)"$/, (ctx, id, text) => {
    ctx.s = script(line(id, 'lena', text))
  })
  Given(/^lines "(\w+)" and "(\w+)" of (\w+) with texts "([^"]+)" and "([^"]+)"$/, (ctx, a, b, role, ta, tb) => {
    ctx.s = script(line(a, role, ta), line(b, role, tb))
  })
  Given(/^line "(\w+)" of (\w+) followed by line "(\w+)" of (\w+)$/, (ctx, a, ra, b, rb) => {
    ctx.s = script(line(a, ra, 'Eins.'), line(b, rb, 'Zwei.'))
  })
  Given(/^a line "(\w+)" of (\w+) with say "([^"]*)"$/, (ctx, id, role, say) => {
    ctx.s = script(line(id, role, 'Text.', say))
  })
  Given(/^a line "(\w+)" with say "([^"]*)"$/, (ctx, id, say) => {
    ctx.s = script(line(id, 'lena', 'Text.', say))
  })
  Given(/^a direction "(\w+)"$/, (ctx, id) => {
    ctx.s = script({ id, type: 'direction', text: 'Sie geht.' })
  })
  Given(/^a script with items "(\w+)" and "(\w+)"$/, (ctx, a, b) => {
    ctx.s = script({ id: a, type: 'direction', text: 'A.' }, { id: b, type: 'direction', text: 'B.' })
  })

  When(/^I split it at offset (\d+)$/, (ctx, offset) => {
    run(ctx, () => split(ctx.s, items(ctx)[0].id, Number(offset)))
  })
  When(/^I merge "(\w+)"$/, (ctx, id) => {
    run(ctx, () => merge(ctx.s, id))
  })
  When(/^I set its type to direction$/, (ctx) => {
    run(ctx, () => setType(ctx.s, items(ctx)[0].id, 'direction'))
  })
  When(/^I set its type to line without role$/, (ctx) => {
    run(ctx, () => setType(ctx.s, items(ctx)[0].id, 'line'))
  })
  When(/^I set its type to line with role (\w+)$/, (ctx, role) => {
    run(ctx, () => setType(ctx.s, items(ctx)[0].id, 'line', role))
  })
  When(/^I set say to "([^"]*)"$/, (ctx, say) => {
    run(ctx, () => setSay(ctx.s, items(ctx)[0].id, say))
  })
  When(/^I insert a direction after "(\w+)"$/, (ctx, id) => {
    run(ctx, () => insertAfter(ctx.s, id, { type: 'direction', text: 'Neu.' }))
  })

  Then(/^"(\w+)" has text "([^"]+)" and no say$/, (ctx, id, text) => {
    expect(item(ctx, id)).toMatchObject({ text })
    expect('say' in item(ctx, id)).toBe(false)
  })
  Then(/^the next item is a line of (\w+) with text "([^"]+)" and a new id$/, (ctx, role, text) => {
    const [first, next] = items(ctx)
    expect(next).toMatchObject({ type: 'line', role, text })
    expect('say' in next).toBe(false)
    expect(next.id).toMatch(/^[a-z0-9]{4}$/)
    expect(next.id).not.toBe(first.id)
  })
  Then(/^it fails and the script is unchanged$/, (ctx) => {
    expect(ctx.error).toBeTruthy()
    expect(ctx.s).toEqual(ctx.before)
  })
  Then(/^it fails(?: with a message)?$/, (ctx) => {
    expect(ctx.error).toMatch(/\S/)
  })
  Then(/^"(\w+)" has text "([^"]+)" and "(\w+)" is gone$/, (ctx, id, text, gone) => {
    expect(item(ctx, id).text).toBe(text)
    expect(item(ctx, gone)).toBeUndefined()
  })
  Then(/^"(\w+)" is a direction without role and say$/, (ctx, id) => {
    const it = item(ctx, id)
    expect(it.type).toBe('direction')
    expect('role' in it || 'say' in it).toBe(false)
  })
  Then(/^"(\w+)" is a line of (\w+)$/, (ctx, id, role) => {
    expect(item(ctx, id)).toMatchObject({ type: 'line', role })
  })
  Then(/^"(\w+)" has no say$/, (ctx, id) => {
    expect('say' in item(ctx, id)).toBe(false)
  })
  Then(/^the new item sits between them with an id that is neither$/, (ctx) => {
    const ids = items(ctx).map((i: any) => i.id)
    expect(ids).toHaveLength(3)
    expect(ids[0]).toBe('aaaa')
    expect(ids[2]).toBe('bbbb')
    expect(ids[1]).toMatch(/^[a-z0-9]{4}$/)
  })
})
