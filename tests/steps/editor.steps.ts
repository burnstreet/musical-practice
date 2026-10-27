import { expect } from 'vitest'
// @ts-expect-error plain JS module, no types
import { setRole, togglePhraseStart } from '../../web/edit-ops.js'
import { steps } from '../gherkin'

export default steps(({ Given, When, Then }) => {
  Given(/^a loaded song with notes 1-4 and notes 2-3 selected$/, (ctx) => {
    ctx.song = { notes: [0, 1, 2, 3].map((i) => ({ midi: 60 + i, role: 'maria' })) }
    ctx.selected = new Set([1, 2])
  })
  When(/^I choose role "(\w+)" and press "Rolle setzen"$/, (ctx, role) => {
    setRole(ctx.song.notes, ctx.selected, role)
  })
  Then(/^notes 2 and 3 have role "(\w+)" and notes 1 and 4 are unchanged$/, (ctx, role) => {
    expect(ctx.song.notes.map((n: any) => n.role)).toEqual(['maria', role, role, 'maria'])
  })

  Given(/^note 3 selected without phraseStart$/, (ctx) => {
    ctx.song = { notes: [0, 1, 2].map((i) => ({ midi: 60 + i })) }
    ctx.selected = new Set([2])
  })
  When(/^I press "Phrasenanfang"(?: again)?$/, (ctx) => {
    togglePhraseStart(ctx.song.notes, ctx.selected)
  })
  Then(/^note 3 has phraseStart true$/, (ctx) => {
    expect(ctx.song.notes[2].phraseStart).toBe(true)
  })
  Then(/^note 3 has no phraseStart$/, (ctx) => {
    expect('phraseStart' in ctx.song.notes[2]).toBe(false)
  })
})
