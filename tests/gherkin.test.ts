import { describe, expect, it } from 'vitest'
import { parseSpec, runSpec, runSteps, steps } from './gherkin'

// End to end: the selected fixture scenarios run and pass as real Vitest tests.
runSpec('sample', 'tests/fixtures/sample.steps.ts', 'tests/fixtures')

describe('gherkin runner', () => {
  it('selects only blocks whose nearest [@test] link is the step file', () => {
    const features = parseSpec('tests/fixtures/sample.spec.md', 'tests/fixtures/sample.steps.ts')
    expect(features.map((f) => f.name)).toEqual(['Adding', 'Second block'])
    expect(features[0].scenarios.map((s) => s.name)).toEqual(['captures and any keyword', 'fresh context'])
    expect(features[0].scenarios[0].steps).toEqual([
      'the number "2"',
      'the number "3"',
      'I add them',
      'the sum is "5"',
      'I add "4" more',
      'the sum is "9"',
    ])
  })

  it('throws on an unmatched step', async () => {
    const registry = steps(({ Given }) => Given(/^known$/, () => {}))
    await expect(runSteps(registry, ['known', 'unknown thing'])).rejects.toThrow('Unmatched step: unknown thing')
  })

  it('passes regex captures as strings', async () => {
    const seen: unknown[] = []
    const registry = steps(({ When }) => When(/^(\d+) and "(.*)"$/, (_ctx, a, b) => void seen.push(a, b)))
    await runSteps(registry, ['7 and "x y"'])
    expect(seen).toEqual(['7', 'x y'])
  })
})
