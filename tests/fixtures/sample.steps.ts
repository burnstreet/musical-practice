import { expect } from 'vitest'
import { steps } from '../gherkin'

export default steps(({ Given, When, Then }) => {
  Given(/^the number "(\d+)"$/, (ctx, n) => {
    ctx.numbers = [...(ctx.numbers ?? []), Number(n)]
  })
  When(/^I add them$/, (ctx) => {
    ctx.sum = ctx.numbers.reduce((a: number, b: number) => a + b, 0)
  })
  When(/^I add "(\d+)" more$/, async (ctx, n) => {
    ctx.sum += Number(n)
  })
  Then(/^the sum is "(\d+)"$/, (ctx, n) => {
    expect(ctx.sum ?? ctx.numbers.reduce((a: number, b: number) => a + b, 0)).toBe(Number(n))
  })
  Then(/^no numbers are stored$/, (ctx) => {
    expect(ctx).toEqual({})
  })
})
